const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');
const { analyzeFile, analyzeTextInput } = require('./analyzer');
const { analyzeAIFile, analyzeAIText } = require('./ultimate-engine');
const { analyzeFingerprintFile } = require('./fingerprint-lab');
const { analyzeMultimodal } = require('./multimodal-engine');

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

app.get('/api/health',(req,res)=>res.json({ok:true,service:'emet-one',version:'0.7.0',engine:'EMET-AI-ULTIMATE-2026.09.12',fingerprint:'EMET-FINGERPRINT-LAB-2026.09.12',multimodal:'EMET-MULTIMODAL-2026.09.12'}));
app.get('/api/engine',(req,res)=>res.json({
  engine:'EMET-AI-ULTIMATE-2026.09.12',
  fingerprint:'EMET-FINGERPRINT-LAB-2026.09.12',
  multimodal:'EMET-MULTIMODAL-2026.09.12',
  localPanels:['rhythm','lexical','discourse','surface-style','predictability','AI-residue','document-process','DOCX run fingerprint'],
  forensicLayers:['C2PA','OOXML timeline','ZIP/core timestamp conflicts','revision trace density','DOCX paragraph/run locators','RSID edit-session boundaries','tracked insertions/deletions','run-style/proofing anomalies','PDF incremental updates','PDF signature inspection','qpdf structural validation','EXIF/XMP','JPEG recompression map','pixel noise/edge statistics','copy-move patch screening','local OCR Hebrew/English/Arabic','receipt arithmetic screening','audio waveform baseline','video frame sampling','Unicode evasion','mixed-authorship windows'],
  localBinaries:['tesseract','ffmpeg','ffprobe','pdfinfo','pdfsig','pdftotext','pdftoppm','qpdf'],
  principle:'Verified attribution is reserved for evidence-backed provenance. Local forensic and classifier signals remain separate, versioned, and explicit about coverage.'
}));
app.get('/api/plans',(req,res)=>res.json({currency:'USD',plans}));
app.get('/api/config',(req,res)=>res.json({
  googleAuthConfigured:Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY),
  supabaseUrl:process.env.SUPABASE_URL||null,
  supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||null,
  billingConfigured:Boolean(process.env.STRIPE_SECRET_KEY && Object.values(priceIds).some(Boolean)),
  detectionProviders:{c2pa:true,localUltimateEnsemble:true,localFingerprintLab:true,localMultimodal:true},
  freeScans:1,
  maxUploadMb:15
}));

app.post('/api/analyze', rate, upload.single('file'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'Choose a file first.'});
    const [result, aiAnalysis, fingerprintLab, multimodal] = await Promise.all([
      analyzeFile(req.file),
      analyzeAIFile(req.file).catch(e=>({version:'EMET-AI-ULTIMATE-2026.09.12',final:{verdict:'INCONCLUSIVE',confidence:'low',canProve:false,reason:'The AI/provenance layer could not complete.',evidenceGrade:'engine error'},error:e.message})),
      Promise.resolve().then(()=>analyzeFingerprintFile(req.file)).catch(e=>({supported:false,error:e.message})),
      analyzeMultimodal(req.file).catch(e=>({status:'failed',error:e.message}))
    ]);
    if(aiAnalysis&&typeof aiAnalysis==='object') aiAnalysis.fingerprintLab=fingerprintLab;
    res.json({...result,aiAnalysis,multimodal});
  }catch(e){ console.error(e); res.status(500).json({error:'The file could not be analyzed.',detail:e.message}); }
});
app.post('/api/analyze-text', rate, async (req,res)=>{
  try{
    const text=String(req.body?.text||'').trim(); if(text.length<30) return res.status(400).json({error:'Paste at least 30 characters.'});
    if(text.length>250000) return res.status(413).json({error:'Text sample is too large for the demo.'});
    const [base, aiAnalysis]=await Promise.all([Promise.resolve(analyzeTextInput(text)),analyzeAIText(text)]);
    res.json({...base,aiAnalysis,multimodal:{kind:'text',status:'not_applicable',reason:'Text-only input has no image, audio, video or document-container layer.'}});
  }catch(e){console.error(e);res.status(500).json({error:'The text could not be analyzed.',detail:e.message});}
});
app.post('/api/create-checkout-session', async (req,res)=>{
  try{
    const plan=String(req.body?.plan||'').toLowerCase(); const price=priceIds[plan];
    if(!['lite','pro','business'].includes(plan)) return res.status(400).json({error:'Unknown plan.'});
    if(!process.env.STRIPE_SECRET_KEY || !price) return res.status(503).json({error:'Billing is not connected yet.'});
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
    const base=`${req.headers['x-forwarded-proto']||req.protocol}://${req.get('host')}`;
    const params={mode:'subscription',line_items:[{price,quantity:1}],success_url:`${base}/account.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${base}/pricing.html?checkout=cancelled`,allow_promotion_codes:true};
    const email=String(req.body?.email||'').trim(); if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) params.customer_email=email;
    const userId=String(req.body?.userId||'').trim(); if(userId) params.client_reference_id=userId.slice(0,200);
    const session=await stripe.checkout.sessions.create(params); res.json({url:session.url});
  }catch(e){ console.error(e); res.status(500).json({error:'Could not open checkout.',detail:e.message}); }
});

function htmlFor(file){
  const full=path.join(__dirname,file); if(!fs.existsSync(full)) return null;
  let html=fs.readFileSync(full,'utf8');
  html=html.replace(/<span class="mark">E1<\/span>/g,'<img class="brandLogo" src="/logo-emet-one.svg" alt="EMET ONE">');
  html=html.replace(/<img src="\/logo-emet-one\.svg" alt="EMET ONE"[^>]*>/g,'<img class="brandLogo" src="/logo-emet-one.svg" alt="EMET ONE">');
  if(!html.includes('/brand.css')) html=html.replace('</head>','<link rel="stylesheet" href="/brand.css"></head>');
  if(!html.includes('href="/pricing.html"')) html=html.replace('</div><a class="navcta"','<a href="/pricing.html">Pricing</a></div><a class="navcta"');
  return html;
}
app.use((req,res,next)=>{
  if(req.method!=='GET') return next();
  let f=null;
  if(req.path==='/') f='index.html';
  else if(/^\/[a-z0-9_-]+\.html$/i.test(req.path)) f=path.basename(req.path);
  if(!f) return next();
  const html=htmlFor(f); if(!html) return next();
  res.type('html').send(html);
});
app.use(express.static(__dirname,{extensions:['html'],maxAge:'5m'}));
app.use((req,res)=>res.status(404).sendFile(path.join(__dirname,'index.html')));
app.listen(PORT,()=>console.log(`EMET ONE listening on ${PORT}`));
