const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Stripe = require('stripe');
const { analyzeFile, analyzeTextInput } = require('./analyzer');
const { analyzeAIFile, analyzeAIText, VERSION } = require('./review-engine');
const { validateArchive, repairFilename } = require('./evidence-document');
const { analyzeFingerprintFile } = require('./fingerprint-lab');
const { buildAuthorshipMap } = require('./authorship-map');
const { analyzeMultimodal } = require('./multimodal-engine');
const { analyzeAdvancedImage } = require('./advanced-image-forensics');
const { installAdminApi } = require('./admin-api');
const app = express();
const PORT = Number(process.env.PORT || 8080);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
const daily = new Map();
function rate(req,res,next){
  const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').toString().split(',')[0].trim();
  const day=new Date().toISOString().slice(0,10), key=day+':'+ip; const n=daily.get(key)||0;
  if(n>=30) return res.status(429).json({error:'Daily demo scan limit reached for this network.'});
  daily.set(key,n+1); res.setHeader('X-EMET-Demo-Remaining',String(29-n)); next();
}
const plans = [
  {id:'free',name:'Free',price:0,period:'once',scans:1,maxMb:15,features:['1 full file scan','Deep metadata and structure view','Text style signals','No card required']},
  {id:'lite',name:'Lite',price:19,period:'month',scans:50,maxMb:25,features:['50 scans each month','DOCX, PDF, images, email, text and code','Revision and metadata forensics','Saved reports']},
  {id:'pro',name:'Pro',price:49,period:'month',scans:300,maxMb:50,features:['300 scans each month','Advanced provenance and contradiction signals','Batch comparison','Priority processing']},
  {id:'business',name:'Business',price:149,period:'month',scans:2000,maxMb:100,features:['2,000 scans each month','Team workspace','API access','Connected evidence sources','Audit export']}
];
const priceIds = {lite:process.env.STRIPE_PRICE_LITE,pro:process.env.STRIPE_PRICE_PRO,business:process.env.STRIPE_PRICE_BUSINESS};

async function lookupExactGroundTruth(buffer){
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY||!process.env.EMET_INTERNAL_DB_TOKEN)return null;
  const sha256=crypto.createHash('sha256').update(buffer).digest('hex');
  try{
    const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/lookup_ground_truth_sha_internal`,{
      method:'POST',
      headers:{'content-type':'application/json','apikey':process.env.SUPABASE_PUBLISHABLE_KEY,'authorization':`Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY}`},
      body:JSON.stringify({p_sha256:sha256,p_token:process.env.EMET_INTERNAL_DB_TOKEN})
    });
    if(!r.ok)return {sha256,matched:false};
    const rows=await r.json();
    const row=Array.isArray(rows)?rows[0]:null;
    return row?{sha256,matched:true,...row}:{sha256,matched:false};
  }catch{return {sha256,matched:false};}
}

function applyExactGroundTruth(aiAnalysis,match){
  if(!match?.matched||!aiAnalysis?.assessment)return;
  const gt={exact:true,label:match.label,language:match.language||null,sourceNote:match.source_note||null,sha256:match.sha256,evidenceClass:'known_ground_truth_exact_file'};
  aiAnalysis.assessment.groundTruthMatch=gt;
  if(aiAnalysis.assessment.authorshipMap?.supported&&match.label==='ai'){
    const m=aiAnalysis.assessment.authorshipMap;
    m.knownGroundTruth=gt;
    m.estimatedAIShare=100;
    m.documentSignalScore=100;
    m.method='exact SHA-256 match to a user-confirmed AI ground-truth file; paragraph map below remains diagnostic';
    for(const item of m.items||[]){
      item.groundTruth='ai';
      item.label='strong_ai_signal';
      item.score=100;
      item.explanation='This exact file matches a user-confirmed AI ground-truth sample by SHA-256. The 100 score here is recognition of the labeled file, not a generic AI-detector probability.';
    }
    m.counts={strongAI:(m.items||[]).length,likelyAI:0,humanEditCandidates:0,mixed:0,low:0};
  }
}

app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});
app.get('/api/health',(req,res)=>res.json({ok:true,service:'emet-one',version:'0.9.2',engine:VERSION,fingerprint:'EMET-FINGERPRINT-LAB-2026.09.12',authorshipMap:'EMET-AI-ORIGIN-MAP-2026.09.12.2',groundTruth:'EMET-GT-EXACT-2026.09.12',adminLab:'EMET-LAB-2026.09.12',multimodal:'EMET-MULTIMODAL-2026.09.13',imageMap:'EMET-IMAGE-MAP-2026.09.13',visionFusion:'EMET-VISION-FUSION-2026.09.13'}));
app.get('/api/engine',(req,res)=>res.json({
  engine:VERSION,
  textClassifier:{status:'not_configured',trained:false,validatedLanguages:[],calibratedProbabilityAvailable:false},
  localPanels:['Unicode word segmentation','contextual AI disclosures','assistant phrase locations','DOCX visible text mapping','DOCX run fingerprint','220–440 word authorship context windows','exact labeled-file SHA-256 recognition'],
  forensicLayers:['OOXML metadata','tracked revisions','C2PA SDK validation states','PDF signature inspection','EXIF/XMP','pixel statistics','OCR','audio waveform baseline','video frame sampling','image forensic attention map','multi-scale image residual fusion','camera-capture evidence','regional image localization'],
  localBinaries:['tesseract','ffmpeg','ffprobe','pdfinfo','pdfsig','pdftotext','pdftoppm','qpdf'],
  principle:'Known labeled files are recognized exactly by hash. Unknown files use evidence fusion. Origin-map values are evidence scores, not generic calibrated AI probabilities.'
}));
app.get('/api/plans',(req,res)=>res.json({currency:'USD',plans}));
app.get('/api/config',(req,res)=>res.json({
  googleAuthConfigured:Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY),
  supabaseUrl:process.env.SUPABASE_URL||null,supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||null,
  billingConfigured:Boolean(process.env.STRIPE_SECRET_KEY && Object.values(priceIds).some(Boolean)),
  detectionProviders:{c2pa:true,localUltimateEnsemble:true,localFingerprintLab:true,localMultimodal:true,privateGroundTruth:true,imageAttentionMap:true,visionFusion:true},
  textClassifier:{status:'not_configured',trained:false},freeScans:1,maxUploadMb:15
}));

installAdminApi(app);

app.post('/api/analyze', rate, upload.single('file'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'Choose a file first.'});
    req.file.originalname=repairFilename(req.file.originalname);
    const ext=path.extname(req.file.originalname).toLowerCase();
    const isImage=['.jpg','.jpeg','.png','.webp','.tif','.tiff'].includes(ext);
    if(['.docx','.docm','.xlsx','.xlsm','.pptx','.pptm'].includes(ext))validateArchive(req.file.buffer);
    const [result, aiAnalysis, fingerprintLab, multimodal, exactGroundTruth] = await Promise.all([
      analyzeFile(req.file), analyzeAIFile(req.file),
      Promise.resolve().then(()=>analyzeFingerprintFile(req.file)).catch(e=>({supported:false,status:'failed',error:e.message})),
      analyzeMultimodal(req.file).catch(e=>({status:'failed',error:e.message})),
      lookupExactGroundTruth(req.file.buffer)
    ]);
    if(isImage && multimodal?.kind==='image'){
      try{multimodal.visionFusion=await analyzeAdvancedImage(req.file.buffer,multimodal);}catch(e){multimodal.visionFusion={status:'failed',error:e.message};}
    }
    aiAnalysis.fingerprintLab=fingerprintLab;
    if(['.docx','.docm'].includes(ext)){
      try{aiAnalysis.assessment.authorshipMap=buildAuthorshipMap(req.file,aiAnalysis,fingerprintLab);}catch(e){aiAnalysis.assessment.authorshipMap={supported:false,status:'failed',error:e.message};}
    }
    applyExactGroundTruth(aiAnalysis,exactGroundTruth);
    if(aiAnalysis.assessment?.metadata)result.metadata={...result.metadata,...aiAnalysis.assessment.metadata};
    res.json({...result,aiAnalysis,multimodal,groundTruth:exactGroundTruth});
  }catch(e){ console.error('File inspection failed:',e.message);res.status(e.statusCode||422).json({error:'File inspection could not complete.',detail:e.message,status:'failed'}); }
});
app.post('/api/analyze-text', rate, async (req,res)=>{
  try{
    const text=String(req.body?.text||'');if(text.trim().length<30)return res.status(400).json({error:'Paste at least 30 characters.'});
    if(text.length>250000)return res.status(413).json({error:'Text sample is too large for the demo.'});
    const [base,aiAnalysis]=await Promise.all([Promise.resolve(analyzeTextInput(text)),analyzeAIText(text)]);
    res.json({...base,aiAnalysis,multimodal:{kind:'text',status:'not_applicable',reason:'Text-only input has no image, audio, video or document-container layer.'}});
  }catch(e){console.error('Text inspection failed:',e.message);res.status(e.statusCode||422).json({error:'Text inspection could not complete.',detail:e.message,status:'failed'});}
});
app.post('/api/create-checkout-session', async (req,res)=>{
  try{
    const plan=String(req.body?.plan||'').toLowerCase(),price=priceIds[plan];
    if(!['lite','pro','business'].includes(plan))return res.status(400).json({error:'Unknown plan.'});
    if(!process.env.STRIPE_SECRET_KEY||!price)return res.status(503).json({error:'Billing is not connected yet.'});
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY),base=`${req.headers['x-forwarded-proto']||req.protocol}://${req.get('host')}`;
    const params={mode:'subscription',line_items:[{price,quantity:1}],success_url:`${base}/account.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${base}/pricing.html?checkout=cancelled`,allow_promotion_codes:true};
    const email=String(req.body?.email||'').trim();if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))params.customer_email=email;
    const userId=String(req.body?.userId||'').trim();if(userId)params.client_reference_id=userId.slice(0,200);
    const session=await stripe.checkout.sessions.create(params);res.json({url:session.url});
  }catch(e){console.error(e);res.status(500).json({error:'Could not open checkout.',detail:e.message});}
});
function htmlFor(file){
  const full=path.join(__dirname,file);if(!fs.existsSync(full))return null;
  let html=fs.readFileSync(full,'utf8');
  html=html.replace(/<span class="mark">E1<\/span>/g,'<img class="brandLogo" src="/logo-emet-one.svg" alt="EMET ONE">');
  html=html.replace(/<img src="\/logo-emet-one\.svg" alt="EMET ONE"[^>]*>/g,'<img class="brandLogo" src="/logo-emet-one.svg" alt="EMET ONE">');
  if(!html.includes('/brand.css'))html=html.replace('</head>','<link rel="stylesheet" href="/brand.css"></head>');
  if(!html.includes('href="/pricing.html"')&&file!=='admin-lab.html')html=html.replace('</div><a class="navcta"','<a href="/pricing.html">Pricing</a></div><a class="navcta"');
  if(file==='verify.html'){
    html=html.replace('</head>','<link rel="stylesheet" href="/review.css?v=20260913-3"></head>');
    html=html.replace(/src="\/(app|fingerprint-ui|media-mode-fix|multimodal-ui|scanner)\.js(?:\?[^\"]*)?"/g,'src="/$1.js?v=20260913-3"');
    html=html.replace(/href="\/(multimodal|media-mode-fix)\.css(?:\?[^\"]*)?"/g,'href="/$1.css?v=20260913-3"');
    html=html.replace('</body>','<script src="/review-ui.js?v=20260913-3"></script></body>');
  }
  return html;
}
app.use((req,res,next)=>{
  if(req.method!=='GET')return next();
  const f=req.path==='/'?'index.html':/^\/[a-z0-9_-]+\.html$/i.test(req.path)?path.basename(req.path):null;
  if(!f)return next();const html=htmlFor(f);if(!html)return next();res.setHeader('Cache-Control','no-store, max-age=0');res.type('html').send(html);
});
const publicScripts=new Set(['app.js','scanner.js','fingerprint-ui.js','multimodal-ui.js','media-mode-fix.js','account.js','review-ui.js','admin-lab.js']);
app.use((req,res,next)=>{
  const ext=path.extname(req.path).toLowerCase();
  if(req.path.startsWith('/api/')||!(ext==='.js'?publicScripts.has(req.path.slice(1)):['.css','.svg','.png','.jpg','.jpeg','.webp','.ico','.html'].includes(ext)))return res.status(404).json({error:'Not found'});
  if(['.js','.css'].includes(ext))res.setHeader('Cache-Control','no-cache, no-store, must-revalidate');
  next();
});
app.use(express.static(__dirname,{extensions:['html'],maxAge:'5m'}));
app.use((err,req,res,next)=>{if(err)return res.status(err.code==='LIMIT_FILE_SIZE'?413:400).json({status:'failed',error:err.code==='LIMIT_FILE_SIZE'?'The upload exceeds 15 MB.':'The upload could not be read.'});next()});
app.use((req,res)=>res.status(404).sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,()=>console.log(`EMET ONE ${VERSION} listening on ${PORT}`));
