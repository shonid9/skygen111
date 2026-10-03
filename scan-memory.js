'use strict';
const {profileSnapshot}=require('./hebrew-analysis');
async function saveScanMemory(row,token,fetcher=fetch){
  const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!base||!key||!token)return {status:'not_configured'};
  // The signed-in user's token enforces the existing INSERT ownership policy.
  const r=await fetcher(`${base}/rest/v1/scans`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json',prefer:'return=minimal'},body:JSON.stringify(row),signal:AbortSignal.timeout(10000)});
  if(!r.ok)return {status:'failed'};
  return {status:'saved'};
}
function memoryMetadata(result){return {...(result?.metadata||{}),hebrewProfile:profileSnapshot(result?.aiAnalysis?.assessment)};}
module.exports={saveScanMemory,memoryMetadata};
