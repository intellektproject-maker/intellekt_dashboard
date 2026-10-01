'use strict';
const { getApps, getApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const CHANNEL = 'intellekt_high_importance';
const INVALID = new Set(['messaging/registration-token-not-registered','messaging/invalid-registration-token']);
function messaging(){ if(!getApps().length) return null; try{return getMessaging(getApp());}catch(e){console.error('[Student Push] Firebase unavailable:',e.message);return null;} }
async function sendToStudent(pool, rollNo, {title, body, data={}}){
 const roll=String(rollNo||'').trim().toUpperCase(); if(!roll) return {successCount:0,failureCount:0,removed:0,tokenCount:0};
 const fm=messaging(); if(!fm) return {successCount:0,failureCount:0,removed:0,tokenCount:0,disabled:true};
 const q=await pool.query('SELECT device_token AS token FROM student_device_tokens WHERE UPPER(TRIM(student_id))=UPPER(TRIM($1))',[roll]);
 const tokens=[...new Set(q.rows.map(r=>String(r.token||'').trim()).filter(Boolean))]; if(!tokens.length) return {successCount:0,failureCount:0,removed:0,tokenCount:0};
 const normalized=Object.fromEntries(Object.entries(data).map(([k,v])=>[String(k),String(v??'')]));
 let successCount=0,failureCount=0,removed=0;
 for(let i=0;i<tokens.length;i+=500){
  const batch=tokens.slice(i,i+500);
  const response=await fm.sendEachForMulticast({tokens:batch,notification:{title:String(title||'INTELLEKT'),body:String(body||'')},data:normalized,android:{priority:'high',notification:{channelId:CHANNEL,sound:'default',defaultSound:true,defaultVibrateTimings:true,visibility:'public'}}});
  successCount+=response.successCount; failureCount+=response.failureCount;
  const invalid=[]; response.responses.forEach((item,index)=>{if(!item.success&&item.error&&INVALID.has(item.error.code)) invalid.push(batch[index]);});
  if(invalid.length){const d=await pool.query('DELETE FROM student_device_tokens WHERE device_token=ANY($1::text[])',[invalid]);removed+=d.rowCount||0;}
 }
 return {successCount,failureCount,removed,tokenCount:tokens.length};
}
module.exports={sendToStudent};