import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {inspectRayat,rayatLinkage,trainerRayatCourses,trainerRayatMetrics} from '../lib/rayat.ts';

const csv=(lines)=>new TextEncoder().encode(lines.join('\r\n'));
const sf=csv(['"الفصل التدريبي","القسم","المقرر","الرقم المرجعي","رقم المتدرب","حالة تسجيل","حالة المتدرب"','"الفصل التدريبي الأول 1448","التقنية الكهربائية","EL101","123","T01","مسجل","مستمر"']);
assert.deepEqual(inspectRayat('SF01',sf).summary,{rows:1,departmentRows:1,trainees:1,sections:1,courses:1,withdrawn:0,dismissed:0,deprived:0});
assert.throws(()=>inspectRayat('SF01',csv(['"القسم","الرقم المرجعي"','"التقنية الكهربائية","123"'])),/الأعمدة الناقصة/);
const ss=csv(['"الفصل التدريبي","القسم","المقرر","الرقم المرجعي","نوع الجدولة","سعة","مسجلين","متبقي","رقم المدرب"','"144710","التقنية الكهربائية","EL101","123","نظري صباحي","25","26","-1","E01"','"144710","التقنية الكهربائية","EL101","123","نظري صباحي","25","26","-1","E01"']);
assert.equal(inspectRayat('SS01',ss).summary.overCapacity,1);
assert.equal(inspectRayat('SS01',ss).summary.capacity,25);
assert.equal(inspectRayat('SS01',ss).summary.remoteSections,0);
const trainerSchedule=csv(['"الفصل التدريبي","القسم","المقرر","الرقم المرجعي","نوع الجدولة","سعة","مسجلين","متبقي","رقم المدرب"','"144710","التقنية الكهربائية","EL101","123","نظري صباحي","25","2","23","0031464"','"144710","التقنية الكهربائية","EL102","124","نظري صباحي","25","1","24","0031526"']);
const trainerEnrollment=csv(['"الفصل التدريبي","القسم","المقرر","الرقم المرجعي","رقم المتدرب","حالة تسجيل","حالة المتدرب"','"الفصل التدريبي الأول 1448","التقنية الكهربائية","EL101","123","T01","مسجل","مستمر"','"الفصل التدريبي الأول 1448","التقنية الكهربائية","EL101","123","T02","مسجل","مستمر"','"الفصل التدريبي الأول 1448","التقنية الكهربائية","EL102","124","T03","مسجل","مستمر"']);
assert.deepEqual(trainerRayatMetrics(trainerSchedule,trainerEnrollment,'31464'),{trainees:2,sections:1,courses:1,staffLinked:true});
assert.deepEqual(trainerRayatCourses(trainerSchedule,trainerEnrollment,'31464'),[{key:'144710::123',name:'EL101',code:'EL101',reference:'123',term:'144710',sectionType:'نظري صباحي',sections:1,trainees:2,learnerIds:['T01','T02'],deprived:0,withdrawn:0,dismissed:0}]);
assert.deepEqual(trainerRayatMetrics(trainerSchedule,trainerEnrollment,'٠٣١٥٢٦'),{trainees:1,sections:1,courses:1,staffLinked:true});
assert.equal(trainerRayatMetrics(trainerSchedule,trainerEnrollment,'99999').staffLinked,false);
const absenceLink=csv(['"اسم القسم","رقم المقرر","اسم المقرر","أرقام شعب المقرر","حالة المقرر","إجمالي ساعات الغياب بدون عذر","رقم المتدرب"','"التقنية الكهربائية","101","رياضيات","123","حرمان بسبب غياب","4","T01"','"التقنية الكهربائية","103","لغة إنجليزية","124","انسحاب فصلي","2","T03"']);
const statusLink=csv(['"اسم القسم","رقم المقرر","اسم المقرر"','"التقنية الكهربائية","101","رياضيات"','"التقنية الالكترونية","103","لغة إنجليزية"']);
assert.deepEqual(rayatLinkage(trainerSchedule,trainerEnrollment,absenceLink,statusLink),{scheduleSections:2,registrationSections:2,linkedSections:2,sameCourseSections:2,absenceSections:1,linkedAbsenceSections:1,absenceCourses:2,statusCourses:1,linkedCourses:1,excludedCourses:['103'],missingAbsenceCourses:[],electricalTrainees:1,electricalDeprived:1,electricalWithUnexcusedAbsence:1,scheduledTrainers:2});
const correctedRemote=csv(['"الفصل التدريبي","القسم","المقرر","الرقم المرجعي","نوع الجدولة","سعة","مسجلين","متبقي","رقم المدرب"','"144710","التقنية الكهربائية","EL101","65557","نظري صباحي","50","49","1","0029821"']);
assert.deepEqual([inspectRayat('SS01',correctedRemote).summary.remoteSections,inspectRayat('SS01',correctedRemote).summary.confirmedRemoteSections,inspectRayat('SS01',correctedRemote).summary.remoteRegistrations],[1,1,49]);
assert.throws(()=>inspectRayat('SF01',ss),/يطابق SS01/);
const flagged=csv(['"الفصل التدريبي","القسم","المقرر","الرقم المرجعي","رقم المتدرب","حالة تسجيل","حالة المتدرب"','"1448","التقنية الكهربائية","A","1","T1","حرمان بسبب غياب","مستمر"','"1448","التقنية الكهربائية","B","2","T1","حرمان بسبب غياب","مستمر"','"1448","التقنية الكهربائية","C","3","T2","انسحاب فصلي","مطوي قيده"']);
const flaggedSummary=inspectRayat('SF01',flagged).summary;
assert.deepEqual([flaggedSummary.deprived,flaggedSummary.withdrawn,flaggedSummary.dismissed],[1,1,1]);
const so=csv(['"الفصل التدريبي","اسم القسم","رمز المقرر","رقم المقرر","المستمرون","المحرومون","المطوي قيدهم","المنسحبون","إجمالي المسجلين"','"الفصل التدريبي الأول 1448","التقنية الكهربائية","EL","101","2","1","0","1","4"']);
assert.deepEqual([inspectRayat('SO08',so).summary.enrolled,inspectRayat('SO08',so).summary.deprivedRegistrations,inspectRayat('SO08',so).summary.courses],[4,1,1]);
assert.throws(()=>inspectRayat('SF01',so),/يطابق SO08/);
const so01=csv(['"كود الفصل التدريبي","الفصل التدريبي","اسم القسم","كود المقرر","رقم المقرر","رقم المتدرب","حالة المقرر","إجمالي نسبة الغياب بدون عذر","إجمالي ساعات الغياب بدون عذر"','"144710","الفصل التدريبي الأول 1448","التقنية الكهربائية","كهرآ","234","T1","حرمان بسبب غياب","20.5","4"']);
assert.deepEqual([inspectRayat('SO01',so01).summary.trainees,inspectRayat('SO01',so01).summary.withUnexcusedAbsence],[1,1]);
assert.throws(()=>inspectRayat('SO01',csv(['"كود الفصل التدريبي","الفصل التدريبي","اسم القسم","كود المقرر","رقم المقرر","رقم المتدرب","حالة المقرر","إجمالي نسبة الغياب بدون عذر","إجمالي ساعات الغياب بدون عذر"','"144711","الفصل التدريبي الأول 1448","التقنية الكهربائية","كهرآ","234","T1","مسجل","0","0"'])),/رمز الفصل/);
const sf06=csv(['"رقم التواصل","اسم المتدرب","الرقم التدريبي","البرنامج","القسم","المرحلة","الوحدة التدريبية"']);
assert.deepEqual(inspectRayat('SF06',sf06).summary,{rows:0,departmentRows:0,trainees:0});

const base=process.env.TEST_URL||'http://127.0.0.1:5173';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const accounts=JSON.parse(readFileSync('.local/test-accounts.json','utf8'));
for(const account of accounts){
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Origin':base,'Content-Type':'application/json'},body:JSON.stringify({username:account.username,password:account.password})});
 assert.equal(login.status,200,`Login ${account.username}`);
 const session=await login.json();const cookie=login.headers.get('set-cookie').split(';')[0];
 const list=await fetch(base+'/api/rayat',{headers:{Cookie:cookie}});
 assert.equal(list.status,account.role==='head'?200:403,`Rayat access ${account.role}`);
 if(account.role==='head'){
  const before=await list.json();assert.ok(Array.isArray(before.reports));
  const form=new FormData();form.set('kind','SF01');form.set('file',new File(['wrong,data\n1,2'],'invalid.csv',{type:'text/csv'}));
  const bad=await fetch(base+'/api/rayat',{method:'POST',headers:{Cookie:cookie,Origin:base,'X-CSRF-Token':session.csrf},body:form});
  assert.equal(bad.status,400);assert.match((await bad.json()).error,/الأعمدة الناقصة/);
  const mismatched=new FormData();mismatched.set('kind','SF01');mismatched.set('file',new File([ss],'sections.csv',{type:'text/csv'}));
  const mismatch=await fetch(base+'/api/rayat',{method:'POST',headers:{Cookie:cookie,Origin:base,'X-CSRF-Token':session.csrf},body:mismatched});assert.equal(mismatch.status,400);assert.match((await mismatch.json()).error,/يطابق SS01/);
  const after=await fetch(base+'/api/rayat',{headers:{Cookie:cookie}}).then(r=>r.json());assert.equal(after.reports.length,before.reports.length);
  const blocked=await fetch(base+'/api/rayat',{method:'POST',headers:{Cookie:cookie,Origin:base,'X-CSRF-Token':'invalid'},body:form});assert.equal(blocked.status,403);
  const term='اختبار مؤقت '+randomUUID();
  const validForm=new FormData();validForm.set('kind','SF01');validForm.set('file',new File([csv(['"الفصل التدريبي","القسم","المقرر","الرقم المرجعي","رقم المتدرب","حالة تسجيل","حالة المتدرب"',`"${term}","التقنية الكهربائية","TEST","R1","T1","مسجل","مستمر"`])],'synthetic-test.csv',{type:'text/csv'}));
  const saved=await fetch(base+'/api/rayat',{method:'POST',headers:{Cookie:cookie,Origin:base,'X-CSRF-Token':session.csrf},body:validForm});
  assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));
  const id=(await saved.json()).report.id;
  try{
   const visible=await fetch(base+'/api/rayat',{headers:{Cookie:cookie}}).then(r=>r.json());
   assert.equal(visible.reports.find(r=>r.id===id)?.summary.trainees,1);
  }finally{
   const sql=`DELETE FROM audit_log WHERE target_id='${id}'; DELETE FROM rayat_reports WHERE id='${id}';`;
   const cleanDb=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','wrangler.local.json','--persist-to','.wrangler/state','--command',sql],{encoding:'utf8'});
   assert.equal(cleanDb.status,0,cleanDb.stderr);
   const cleanFile=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','r2','object','delete',`site-creator-r2/rayat/SF01/${id}`,'--local','--config','wrangler.local.json','--persist-to','.wrangler/state','--force'],{encoding:'utf8'});
   assert.equal(cleanFile.status,0,cleanFile.stderr);
  }
 }else{
  const form=new FormData();form.set('kind','SF01');form.set('file',new File([sf],'sample.csv',{type:'text/csv'}));
  const denied=await fetch(base+'/api/rayat',{method:'POST',headers:{Cookie:cookie,Origin:base,'X-CSRF-Token':session.csrf},body:form});assert.equal(denied.status,403);
 }
}
console.log('Rayat parser, permissions, CSRF and invalid-upload checks passed.');
