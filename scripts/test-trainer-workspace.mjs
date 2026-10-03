import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {calculateGrades,progressFor,trainerProgress,taskAlerts,criteria} from '../lib/trainer-domain.ts';
import {trainerRayatCourses} from '../lib/rayat.ts';
import {readCsv,selectedGrades,gradeSuggestions} from '../lib/grade-workbook.ts';
import {officeHoursSchema} from '../lib/contracts.ts';
const grade={scores:[0,10,12,20],maximum:20,passMark:12,sheet:'فصلي',column:'الدرجات',firstRow:2,lastRow:5,excluded:0};
const result=calculateGrades(grade);assert.equal(result.average,10.5);assert.equal(result.averagePercent,52.5);assert.equal(result.passRate,50);assert.equal(result.distribution.reduce((n,b)=>n+b.count,0),4);
assert.throws(()=>calculateGrades({...grade,scores:[101]}));assert.throws(()=>calculateGrades({...grade,scores:[21]}));assert.throws(()=>calculateGrades({...grade,maximum:120}));assert.throws(()=>calculateGrades({...grade,passMark:21}));
const sheet={name:'اختبار',rows:readCsv('اسم المتدرب,رقم المتدرب,الدرجات\nمتدرب أ,900001,20\nمتدرب ب,900002,غائب\nمتدرب ج,900003,\nمتدرب د,900004,10')};
assert.equal(gradeSuggestions(sheet).column,2);assert.deepEqual(selectedGrades(sheet,2,2,5,20),{scores:[20,10],excluded:2});assert.throws(()=>selectedGrades(sheet,1,2,5,20));
assert.equal(gradeSuggestions({name:'مجهول',rows:[['رقم','مبلغ'],['1','500']]}).column,-1);
assert.equal(officeHoursSchema.safeParse([{day:0,start:'09:00',end:'10:00'},{day:0,start:'09:30',end:'11:00'}]).success,false);
assert.equal(officeHoursSchema.safeParse([{day:0,start:'09:00',end:'10:00'},{day:0,start:'10:00',end:'11:00'}]).success,true);
const bytes=rows=>new TextEncoder().encode(rows.map(r=>r.join(',')).join('\n'));
const schedule=bytes([['الفصل التدريبي','القسم','المقرر','اسم المقرر','الرقم المرجعي','رقم المدرب'],['144710','التقنية الكهربائية','EL101','أجهزة كهربائية','11','0031103'],['144710','التقنية الكهربائية','EL101','أجهزة كهربائية','11','0031103'],['144710','التقنية الكهربائية','EL101','أجهزة كهربائية','12','0031103'],['144710','التقنية الالكترونية','EL102','مقرر آخر','13','0031103']]);
const registration=bytes([['القسم','الرقم المرجعي','رقم المتدرب','حالة تسجيل','حالة المتدرب'],['التقنية الكهربائية','11','T1','حرمان بسبب غياب','مطوي قيده'],['التقنية الكهربائية','11','T1','حرمان بسبب غياب','مطوي قيده'],['التقنية الكهربائية','12','T2','انسحاب فصلي','مستمر']]);
const courses=trainerRayatCourses(schedule,registration,'31103','1448-1');assert.equal(courses.length,2);assert.equal(new Set(courses.map(c=>c.key)).size,2);assert.equal(courses[0].name,'أجهزة كهربائية');assert.equal(courses[0].trainees,1);assert.equal(courses[0].deprived,1);assert.equal(courses[0].dismissed,1);assert.equal(courses[1].withdrawn,1);
const row=(item,status='done',files=[{id:'f'}],payload={})=>({id:randomUUID(),course_key:courses[0].key,category:item.category,item_key:item.key,status,files,payload});
const training=criteria.filter(c=>c.category==='training'),methods=training.find(c=>c.key==='methods'),assignment=training.find(c=>c.key==='assignments');
assert.equal(progressFor([row(methods,'done',[],{methods:['التطبيق العملي']})],courses[0].key,'training').percent,50);
assert.equal(progressFor([row(methods,'done',[],{methods:['التطبيق العملي']}),row(assignment,'done',[])],courses[0].key,'training').percent,50);
assert.equal(progressFor([row(methods,'not_applicable'),row(assignment)],courses[0].key,'training').percent,100);
assert.equal(progressFor([row(methods,'not_applicable'),row(assignment,'not_applicable')],courses[0].key,'training').percent,null);
const baseline=trainerProgress([],courses);assert.deepEqual(trainerProgress([{course_key:'general',category:'development',item_key:'x',status:'done',files:[{id:'f'}],payload:{}}],courses),baseline);
const due=Date.parse('2026-11-01T09:00:00+03:00'),task={id:'t',status:'pending',due_at:new Date(due).toISOString(),reminder_days:7};assert.equal(taskAlerts([task],due-8*86400000).length,0);assert.equal(taskAlerts([task],due-7*86400000).length,1);assert.equal(taskAlerts([{...task,status:'done'}],due).length,0);
console.log('Domain: grade selection/ranges, deduplicated section linkage, unchanged optional metrics, office hours and reminder boundaries passed.');

const base='http://127.0.0.1:5173',accounts=JSON.parse(readFileSync('.local/test-accounts.json','utf8')),sessions=[],createdRecords=[],createdTasks=[],uploaded=[];let disposableUser;
async function login(a){const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:a.username,password:a.password})});assert.equal(response.status,200);const json=await response.json(),s={...json,cookie:response.headers.get('set-cookie').split(';')[0]};sessions.push(s);return s}
async function req(s,path,method='GET',body){return fetch(base+'/api/'+path,{method,headers:{Cookie:s.cookie,...(method==='GET'?{}:{Origin:base,'X-CSRF-Token':s.csrf,...(body instanceof FormData?{}:{'Content-Type':'application/json'})})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)})}
function localDb(sql){const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','site-creator-d1','--local','--persist-to','.wrangler/state','--config','wrangler.local.json','--command',sql],{encoding:'utf8'});assert.equal(r.status,0,r.stderr)}
try{
 const head=await login(accounts.find(a=>a.role==='head')),trainer=await login(accounts.find(a=>a.role==='trainer'));
 const identity='qa-'+randomUUID().slice(0,8),password='Test-'+randomUUID();const add=await req(head,'users','POST',{username:identity,display_name:'اختبار فصل الصلاحيات',role:'trainer',is_test:true,must_change_password:false,password});assert.equal(add.status,201);disposableUser=(await add.json()).user.id;const other=await login({username:identity,password});
 const payload={title:'اختبار دورة مع شواهد متعددة',date:'2026-10-01',notes:'سجل مؤقت للاختبار فقط'},itemKey=randomUUID();
 for(const category of ['development','exchange']){
  const input={courseKey:'general',category,itemKey:category+itemKey,status:'done',payload};const without=await req(trainer,'trainer/workspace/records','POST',input);assert.equal(without.status,400);
  const draft=await req(trainer,'trainer/workspace/records','POST',{...input,status:'not_done'});assert.equal(draft.status,200);const recordId=(await draft.json()).id;createdRecords.push(recordId);
  for(let i=0;i<2;i++){const form=new FormData();for(const[k,v]of Object.entries({courseKey:'general',category,itemKey:input.itemKey}))form.set(k,v);form.set('file',new File(['test evidence '+i],'proof-'+i+'.txt',{type:'text/plain'}));const response=await req(trainer,'trainer/workspace/files','POST',form);assert.equal(response.status,201);const file=await response.json();uploaded.push({id:file.id,recordId,owner:trainer.user.id});assert.equal((await req(other,'trainer/workspace/files/'+file.id)).status,404)}
  assert.equal((await req(trainer,'trainer/workspace/records','POST',input)).status,200);
 }
 const work=await (await req(trainer,'trainer/workspace')).json();for(const id of createdRecords)assert.equal(work.records.find(r=>r.id===id).files.length,2);
 assert.equal((await req(trainer,'tasks','POST',{trainerId:trainer.user.id,title:'مهمة غير مسموحة',dueAt:new Date(due).toISOString(),reminderDays:7})).status,403);
 const assigned=await req(head,'tasks','POST',{trainerId:trainer.user.id,title:'مهمة اختبار مؤقتة',description:'للتحقق من الصلاحيات',dueAt:new Date(due).toISOString(),reminderDays:7});assert.equal(assigned.status,201);const taskId=(await assigned.json()).id;createdTasks.push(taskId);
 assert.equal((await req(other,'tasks/'+taskId,'PATCH',{status:'done'})).status,403);assert.equal((await (await req(other,'tasks')).json()).tasks.some(t=>t.id===taskId),false);
 for(const purpose of ['decision','evidence','evidence']){const form=new FormData();for(const[k,v]of Object.entries({courseKey:'general',category:'assignment',itemKey:taskId,purpose}))form.set(k,v);form.set('file',new File([purpose],purpose+'.txt'));const response=await req(trainer,'trainer/workspace/files','POST',form);assert.equal(response.status,201);const file=await response.json();if(!createdRecords.includes(file.recordId))createdRecords.push(file.recordId);uploaded.push({id:file.id,recordId:file.recordId,owner:trainer.user.id})}
 const after=await (await req(trainer,'trainer/workspace')).json(),assignedRecord=after.records.find(r=>r.item_key===taskId);assert.equal(assignedRecord.files.filter(f=>f.purpose==='decision').length,1);assert.equal(assignedRecord.files.filter(f=>f.purpose==='evidence').length,2);
 assert.equal((await req(trainer,'tasks/'+taskId,'PATCH',{status:'done'})).status,200);
 assert.equal((await req(trainer,'trainer/workspace/records','POST',{courseKey:'unauthorized::123',category:'exam',itemKey:'first',status:'not_done',payload:{}})).status,403);
 assert.equal((await req(trainer,'trainer/workspace/analysis','POST',{fileId:uploaded[0].id,...grade,scores:[101]})).status,400);
 const portfolio=await req(trainer,'trainer/workspace/portfolio');assert.equal(portfolio.status,200);const html=await portfolio.text();assert.ok(html.includes('test evidence')||html.includes(Buffer.from('test evidence 0').toString('base64')));assert.ok(html.includes('download='));assert.equal((await req(head,'trainer/workspace/portfolio')).status,403);
 console.log('API: required witnesses, multiple independent files, decision attachments, private access, head-only assignments and embedded portfolio passed.');
}finally{
 for(const s of sessions)await req(s,'auth/logout','POST',{}).catch(()=>{});
 const ids=[...createdRecords,...createdTasks,...(disposableUser?[disposableUser]:[])];
 for(const id of ids)assert.match(id,/^[a-f0-9-]{36}$/);
 if(ids.length)localDb(`DELETE FROM audit_log WHERE target_id IN (${ids.map(id=>"'"+id+"'").join(',')})${disposableUser?` OR actor_id='${disposableUser}'`:''}; ${createdRecords.map(id=>`DELETE FROM trainer_work_records WHERE id='${id}';`).join(' ')} ${createdTasks.map(id=>`DELETE FROM trainer_tasks WHERE id='${id}';`).join(' ')} ${disposableUser?`DELETE FROM users WHERE id='${disposableUser}';`:''}`);
 for(const f of uploaded){const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','r2','object','delete',`site-creator-r2/trainer-work/${f.owner}/${f.recordId}/${f.id}`,'--local','--config','wrangler.local.json','--persist-to','.wrangler/state','--force'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr)}
}
