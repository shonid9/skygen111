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
const { analyzeDeepContainer } = require('./deep-container-forensics');
const { matchPerceptualGroundTruth } = require('./image-perceptual-ground-truth');
const { installAdminApi } = require('./admin-api');
const { requireUser, requireScanAccess, accountStatus } = require('./access-control');
const app = express();
const PORT = Number(process.env.PORT || 8080);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
app.disable('x-powered-by');
app.post('/api/stripe-webhook',express.raw({type:'application/json',limit:'1mb'}),stripeWebhookHandler);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
const plans = [
  {id:'free',name:'Free',price:0,period:'once',scans:1,maxMb:15,features:['1 full file scan','Deep metadata and structure view','Text style signals','Google sign-in required']},
  {id:'lite',name:'Lite',price:19,period:'month',scans:50,maxMb:25,features:['50 scans each month','DOCX, PDF, images, email, text and code','Revision and metadata forensics','Saved reports']},
  {id:'pro',name:'Pro',price:49,period:'month',scans:300,maxMb:50,features:['300 scans each month','Advanced provenance and contradiction signals','Batch comparison','Priority processing']},
  {id:'business',name:'Business',price:149,period:'month',scans:2000,maxMb:100,features:['2,000 scans each month','Team workspace','API access','Connected evidence sources','Audit export']}
];
const priceIds = {lite:process.env.STRIPE_PRICE_LITE,pro:process.env.STRIPE_PRICE_PRO,business:process.env.STRIPE_PRICE_BUSINESS};
const priceToPlan=()=>Object.fromEntries(Object.entries(priceIds).filter(([,id])=>id).map(([plan,id])=>[id,plan]));

function serviceRoleConfigured(){return Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY)}

async function supabaseAdmin(pathname,{method='GET',body,headers={}}={}){
  if(!serviceRoleConfigured())throw new Error('Supabase server credentials are not configured.');
  const r=await fetch(`${process.env.SUPABASE_URL}${pathname}`,{
    method,
    headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,...(body?{'content-type':'application/json'}:{}),...headers},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const text=await r.text();
  if(!r.ok)throw new Error(`Supabase request failed (${r.status}): ${text.slice(0,300)}`);
  return text?JSON.parse(text):null;
}

async function persistScan(user,file,result){
  if(!user?.id||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return;
  const row={
    user_id:user.id,
    filename:file.originalname,
    mime_type:file.mimetype||null,
    size_bytes:file.size,
    sha256:result?.file?.sha256||crypto.createHash('sha256').update(file.buffer).digest('hex'),
    engine:VERSION,
    risk_score:Number(result?.summary?.riskScore??result?.aiAnalysis?.final?.score??0)||null,
    ai_style_score:Number(result?.aiAnalysis?.local?.ensemble?.score??result?.aiAnalysis?.local?.style?.localScore??0)||null,
    summary:result?.summary||{},
    findings:Array.isArray(result?.findings)?result.findings:[],
    metadata:result?.metadata||{}
  };
  await supabaseAdmin('/rest/v1/scans',{method:'POST',body:row,headers:{prefer:'return=minimal'}});
}

function safeStoragePath(userId,objectPath){
  const value=String(objectPath||'');
  if(!value||value.includes('..')||value.startsWith('/')||!value.startsWith(`${userId}/`))return null;
  return value;
}

function encodeStoragePath(value){return value.split('/').map(encodeURIComponent).join('/')}

async function downloadPrivateUpload(userId,accessToken,objectPath,originalName,mimeType){
  const safePath=safeStoragePath(userId,objectPath);
  if(!safePath)throw Object.assign(new Error('Invalid upload path.'),{statusCode:400});
  const r=await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/authenticated/scan-files/${encodeStoragePath(safePath)}`,{
    headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${accessToken}`}
  });
  if(!r.ok)throw Object.assign(new Error(`Private upload could not be read (${r.status}).`),{statusCode:r.status===404?404:502});
  const length=Number(r.headers.get('content-length')||0),maxMb=plans.find(p=>p.id==='business')?.maxMb||100;
  if(length>maxMb*1024*1024)throw Object.assign(new Error('The upload exceeds the maximum file size.'),{statusCode:413});
  const buffer=Buffer.from(await r.arrayBuffer());
  return {buffer,size:buffer.length,originalname:repairFilename(String(originalName||path.basename(safePath))),mimetype:String(mimeType||r.headers.get('content-type')||'application/octet-stream')};
}

async function deletePrivateUpload(accessToken,objectPath){
  try{
    await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/scan-files`,{
      method:'DELETE',headers:{'content-type':'application/json',apikey:process.env.SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${accessToken}`},body:JSON.stringify({prefixes:[objectPath]})
    });
  }catch{}
}

async function stripeWebhookHandler(req,res){
  if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET||!serviceRoleConfigured())return res.status(503).send('Billing is not configured.');
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;
  try{event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET)}
  catch(e){return res.status(400).send(`Invalid webhook: ${e.message}`)}
  try{
    const object=event.data.object||{};
    let subscription=object,customerId=String(object.customer||''),subscriptionId=String(object.id||''),status=String(object.status||'');
    if(event.type==='checkout.session.completed'){
      subscriptionId=String(object.subscription||'');customerId=String(object.customer||'');status='active';
      if(subscriptionId)subscription=await stripe.subscriptions.retrieve(subscriptionId);
    }
    if(!['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'].includes(event.type))return res.json({received:true});
    if(event.type.startsWith('invoice.')){
      subscriptionId=String(object.subscription||'');customerId=String(object.customer||'');
      if(subscriptionId)subscription=await stripe.subscriptions.retrieve(subscriptionId);
      status=event.type==='invoice.payment_failed'?'past_due':String(subscription.status||'active');
    }
    const userId=String(subscription.metadata?.supabase_user_id||object.metadata?.supabase_user_id||object.client_reference_id||'');
    const priceId=subscription.items?.data?.[0]?.price?.id||object.metadata?.price_id;
    const plan=priceToPlan()[priceId]||String(subscription.metadata?.plan||object.metadata?.plan||'free');
    if(!userId)throw new Error('Webhook is missing the Supabase user id.');
    await supabaseAdmin('/rest/v1/rpc/apply_billing_state_internal',{method:'POST',body:{p_user_id:userId,p_plan:plan,p_status:status||'inactive',p_customer_id:customerId||null,p_subscription_id:subscriptionId||null,p_provider_event_id:event.id,p_payload:{type:event.type,created:event.created},p_token:process.env.EMET_INTERNAL_DB_TOKEN}});
    res.json({received:true});
  }catch(e){console.error('Stripe webhook failed:',e.message);res.status(500).send('Webhook processing failed.');}
}

async function lookupExactGroundTruth(buffer){
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.EMET_INTERNAL_DB_TOKEN)return null;
  const sha256=crypto.createHash('sha256').update(buffer).digest('hex');
  try{
    const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/lookup_ground_truth_sha_internal`,{
      method:'POST',
      headers:{'content-type':'application/json','apikey':process.env.SUPABASE_SERVICE_ROLE_KEY,'authorization':`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`},
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
      item.groundTruth='ai'; item.label='strong_ai_signal'; item.score=100;
      item.explanation='This exact file matches a user-confirmed AI ground-truth sample by SHA-256. The 100 score here is recognition of the labeled file, not a generic AI-detector probability.';
    }
    m.counts={strongAI:(m.items||[]).length,likelyAI:0,humanEditCandidates:0,mixed:0,low:0};
  }
}

app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});
app.get('/api/health',(req,res)=>res.json({ok:true,service:'emet-one',version:'0.9.5',engine:VERSION,fingerprint:'EMET-FINGERPRINT-LAB-2026.09.12',authorshipMap:'EMET-AI-ORIGIN-MAP-2026.09.12.2',groundTruth:'EMET-GT-EXACT+PERCEPTUAL-2026.09.13',adminLab:'EMET-LAB-2026.09.12',multimodal:'EMET-MULTIMODAL-2026.09.13',imageMap:'EMET-IMAGE-MAP-2026.09.13',visionFusion:'EMET-VISION-FUSION-2026.09.13.3',deepLineage:'EMET-DEEP-LINEAGE-2026.09.13',accessControl:'ACCOUNT-BOUND-SCAN-ENTITLEMENTS-2026.09.13'}));
app.get('/api/engine',(req,res)=>res.json({
  engine:VERSION,
  textClassifier:{status:'not_configured',trained:false,validatedLanguages:[],calibratedProbabilityAvailable:false},
  localPanels:['Unicode word segmentation','contextual AI disclosures','assistant phrase locations','DOCX visible text mapping','DOCX run fingerprint','220–440 word authorship context windows','exact labeled-file SHA-256 recognition','perceptual image ground-truth lineage matching'],
  forensicLayers:['OOXML metadata','tracked revisions','C2PA SDK validation states','PDF signature inspection','EXIF/XMP','pixel statistics','OCR','audio waveform baseline','video frame sampling','image forensic attention map','multi-scale image residual fusion','camera-capture evidence','regional image localization','JPEG marker and quantization-table inspection','PNG chunk history','OOXML package timestamp lineage','Word paraId/textId/session lineage','revision author/date graph','embedded object and external relationship inventory','aHash+dHash near-duplicate lineage recognition'],
  localBinaries:['tesseract','ffmpeg','ffprobe','pdfinfo','pdfsig','pdftotext','pdftoppm','qpdf'],
  principle:'Exact known files are verified by SHA-256. Re-encoded/resized variants can inherit evidence from perceptual ground-truth lineage when both perceptual hashes and aspect geometry agree. Unknown files use evidence fusion.'
}));
app.get('/api/plans',(req,res)=>res.json({currency:'USD',plans}));
app.get('/api/config',(req,res)=>res.json({
  googleAuthConfigured:process.env.GOOGLE_AUTH_ENABLED==='true',
  supabaseUrl:process.env.SUPABASE_URL||null,supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||null,
  billingConfigured:Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&serviceRoleConfigured()&&Object.values(priceIds).every(Boolean)),
  detectionProviders:{c2pa:true,localUltimateEnsemble:true,localFingerprintLab:true,localMultimodal:true,privateGroundTruth:true,perceptualGroundTruth:true,imageAttentionMap:true,visionFusion:true,deepContainerForensics:true},
  textClassifier:{status:'not_configured',trained:false},freeScans:1,maxUploadMb:15,freeScanRequiresAccount:true
}));
app.get('/api/account',requireUser,async(req,res)=>{try{res.json({user:{id:req.authUser.id,email:req.authUser.email},access:await accountStatus(req.authToken)})}catch(e){res.status(503).json({error:'Could not load account status.'})}});
app.get('/api/scans',requireUser,async(req,res)=>{
  try{
    const rows=await supabaseAdmin(`/rest/v1/scans?user_id=eq.${encodeURIComponent(req.authUser.id)}&select=id,filename,mime_type,size_bytes,risk_score,engine,created_at&order=created_at.desc&limit=25`);
    res.json({scans:Array.isArray(rows)?rows:[]});
  }catch(e){console.error('Scan history load failed:',e.message);res.status(503).json({error:'Could not load scan history.'});}
});

installAdminApi(app);

async function analyzeUploadedFile(file){
    if(!file)throw Object.assign(new Error('Choose a file first.'),{statusCode:400});
    file.originalname=repairFilename(file.originalname);
    const ext=path.extname(file.originalname).toLowerCase();
    const isImage=['.jpg','.jpeg','.png','.webp','.tif','.tiff'].includes(ext);
    if(['.docx','.docm','.xlsx','.xlsm','.pptx','.pptm'].includes(ext))validateArchive(file.buffer);
    const [result, aiAnalysis, fingerprintLab, multimodal, exactGroundTruth, deepForensics, perceptualGroundTruth] = await Promise.all([
      analyzeFile(file), analyzeAIFile(file),
      Promise.resolve().then(()=>analyzeFingerprintFile(file)).catch(e=>({supported:false,status:'failed',error:e.message})),
      analyzeMultimodal(file).catch(e=>({status:'failed',error:e.message})),
      lookupExactGroundTruth(file.buffer),
      Promise.resolve().then(()=>analyzeDeepContainer(file)).catch(e=>({kind:'deep_forensics',status:'failed',error:e.message})),
      isImage?matchPerceptualGroundTruth(file.buffer).catch(e=>({version:'EMET-PERCEPTUAL-GT-2026.09.13',status:'failed',error:e.message})):Promise.resolve(null)
    ]);
    if(isImage && multimodal?.kind==='image'){
      try{multimodal.visionFusion=await analyzeAdvancedImage(file.buffer,multimodal);}catch(e){multimodal.visionFusion={status:'failed',error:e.message};}
      multimodal.deepContainer=deepForensics;
      multimodal.perceptualGroundTruth=perceptualGroundTruth;
      const deepMarkers=deepForensics?.container?.generatorMarkers||[];
      if(deepMarkers.length&&multimodal.visionFusion?.aiOriginEstimate){
        multimodal.visionFusion.aiOriginEstimate.score=Math.max(98,Number(multimodal.visionFusion.aiOriginEstimate.score)||0);
        multimodal.visionFusion.aiOriginEstimate.confidence='very high';
        multimodal.visionFusion.aiOriginEstimate.signals=[...(multimodal.visionFusion.aiOriginEstimate.signals||[]),{id:'container_generator_marker',score:100,weight:.35,kind:'origin',markers:deepMarkers}];
      }
      if(!exactGroundTruth?.matched&&perceptualGroundTruth?.classification==='ai'&&perceptualGroundTruth?.bestAI?.similarity>=.90&&multimodal.visionFusion?.aiOriginEstimate){
        const p=perceptualGroundTruth;
        const boosted=Math.round(82+(Math.min(1,p.bestAI.similarity)-.90)*140+Math.max(0,p.contrastMargin-.045)*120);
        multimodal.visionFusion.aiOriginEstimate.score=Math.max(Number(multimodal.visionFusion.aiOriginEstimate.score)||0,Math.min(98,boosted));
        multimodal.visionFusion.aiOriginEstimate.confidence='high';
        multimodal.visionFusion.aiOriginEstimate.signals=[...(multimodal.visionFusion.aiOriginEstimate.signals||[]),{id:'perceptual_ground_truth_lineage',score:Math.round(p.bestAI.similarity*100),weight:.34,kind:'origin',margin:p.contrastMargin}];
      }
      if(!exactGroundTruth?.matched&&perceptualGroundTruth?.classification==='human'&&perceptualGroundTruth?.bestHuman?.similarity>=.90&&multimodal.visionFusion?.aiOriginEstimate){
        const p=perceptualGroundTruth;
        multimodal.visionFusion.aiOriginEstimate.score=Math.min(Number(multimodal.visionFusion.aiOriginEstimate.score)||100,Math.max(1,Math.round((1-p.bestHuman.similarity)*100+6)));
        multimodal.visionFusion.aiOriginEstimate.confidence='high';
        multimodal.visionFusion.aiOriginEstimate.signals=[...(multimodal.visionFusion.aiOriginEstimate.signals||[]),{id:'perceptual_original_lineage',score:Math.round(p.bestHuman.similarity*100),weight:.34,kind:'counter',margin:p.contrastMargin}];
      }
    }
    aiAnalysis.fingerprintLab=fingerprintLab;
    aiAnalysis.deepForensics=deepForensics;
    if(['.docx','.docm'].includes(ext)){
      try{aiAnalysis.assessment.authorshipMap=buildAuthorshipMap(file,aiAnalysis,fingerprintLab);}catch(e){aiAnalysis.assessment.authorshipMap={supported:false,status:'failed',error:e.message};}
      if(deepForensics?.kind==='docx_lineage') aiAnalysis.assessment.deepLineage=deepForensics;
    }
    applyExactGroundTruth(aiAnalysis,exactGroundTruth);
    if(aiAnalysis.assessment?.metadata)result.metadata={...result.metadata,...aiAnalysis.assessment.metadata};
    return {...result,aiAnalysis,multimodal,deepForensics,groundTruth:exactGroundTruth,perceptualGroundTruth};
}

async function respondWithAnalysis(req,res,file){
  const limitMb=plans.find(p=>p.id===(req.scanAccess?.plan||'free'))?.maxMb||15;
  if(file.size>limitMb*1024*1024)return res.status(413).json({error:`Your ${req.scanAccess?.plan||'free'} plan accepts files up to ${limitMb} MB.`});
  try{
    const result=await analyzeUploadedFile(file);
    await persistScan(req.authUser,file,result).catch(e=>console.error('Scan history save failed:',e.message));
    res.json({...result,access:req.scanAccess});
  }catch(e){console.error('File inspection failed:',e.message);res.status(e.statusCode||422).json({error:'File inspection could not complete.',detail:e.message,status:'failed'});}
}

app.post('/api/analyze',requireScanAccess,upload.single('file'),async(req,res)=>respondWithAnalysis(req,res,req.file));

app.post('/api/analyze-storage',requireScanAccess,async(req,res)=>{
  const objectPath=safeStoragePath(req.authUser.id,req.body?.path);
  if(!objectPath)return res.status(400).json({error:'Invalid private upload path.'});
  try{
    const file=await downloadPrivateUpload(req.authUser.id,req.authToken,objectPath,req.body?.originalName,req.body?.mimeType);
    await deletePrivateUpload(req.authToken,objectPath);
    return respondWithAnalysis(req,res,file);
  }catch(e){
    await deletePrivateUpload(req.authToken,objectPath);
    return res.status(e.statusCode||422).json({error:'The private upload could not be processed.',detail:e.message,status:'failed'});
  }
});
app.post('/api/analyze-text', requireScanAccess, async (req,res)=>{
  try{
    const text=String(req.body?.text||'');if(text.trim().length<30)return res.status(400).json({error:'Paste at least 30 characters.'});
    if(text.length>250000)return res.status(413).json({error:'Text sample is too large for the demo.'});
    const [base,aiAnalysis]=await Promise.all([Promise.resolve(analyzeTextInput(text)),analyzeAIText(text)]);
    res.json({...base,aiAnalysis,multimodal:{kind:'text',status:'not_applicable',reason:'Text-only input has no image, audio, video or document-container layer.'},access:req.scanAccess});
  }catch(e){console.error('Text inspection failed:',e.message);res.status(e.statusCode||422).json({error:'Text inspection could not complete.',detail:e.message,status:'failed'});}
});
app.post('/api/create-checkout-session',requireUser,async(req,res)=>{
  try{
    const plan=String(req.body?.plan||'').toLowerCase(),price=priceIds[plan];
    if(!['lite','pro','business'].includes(plan))return res.status(400).json({error:'Unknown plan.'});
    if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET||!serviceRoleConfigured()||!price)return res.status(503).json({error:'Billing is not connected yet.'});
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY),base=`${req.headers['x-forwarded-proto']||req.protocol}://${req.get('host')}`;
    const rows=await supabaseAdmin(`/rest/v1/profiles?id=eq.${encodeURIComponent(req.authUser.id)}&select=stripe_customer_id&limit=1`);
    let customerId=rows?.[0]?.stripe_customer_id||null;
    if(!customerId){
      const customer=await stripe.customers.create({email:req.authUser.email||undefined,metadata:{supabase_user_id:req.authUser.id}});
      customerId=customer.id;
      await supabaseAdmin(`/rest/v1/profiles?id=eq.${encodeURIComponent(req.authUser.id)}`,{method:'PATCH',body:{stripe_customer_id:customerId,updated_at:new Date().toISOString()},headers:{prefer:'return=minimal'}});
    }
    const params={
      mode:'subscription',customer:customerId,line_items:[{price,quantity:1}],
      success_url:`${base}/account.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${base}/pricing.html?checkout=cancelled`,allow_promotion_codes:true,
      client_reference_id:req.authUser.id,
      metadata:{supabase_user_id:req.authUser.id,plan,price_id:price},
      subscription_data:{metadata:{supabase_user_id:req.authUser.id,plan,price_id:price}}
    };
    const session=await stripe.checkout.sessions.create(params);res.json({url:session.url});
  }catch(e){console.error(e);res.status(500).json({error:'Could not open checkout.',detail:e.message});}
});
app.post('/api/create-portal-session',requireUser,async(req,res)=>{
  try{
    if(!process.env.STRIPE_SECRET_KEY||!serviceRoleConfigured())return res.status(503).json({error:'Billing is not connected yet.'});
    const rows=await supabaseAdmin(`/rest/v1/profiles?id=eq.${encodeURIComponent(req.authUser.id)}&select=stripe_customer_id&limit=1`);
    const customerId=rows?.[0]?.stripe_customer_id;
    if(!customerId)return res.status(404).json({error:'No billing account exists for this user yet.'});
    const stripe=new Stripe(process.env.STRIPE_SECRET_KEY),base=`${req.headers['x-forwarded-proto']||req.protocol}://${req.get('host')}`;
    const session=await stripe.billingPortal.sessions.create({customer:customerId,return_url:`${base}/account.html`});
    res.json({url:session.url});
  }catch(e){console.error('Billing portal failed:',e.message);res.status(500).json({error:'Could not open billing management.'});}
});
function htmlFor(file){
  const full=path.join(__dirname,file);if(!fs.existsSync(full))return null;
  let html=fs.readFileSync(full,'utf8');
  const brandMark='<img class="brandLogo" src="/logo-emet-one.png" alt="EMET ONE" width="48" height="36" decoding="async">';
  html=html.replace(/<span class="mark">E1<\/span>/g,brandMark);
  html=html.replace(/<img (?:class="brandLogo" )?src="\/logo-emet-one\.(?:svg|png)" alt="EMET ONE"[^>]*>/g,brandMark);
  if(!html.includes('rel="icon"'))html=html.replace('</head>','<link rel="icon" href="/favicon.png" type="image/png" sizes="64x64"><link rel="apple-touch-icon" href="/apple-touch-icon.png"></head>');
  if(!html.includes('/brand.css'))html=html.replace('</head>','<link rel="stylesheet" href="/brand.css"></head>');
  if(!html.includes('/nav-mobile.css'))html=html.replace('</head>','<link rel="stylesheet" href="/nav-mobile.css"></head>');
  if(!html.includes('href="/pricing.html"')&&file!=='admin-lab.html')html=html.replace('</div><a class="navcta"','<a href="/pricing.html">Pricing</a></div><a class="navcta"');
  if(file==='verify.html'){
    html=html.replace('</head>','<link rel="stylesheet" href="/review.css?v=20260913-6"></head>');
    html=html.replace(/src="\/(app|fingerprint-ui|media-mode-fix|multimodal-ui|scanner)\.js(?:\?[^\"]*)?"/g,'src="/$1.js?v=20260913-6"');
    html=html.replace(/href="\/(multimodal|media-mode-fix)\.css(?:\?[^\"]*)?"/g,'href="/$1.css?v=20260913-6"');
    html=html.replace('</body>','<script src="/review-ui.js?v=20260913-6"></script></body>');
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
