'use strict';
const DEFAULT_INTERVAL_MS=60000;
function createTestBatchPushWorker({pool,sendToStudent,sendToFaculty,intervalMs=Number(process.env.TEST_BATCH_PUSH_INTERVAL_MS)||DEFAULT_INTERVAL_MS}){
 if(!pool||typeof pool.query!=='function') throw new Error('Test Batch push worker requires PostgreSQL pool');
 if(typeof sendToStudent!=='function'||typeof sendToFaculty!=='function') throw new Error('Test Batch push worker requires push services');
 let timer=null,running=false,stopped=true;
 const timeZone=process.env.TEST_BATCH_NOTIFICATION_TIMEZONE||'Asia/Kolkata';
 const notificationHour=Number(process.env.TEST_BATCH_NOTIFICATION_HOUR||9);
 function parts(date=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}
 function dateShift(s,days){const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
 async function ensureTable(){await pool.query('CREATE TABLE IF NOT EXISTS test_batch_push_reminder_runs (reminder_type VARCHAR(40) NOT NULL,test_code VARCHAR(100) NOT NULL,roll_no VARCHAR(100) NOT NULL DEFAULT \'\',target_date DATE NOT NULL,sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(reminder_type,test_code,roll_no,target_date))');}
 async function claim(type,testCode,roll,target){const r=await pool.query('INSERT INTO test_batch_push_reminder_runs(reminder_type,test_code,roll_no,target_date) VALUES($1,$2,$3,$4) ON CONFLICT(reminder_type,test_code,roll_no,target_date) DO NOTHING RETURNING reminder_type',[type,testCode,roll||'',target]);return r.rowCount>0;}
 async function admins(today){
  const target=dateShift(today,3);
  const q=await pool.query(`SELECT test_code FROM test_batch_tests WHERE COALESCE(status,'Scheduled')<>'Cancelled' AND COALESCE(writing_date,test_date)=$1 ORDER BY test_code`,[target]);
  for(const row of q.rows){const code=String(row.test_code||'').trim().toUpperCase();if(!code||!(await claim('admin_3_day',code,'',target)))continue;try{const r=await sendToFaculty(pool,['IG001','IG002'],{title:'Test Reminder',body:code+' is scheduled in 3 days.',data:{module_name:'test-batch-admin-test',test_code:code,reminder_type:'admin_3_day'}});console.log('[Test Batch Push] Admin '+code+': '+(r.sent||r.successCount||0)+' delivered');}catch(e){await pool.query('DELETE FROM test_batch_push_reminder_runs WHERE reminder_type=$1 AND test_code=$2 AND roll_no=\'\' AND target_date=$3',['admin_3_day',code,target]);console.error('[Test Batch Push] Admin failed:',e.message);}}
 }
 async function students(today){
  const target=dateShift(today,1);
  const q=await pool.query(`SELECT DISTINCT r.roll_no,r.test_code FROM test_batch_registrations r JOIN test_batch_tests t ON UPPER(TRIM(t.test_code))=UPPER(TRIM(r.test_code)) JOIN test_batch_students s ON UPPER(TRIM(s.roll_no))=UPPER(TRIM(r.roll_no)) WHERE r.writing_date=$1 AND COALESCE(t.status,'Scheduled')<>'Cancelled' ORDER BY r.roll_no,r.test_code`,[target]);
  for(const row of q.rows){const roll=String(row.roll_no||'').trim().toUpperCase(),code=String(row.test_code||'').trim().toUpperCase();if(!roll||!code||!(await claim('student_1_day',code,roll,target)))continue;try{const r=await sendToStudent(pool,roll,{title:'Test Reminder',body:code+' is scheduled tomorrow.',data:{module_name:'test-batch-student-test',test_code:code,roll_no:roll,reminder_type:'student_1_day'}});console.log('[Test Batch Push] Student '+roll+'/'+code+': '+(r.successCount||0)+' delivered');}catch(e){await pool.query('DELETE FROM test_batch_push_reminder_runs WHERE reminder_type=$1 AND test_code=$2 AND roll_no=$3 AND target_date=$4',['student_1_day',code,roll,target]);console.error('[Test Batch Push] Student failed:',e.message);}}
 }
 async function tick(){if(running||stopped)return;running=true;try{const n=parts(),today=n.year+'-'+n.month+'-'+n.day;if(Number(n.hour)>=notificationHour){await ensureTable();await admins(today);await students(today);}}catch(e){console.error('[Test Batch Push] Worker cycle failed:',e);}finally{running=false;}}
 function start(){if(timer)return;stopped=false;console.log('[Test Batch Push] Worker started');void tick();timer=setInterval(()=>void tick(),intervalMs);timer.unref();}
 function stop(){stopped=true;if(timer)clearInterval(timer);timer=null;}
 return {start,stop,tick};
}
module.exports={createTestBatchPushWorker};