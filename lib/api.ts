import {pagination} from './pagination';
import {workspaceData,workspaceFiles} from './workspace-data';
import {workFileType} from './work-file';
import {readGradeWorkbook,selectedGrades,gradeParserVersion} from './grade-workbook';
import {limitedBytes,limitedForm,BodyLimitError} from './request-body';
import {reportBytes,invalidateReports} from './report-cache';
import {createHash} from 'node:crypto';
import {calculateGrades,courseCategories,criteria,trainingMethods} from './trainer-domain';
import {initializeDepartment} from './initial-setup';
import {accountTransferSchema,planAccountTransfer} from './account-transfer';
import {portfolioDocument} from './portfolio';
import {portfolioAttachmentChunks} from './portfolio-attachments';
import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {createUserSchema,updateUserSchema,profileSchema,layoutSchema,defaultLayout,passwordSchema,User} from './contracts';
import {hashPassword,verifyPassword,token,digest} from './security';
import {bucket,maxEvidenceBytes,maxAvatarBytes,imageType,evidenceType,privateFile} from './files';
import {inspectRayat,maxRayatBytes,reportKinds,ReportKind,rayatLinkage,trainerRayatMetrics,trainerRayatCourses} from './rayat';

class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
function fail(status:number,message:string):never{throw new HttpError(status,message)}
function db(){if(!env.DB)throw new Error('Database unavailable');return env.DB}
const publicColumns='id, username, display_name, role, active, is_test, must_change_password, avatar_updated_at, (SELECT staff_number FROM profiles WHERE user_id=users.id) AS staff_number';
const json=(data:unknown,status=200,extra:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...extra}});
function cookie(req:Request,value:string,maxAge=28800){return 'department_session='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(new URL(req.url).protocol==='https:'?'; Secure':'')}
function cookieToken(req:Request){return req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('department_session='))?.slice('department_session='.length)||''}
function uploadLimit(path:string){return (path==='profile/avatar'?maxAvatarBytes:path==='rayat'?maxRayatBytes:maxEvidenceBytes)+16384}
type Receipt={actor_id:string;scope:string;fingerprint:string;result:string};
async function uploadReceipt(id:string,actor:string,scope:string,fingerprint:string){const receipt=await db().prepare('SELECT actor_id,scope,fingerprint,result FROM upload_requests WHERE id=?').bind(id).first<Receipt>();if(!receipt)return null;if(receipt.actor_id!==actor||receipt.scope!==scope||receipt.fingerprint!==fingerprint)fail(409,'مفتاح الرفع مستخدم لطلب مختلف. اختر الملف مجددًا.');return JSON.parse(receipt.result)}
function receiptStatement(id:string,actor:string,scope:string,fingerprint:string,result:unknown){return db().prepare('INSERT INTO upload_requests(id,actor_id,scope,fingerprint,result,created_at) VALUES(?,?,?,?,?,?)').bind(id,actor,scope,fingerprint,JSON.stringify(result),Date.now())}
function uploadKey(req:Request){return z.string().uuid().parse(req.headers.get('X-Upload-Id')||crypto.randomUUID())}
function uploadFingerprint(bytes:Uint8Array,metadata:unknown){return createHash('sha256').update(bytes).update(JSON.stringify(metadata)).digest('hex')}
async function body(req:Request){if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'نوع الطلب غير مدعوم.');const text=new TextDecoder().decode(await limitedBytes(req,64000));try{return JSON.parse(text)}catch{fail(400,'بيانات الطلب غير صالحة.')}}
async function session(req:Request){const raw=cookieToken(req);if(!/^[a-f0-9]{64}$/.test(raw))fail(401,'يرجى تسجيل الدخول.');const hash=digest(raw);const row=await db().prepare('SELECT u.*, (SELECT staff_number FROM profiles WHERE user_id=u.id) AS staff_number, s.csrf, s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').bind(hash,Date.now()).first<User&{csrf:string;token_hash:string}>();if(!row)fail(401,'انتهت الجلسة. يرجى تسجيل الدخول.');return row}
function publicUser(row:User):User{return {id:row.id,username:row.username,display_name:row.display_name,role:row.role,active:row.active,is_test:row.is_test,must_change_password:row.must_change_password??0,avatar_updated_at:row.avatar_updated_at??null,staff_number:row.staff_number??null}}
function head(user:User){if(user.role!=='head')fail(403,'هذه الصفحة متاحة لرئيس القسم فقط.')}
function editable(user:User){if(user.role!=='head'&&user.role!=='trainer')fail(403,'حسابك مخصص لقراءة مؤشرات القسم فقط.')}
function own(user:User,id:string){editable(user);if(user.role!=='head'&&user.id!==id)fail(403,'لا يمكنك الوصول إلى بيانات مستخدم آخر.')}
function auditStatement(actor:string,action:string,target:string|null){return db().prepare('INSERT INTO audit_log(id,actor_id,action,target_id,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,Date.now())}
const departmentActionSchema=z.object({kind:z.enum(['initiative','improvement']),category:z.enum(['withdrawn','dismissed','deprived']).nullable(),title:z.string().trim().min(3).max(140),description:z.string().trim().max(2500),expectedResult:z.string().trim().max(1000),status:z.enum(['planned','in_progress','completed']),targetDate:z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/),z.literal('')])}).strict().refine(v=>v.kind==='improvement'?v.category!==null:v.category===null,{message:'حدد حالة خطة التحسين فقط.'});
const trainerRecordSchema=z.object({courseKey:z.string().trim().min(1).max(180),category:z.enum(['exam','grade_analysis','blackboard','training','advising','development','assignment','initiative','exchange','portfolio','schedule']),itemKey:z.string().trim().min(1).max(120),status:z.enum(['done','not_done','not_applicable']),payload:z.record(z.string(),z.unknown()).default({})}).strict();


async function trainerContext(userId:string){
 const mapping=await db().prepare('SELECT staff_number FROM profiles WHERE user_id=?').bind(userId).first<{staff_number:string|null}>();
 const reports=(await db().prepare("SELECT kind,normalized_term,term,object_key FROM rayat_reports WHERE active=1 AND kind IN ('SF01','SS01') ORDER BY created_at DESC").all()).results;
 const ss=reports.find(r=>r.kind==='SS01'&&r.normalized_term),sf=reports.find(r=>r.kind==='SF01'&&r.normalized_term===ss?.normalized_term);
 let courses:ReturnType<typeof trainerRayatCourses>=[],linkStatus='ready';
 if(!mapping?.staff_number)linkStatus='missing_staff_number';
 else if(!ss||!sf)linkStatus=reports.some(r=>r.kind==='SS01')&&reports.some(r=>r.kind==='SF01')?'term_mismatch':'reports_missing';
 else{const [a,b]=await Promise.all([reportBytes(String(ss.object_key),String(ss.normalized_term)),reportBytes(String(sf.object_key),String(sf.normalized_term))]);if(a&&b){courses=trainerRayatCourses(a,b,mapping.staff_number,String(ss.normalized_term));if(!courses.length)linkStatus='no_assigned_sections'}else linkStatus='reports_unavailable'}
 return {courses,linkStatus,linked:linkStatus==='ready',term:ss?.term||sf?.term||null};
}
async function validateWorkScope(user:User,input:{category:string;courseKey:string;itemKey:string}){
 if((courseCategories.has(input.category)||input.category==='advising')&&!criteria.some(c=>c.category===input.category&&c.key===input.itemKey))fail(400,'البند المحدد غير معتمد.');
 if(courseCategories.has(input.category)){const context=await trainerContext(user.id);if(!context.courses.some(c=>c.key===input.courseKey))fail(403,'اختر شعبة مسندة إليك في الفصل الحالي.');}
 else if(input.courseKey!=='general')fail(400,'هذا السجل يخص المدرب ولا يرتبط بمقرر.');
 if(input.category==='schedule')fail(403,'إسناد المهام والمواعيد من اختصاص رئيس القسم.');
 if(input.category==='assignment'){const task=await db().prepare('SELECT id FROM trainer_tasks WHERE id=? AND trainer_id=?').bind(input.itemKey,user.id).first();if(!task)fail(403,'يمكن توثيق التكليفات المسندة إليك من رئيس القسم فقط.');}
}
const gradeSchema=z.object({fileId:z.string().min(1),maximum:z.number().positive().max(100),passMark:z.number().min(0).max(100),sheet:z.string().max(120),column:z.string().max(120),firstRow:z.number().int().positive(),lastRow:z.number().int().positive()}).strict();
const taskSchema=z.object({trainerId:z.string().min(1),title:z.string().trim().min(3).max(140),description:z.string().trim().max(2500).default(''),dueAt:z.string().datetime({offset:true}),reminderDays:z.number().int().min(0).max(30).default(7)}).strict();

export async function handle(req:Request){try{
 const path=new URL(req.url).pathname.replace(/^\/api\//,'').replace(/\/$/,'');const method=req.method;
 if(!['GET','POST','PATCH','PUT'].includes(method))fail(405,'طريقة الطلب غير مسموحة.');
 if(method!=='GET'&&req.headers.get('origin')!==new URL(req.url).origin)fail(403,'مصدر الطلب غير مسموح.');
 if(path==='system/initialize'&&method==='POST')return await initializeDepartment(req,db());
 if(path==='auth/login'&&method==='POST'){
  const input=z.object({username:z.string().trim().toLowerCase().min(1).max(80),password:z.string().min(1).max(128)}).strict().parse(await body(req));
  const key=digest('login:'+input.username),now=Date.now();
  await db().prepare('DELETE FROM login_attempts WHERE reset_at<=?').bind(now).run();
  const attempt=await db().prepare('INSERT INTO login_attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+15*60*1000).first<{count:number}>();
  if(attempt&&attempt.count>8)fail(429,'محاولات دخول كثيرة. حاول مجددًا بعد ١٥ دقيقة.');
  const user=await db().prepare('SELECT * FROM users WHERE username=?').bind(input.username).first<User&{password_hash:string}>();
  // Constant-cost verification also for unknown accounts; no default user is created here.
  const dummy='scrypt$16384$8$5$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
  const valid=verifyPassword(input.password,user?.password_hash||dummy);
  if(!user||!valid||!user.active)fail(401,'اسم المستخدم أو كلمة المرور غير صحيحة.');
  const raw=token(),csrf=token();const old=cookieToken(req);
  await db().batch([
   db().prepare('DELETE FROM sessions WHERE expires_at<=? OR token_hash=?').bind(now,digest(old)),
   db().prepare('DELETE FROM login_attempts WHERE key=?').bind(key),
   db().prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)').bind(digest(raw),user.id,csrf,now+8*60*60*1000),auditStatement(user.id,'login',null)
  ]);
  return json({user:publicUser(user),csrf},200,{'Set-Cookie':cookie(req,raw)});
 }
 const user=await session(req);
 if(method!=='GET'&&req.headers.get('x-csrf-token')!==user.csrf)fail(403,'تعذر التحقق من الطلب. أعد تحميل الصفحة.');
 if(path==='auth/me'&&method==='GET')return json({user:publicUser(user),csrf:user.csrf});
  if(path==='auth/password'&&method==='POST'){
   if(!user.must_change_password)fail(409,'لا توجد مطالبة بتغيير كلمة المرور لهذا الحساب.');
   const input=z.object({password:passwordSchema}).strict().parse(await body(req)),now=Date.now();
   await db().batch([db().prepare('UPDATE users SET password_hash=?,must_change_password=0,updated_at=? WHERE id=?').bind(hashPassword(input.password),now,user.id),db().prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').bind(user.id,user.token_hash),auditStatement(user.id,'initial_password_changed',user.id)]);
   return json({ok:true});
  }
  if(user.must_change_password&&path!=='auth/logout')fail(428,'غيّر كلمة المرور المؤقتة أولًا لمتابعة استخدام المنصة.');
 if(path==='auth/logout'&&method==='POST'){await db().batch([db().prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash),auditStatement(user.id,'logout',null)]);return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)})}
 if(path==='profile/avatar'&&method==='POST'){
  editable(user);
  if(!req.headers.get('content-type')?.startsWith('multipart/form-data'))fail(415,'اختر صورة شخصية.');
  if(Number(req.headers.get('content-length')||0)>maxAvatarBytes+4096)fail(413,'حجم الصورة يتجاوز ٢ ميغابايت.');
  const form=await limitedForm(req,uploadLimit(path)),file=form.get('file');
  if(!(file instanceof File)||file.size<1||file.size>maxAvatarBytes)fail(400,'اختر صورة لا تتجاوز ٢ ميغابايت.');
  const bytes=new Uint8Array(await file.arrayBuffer()),mime=imageType(bytes);
  if(!mime)fail(400,'الصورة يجب أن تكون PNG أو JPG أو WebP.');
  const key='avatars/'+user.id+'/'+crypto.randomUUID();
  const previous=await db().prepare('SELECT avatar_key FROM users WHERE id=?').bind(user.id).first<{avatar_key:string|null}>();
  await bucket().put(key,bytes,{httpMetadata:{contentType:mime}});
  try{await db().batch([db().prepare('UPDATE users SET avatar_key=?,avatar_updated_at=?,updated_at=? WHERE id=?').bind(key,Date.now(),Date.now(),user.id),auditStatement(user.id,'avatar_updated',user.id)])}catch(error){await bucket().delete(key);throw error}
  if(previous?.avatar_key)await bucket().delete(previous.avatar_key);
  return json({ok:true,avatarUpdatedAt:Date.now()});
 }
 const avatarMatch=path.match(/^users\/([^/]+)\/avatar$/);
 if(avatarMatch&&method==='GET'){
  const id=avatarMatch[1];if(user.id!==id&&user.role!=='head')fail(403,'الصورة غير متاحة لحسابك.');
  const row=await db().prepare('SELECT avatar_key FROM users WHERE id=? AND active=1').bind(id).first<{avatar_key:string|null}>();
  if(!row?.avatar_key)fail(404,'لا توجد صورة شخصية.');
  const object=await bucket().get(row.avatar_key);if(!object?.body)fail(404,'تعذر العثور على الصورة.');
  return privateFile(object.body,object.httpMetadata?.contentType||'application/octet-stream','الصورة-الشخصية',true);
 }
 if(path==='dashboard'&&method==='GET'){
  const trainer=user.role==='trainer';
  const scalar=async(sql:string,...params:string[])=>Number((await db().prepare(sql).bind(...params).first<{n:number}>())?.n||0);
  const [trainees,sections,courses,trainers,pref]=await Promise.all([
   trainer?scalar('SELECT COUNT(DISTINCT e.trainee_id) n FROM enrollments e JOIN sections s ON s.id=e.section_id WHERE s.trainer_id=?',user.id):scalar('SELECT COUNT(*) n FROM trainees'),
   trainer?scalar('SELECT COUNT(*) n FROM sections WHERE trainer_id=?',user.id):scalar('SELECT COUNT(*) n FROM sections'),
   trainer?scalar('SELECT COUNT(DISTINCT course_id) n FROM sections WHERE trainer_id=?',user.id):scalar('SELECT COUNT(*) n FROM courses'),
   trainer?Promise.resolve(null):scalar("SELECT COUNT(*) n FROM users WHERE role='trainer' AND active=1 AND is_test=0"),
   db().prepare('SELECT layout FROM dashboard_preferences WHERE user_id=?').bind(user.id).first<{layout:string}>()
  ]);
  const reports=(await db().prepare("SELECT id,kind,term,normalized_term,summary,object_key,created_at FROM rayat_reports WHERE active=1 AND kind IN ('SF01','SF06','SL03','SO01','SO08','SS01') ORDER BY created_at DESC").all()).results;
  const registrationReport=reports.find(r=>r.kind==='SF01'&&r.normalized_term);
  const selectedTerm=registrationReport?.normalized_term||reports.find(r=>r.normalized_term)?.normalized_term||null;
  const reportFor=(kind:string)=>kind==='SF06'?reports.find(r=>r.kind===kind):reports.find(r=>r.kind===kind&&r.normalized_term===selectedTerm);
  const parsed=(kind:string)=>{const row=reportFor(kind);return row?{row,summary:JSON.parse(String(row.summary)) as Record<string,number>}:null};
  const sf01=parsed('SF01'),ss01=parsed('SS01'),so01=parsed('SO01'),so08=parsed('SO08'),sl03=parsed('SL03'),sf06=parsed('SF06');
  let metricValues={trainees,sections,courses,trainers};
  let trainerLinkRequired=false;
  if(trainer){
   const mapping=await db().prepare('SELECT staff_number FROM profiles WHERE user_id=?').bind(user.id).first<{staff_number:string|null}>();
   trainerLinkRequired=!mapping?.staff_number;
   if(mapping?.staff_number&&sf01&&ss01){
    const [scheduleBytes,registrationBytes]=await Promise.all([reportBytes(String(ss01.row.object_key),String(selectedTerm||'')),reportBytes(String(sf01.row.object_key),String(selectedTerm||''))]);
    if(scheduleBytes&&registrationBytes){
     const personal=trainerRayatMetrics(scheduleBytes,registrationBytes,mapping.staff_number.trim());
     metricValues={trainees:personal.trainees,sections:personal.sections,courses:personal.courses,trainers:null};
     trainerLinkRequired=!personal.staffLinked;
    }
   }
  }else{
   metricValues={trainees:sf01?.summary.trainees??trainees,sections:ss01?.summary.sections??sections,courses:sf01?.summary.courses??courses,trainers};
  }
  const registrationRows=sf01?.summary.departmentRows??null,scheduleRegistrations=ss01?.summary.enrolled??null,courseRegistrations=so08?.summary.enrolled??null;
  const compared=[registrationRows,scheduleRegistrations,courseRegistrations].filter((n):n is number=>typeof n==='number');
  const reconciliation={SF01:registrationRows,SS01:scheduleRegistrations,SO08:courseRegistrations,consistent:compared.length===3&&new Set(compared).size===1,available:compared.length};
  let linkage=null;
  if(!trainer&&sf01&&ss01&&so01&&so08){
   const binaries=await Promise.all([ss01,sf01,so01,so08].map(item=>reportBytes(String(item.row.object_key),String(selectedTerm||''))));
   if(binaries.every(item=>item)){
    linkage=rayatLinkage(binaries[0]!,binaries[1]!,binaries[2]!,binaries[3]!);
   }
  }
  const rayat=trainer?{linked:!trainerLinkRequired}: {
   term:sf01?.row.term||ss01?.row.term||null,normalizedTerm:selectedTerm,
   registered:sf01?.summary.trainees??null,withdrawn:sf01?.summary.withdrawn??null,dismissed:sf01?.summary.dismissed??null,deprived:sf01?.summary.deprived??null,
   unregistered:sf06?.summary.trainees??null,withUnexcusedAbsence:linkage?.electricalWithUnexcusedAbsence??null,allCourseDeprived:linkage?.electricalDeprived??null,
   sections:ss01?.summary.sections??null,sectionRegistrations:scheduleRegistrations,remoteSections:ss01?.summary.remoteSections??null,remoteRegistrations:ss01?.summary.remoteRegistrations??null,confirmedRemoteSections:ss01?.summary.confirmedRemoteSections??null,
   continuingRegistrations:so08?.summary.continuingRegistrations??null,deprivedRegistrations:so08?.summary.deprivedRegistrations??null,dismissedRegistrations:so08?.summary.dismissedRegistrations??null,withdrawnRegistrations:so08?.summary.withdrawnRegistrations??null,
   staff:sl03?.summary.staff??null,excludedStaff:sl03?.summary.excludedStaff??0,reconciliation,linkage
  };
  const source=(report:typeof sf01,fallback:string)=>report?{name:report.row.kind,reportId:report.row.id,term:report.row.term,updatedAt:report.row.created_at}:{name:fallback,reportId:null,term:null,updatedAt:null};const metricSources={trainees:source(sf01,'السجلات المحفوظة'),sections:source(ss01,'السجلات المحفوظة'),courses:source(sf01,'السجلات المحفوظة'),trainers:{name:'حسابات المدربين النشطة غير التجريبية',reportId:null,term:null,updatedAt:null},staff:source(sl03,'تقرير SL03 غير متاح')};return json({scope:trainer?'personal':'department',metrics:metricValues,metricSources,rayat,layout:pref?layoutSchema.parse(JSON.parse(pref.layout)):defaultLayout,asOf:Date.now()});
 }
 if(path==='trainer/workspace'&&method==='GET'){
  if(user.role!=='trainer')fail(403,'مساحة العمل هذه متاحة للمدرب فقط.');
  const context=await trainerContext(user.id);
  return json({...context,courses:context.courses.map(({learnerIds,...course})=>course),...await workspaceData(req.url,user.id,context.courses)});
 }
 const recordFilesMatch=path.match(/^trainer\/workspace\/records\/([^/]+)\/files$/);
 if(recordFilesMatch&&method==='GET'){if(user.role!=='trainer')fail(403,'هذه المرفقات متاحة لصاحبها فقط.');const result=await workspaceFiles(req.url,user.id,recordFilesMatch[1]);if(!result)fail(404,'السجل غير موجود.');return json(result)}
 if(path==='trainer/workspace/analysis'&&method==='POST'){
  if(user.role!=='trainer')fail(403,'تحليل الدرجات متاح للمدرب صاحب الملف فقط.');
  const {fileId,...input}=gradeSchema.parse(await body(req));
  const record=await db().prepare("SELECT r.id,r.course_key,r.item_key,r.revision,f.object_key,f.original_filename FROM trainer_work_records r JOIN trainer_work_files f ON f.record_id=r.id WHERE f.id=? AND r.trainer_id=? AND r.category='grade_analysis'").bind(fileId,user.id).first<{id:string;course_key:string;item_key:string;revision:number;object_key:string;original_filename:string}>();
  if(!record)fail(404,'ملف الدرجات غير موجود في حسابك.');
  await validateWorkScope(user,{category:'grade_analysis',courseKey:record.course_key,itemKey:record.item_key});
  let payload;try{const object=await bucket().get(record.object_key);if(!object)fail(409,'ملف الدرجات المحفوظ غير متاح.');const bytes=await object.arrayBuffer(),sheets=await readGradeWorkbook(new File([bytes],record.original_filename));const sheet=sheets.find(s=>s.name===input.sheet),match=input.column.match(/\[(\d+)\]$/);if(!sheet||!match)fail(400,'اختر الورقة وعمود الدرجات من الملف المحفوظ.');const column=Number(match[1])-1,values=selectedGrades(sheet,column,input.firstRow,input.lastRow,input.maximum);payload={...calculateGrades({...input,...values}),sourceFileId:fileId,sourceHash:createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),sourceParserVersion:gradeParserVersion,columnIndex:column,formulaPolicy:'cached-numeric-only',validatedAt:Date.now()}}catch(error){if(error instanceof HttpError)throw error;fail(400,(error as Error).message)}
  const saved=await db().batch([db().prepare("UPDATE trainer_work_records SET status='done',payload=?,updated_at=?,revision=revision+1 WHERE id=? AND trainer_id=? AND course_key=? AND revision=?").bind(JSON.stringify(payload),Date.now(),record.id,user.id,record.course_key,record.revision),db().prepare("INSERT INTO audit_log(id,actor_id,action,target_id,created_at) SELECT ?,?,'grade_analysis_confirmed',?,? WHERE changes()=1").bind(crypto.randomUUID(),user.id,record.id,Date.now())]);
  if(!saved[0].meta.changes)fail(409,'تغيّر سجل الدرجات أثناء التحليل. أعد قراءة الملف الحالي واعتماده.');
  return json({payload});
 }
 const scopeMatch=path.match(/^trainer\/workspace\/records\/([^/]+)\/scope$/);
 if(scopeMatch&&method==='PATCH'){
  if(user.role!=='trainer')fail(403,'تعديل الربط متاح لصاحب السجل فقط.');
  const {courseKey}=z.object({courseKey:z.string().min(1).max(180)}).strict().parse(await body(req));
  const record=await db().prepare('SELECT category,item_key FROM trainer_work_records WHERE id=? AND trainer_id=?').bind(scopeMatch[1],user.id).first<{category:string;item_key:string}>();if(!record)fail(404,'السجل غير موجود.');
  await validateWorkScope(user,{courseKey,category:record.category,itemKey:record.item_key});
  const duplicate=await db().prepare('SELECT id FROM trainer_work_records WHERE trainer_id=? AND course_key=? AND category=? AND item_key=? AND id<>?').bind(user.id,courseKey,record.category,record.item_key,scopeMatch[1]).first();if(duplicate)fail(409,'يوجد سجل لهذا البند في الشعبة المختارة. بقي السجل السابق محفوظًا في ملف الإنجاز.');
  await db().batch([db().prepare('UPDATE trainer_work_records SET course_key=?,updated_at=?,revision=revision+1 WHERE id=?').bind(courseKey,Date.now(),scopeMatch[1]),auditStatement(user.id,'trainer_record_scope_updated',scopeMatch[1])]);return json({ok:true});
 }
 if(path==='tasks'&&method==='GET'){
  editable(user);const params=new URL(req.url).searchParams,trainerId=user.role==='trainer'?user.id:params.get('trainer')||'',query=(params.get('q')||'').trim().slice(0,140),status=params.get('status')||'',task=params.get('task')||'',page=pagination(req.url,{path,user:user.id,trainerId,query,status,task}),conditions=['t.created_at<=?'],values:unknown[]=[page.at];
  if(trainerId){conditions.push('t.trainer_id=?');values.push(trainerId)}if(query){conditions.push('instr(lower(t.title),lower(?))>0');values.push(query)}if(status){if(!['pending','done'].includes(status))fail(400,'حالة التكليف غير صالحة.');conditions.push('t.status=?');values.push(status)}if(task){conditions.push('t.id=?');values.push(task)}
  const total=await db().prepare('SELECT COUNT(*) n FROM trainer_tasks t WHERE '+conditions.join(' AND ')).bind(...values).first<{n:number}>();
  if(page.cursor){conditions.push('(t.due_at>? OR(t.due_at=? AND t.id>?))');values.push(page.cursor.key,page.cursor.key,page.cursor.id)}
  const rows=(await db().prepare('SELECT t.*,u.display_name AS trainer_name,c.display_name AS created_by_name FROM trainer_tasks t JOIN users u ON u.id=t.trainer_id JOIN users c ON c.id=t.created_by WHERE '+conditions.join(' AND ')+' ORDER BY t.due_at,t.id LIMIT ?').bind(...values,page.limit+1).all()).results,result=page.finish(rows,'due_at');return json({tasks:result.items,nextCursor:result.nextCursor,total:total?.n||0});
 }
 if(path==='tasks'&&method==='POST'){
  head(user);const input=taskSchema.parse(await body(req));const trainer=await db().prepare("SELECT id FROM users WHERE id=? AND role='trainer' AND active=1").bind(input.trainerId).first();if(!trainer)fail(400,'اختر حساب مدرب نشطًا.');
  const id=crypto.randomUUID(),now=Date.now(),dueAt=new Date(input.dueAt).toISOString();await db().batch([db().prepare('INSERT INTO trainer_tasks(id,trainer_id,title,description,due_at,reminder_days,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,input.trainerId,input.title,input.description,dueAt,input.reminderDays,user.id,now,now),auditStatement(user.id,'task_assigned',id)]);return json({id},201);
 }
 const taskMatch=path.match(/^tasks\/([^/]+)$/);
 if(taskMatch&&method==='PATCH'){
  editable(user);const task=await db().prepare('SELECT trainer_id FROM trainer_tasks WHERE id=?').bind(taskMatch[1]).first<{trainer_id:string}>();if(!task)fail(404,'التكليف غير موجود.');if(user.role==='trainer'&&task.trainer_id!==user.id)fail(403,'لا يمكنك تحديث تكليف مدرب آخر.');
  const input=z.object({status:z.enum(['pending','done'])}).strict().parse(await body(req));await db().batch([db().prepare('UPDATE trainer_tasks SET status=?,updated_at=? WHERE id=?').bind(input.status,Date.now(),taskMatch[1]),auditStatement(user.id,'task_status_updated',taskMatch[1])]);return json({ok:true});
 }
 if(path==='trainer/workspace/portfolio'&&method==='GET'){
  if(user.role!=='trainer')fail(403,'ملف الإنجاز متاح لصاحب الحساب فقط.');
  const context=await trainerContext(user.id),profile=await db().prepare('SELECT specialty,staff_number,office_hours FROM profiles WHERE user_id=?').bind(user.id).first();
  const metadataBounds=await db().prepare(`SELECT
   (SELECT COUNT(*) FROM trainer_work_records WHERE trainer_id=?) AS record_count,
   (SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM trainer_work_records WHERE trainer_id=?) AS record_payload_bytes,
   (SELECT COUNT(*) FROM trainer_tasks WHERE trainer_id=?) AS task_count,
   (SELECT COALESCE(SUM(length(CAST(title AS BLOB))+length(CAST(description AS BLOB))),0) FROM trainer_tasks WHERE trainer_id=?) AS task_text_bytes
  `).bind(user.id,user.id,user.id,user.id).first<{record_count:number;record_payload_bytes:number;task_count:number;task_text_bytes:number}>();
  if(!metadataBounds||metadataBounds.record_count>2000||metadataBounds.record_payload_bytes>512*1024||metadataBounds.task_count>2000||metadataBounds.task_text_bytes>512*1024||context.courses.length>500)fail(413,'بيانات ملف الإنجاز تتجاوز الحد المتاح للتصدير الكامل. اعرض السجلات أو نزّل الشواهد المطلوبة منفردة.');

  const records=(await db().prepare('SELECT * FROM trainer_work_records WHERE trainer_id=? ORDER BY updated_at LIMIT 2001').bind(user.id).all()).results;
  const workFiles=(await db().prepare('SELECT f.*,r.category,r.item_key FROM trainer_work_files f JOIN trainer_work_records r ON r.id=f.record_id WHERE r.trainer_id=? LIMIT 101').bind(user.id).all()).results;
  const otherFiles=(await db().prepare('SELECT v.*,e.title FROM evidence_versions v JOIN evidence e ON e.id=v.evidence_id WHERE e.trainer_id=? ORDER BY v.created_at LIMIT 101').bind(user.id).all()).results;
  const allFiles=[...workFiles,...otherFiles];if(allFiles.length>100||allFiles.reduce((n,f)=>n+Number(f.byte_size),0)>32*1024*1024)fail(413,'يدعم التصدير حتى ١٠٠ مرفق ومجموع ٣٢ ميغابايت. اطبع الملخص ونزّل الملفات الأكبر من روابطها.');
  for(const f of allFiles){const object=await bucket().head(String(f.object_key));if(!object||object.size!==Number(f.byte_size))fail(409,'تعذر التحقق من أحد الشواهد؛ لم يُنشأ ملف ناقص.')}
  const tasks=(await db().prepare('SELECT * FROM trainer_tasks WHERE trainer_id=? ORDER BY due_at LIMIT 2001').bind(user.id).all()).results;
  const encodedLength=(value:unknown)=>new TextEncoder().encode(String(value??'')).length;
  if(records.length>2000||tasks.length>2000||records.reduce((n,r)=>n+encodedLength(r.payload),0)>512*1024||tasks.reduce((n,t)=>n+encodedLength(t.title)+encodedLength(t.description),0)>512*1024)fail(413,'بيانات ملف الإنجاز تتجاوز الحد المتاح للتصدير الكامل.');
  const html=portfolioDocument({user,profile:profile||{},courses:context.courses,records:records.map(r=>({...r,payload:JSON.parse(String(r.payload)),files:workFiles.filter(f=>f.record_id===r.id)})) as never,tasks:tasks as never,attachments:[],attachmentCount:allFiles.length});
  const parts=html.split('<!--attachment-stream-->'),encoder=new TextEncoder();
  async function* chunks(){yield encoder.encode(parts[0]);for(const f of allFiles){const object=await bucket().get(String(f.object_key));if(!object||object.size!==Number(f.byte_size))throw new Error('تعذر إكمال تنزيل المرفقات. أعد المحاولة.');yield* portfolioAttachmentChunks({id:String(f.id),filename:String(f.original_filename),title:String(f.title||f.original_filename)},object.body,Number(f.byte_size))}if(parts[1])yield encoder.encode(parts[1])}
  const iterator=chunks(),stream=new ReadableStream<Uint8Array>({async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(next.value)}catch(error){controller.error(error)}},async cancel(){await iterator.return(undefined)}});
  return new Response(stream,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="portfolio-${user.username}.html"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(path==='trainer/workspace/records'&&method==='POST'){
  if(user.role!=='trainer')fail(403,'هذه البيانات متاحة للمدرب فقط.');
  const input=trainerRecordSchema.parse(await body(req));
  await validateWorkScope(user,input);
  if(input.category==='grade_analysis')fail(400,'استخدم معاينة ملف الدرجات لاعتماد التحليل من مصدره المحفوظ.');
  if(input.category==='training'&&input.itemKey==='methods'&&input.status==='done'&&(!Array.isArray(input.payload.methods)||!input.payload.methods.length||input.payload.methods.some(m=>!trainingMethods.includes(String(m)))))fail(400,'حدد أسلوب تدريب مستخدمًا واحدًا على الأقل.');
  if(input.status==='not_applicable')fail(403,'تحديد البنود غير المنطبقة من اختصاص رئيس القسم.');
  const record=await db().prepare('SELECT id FROM trainer_work_records WHERE trainer_id=? AND course_key=? AND category=? AND item_key=?').bind(user.id,input.courseKey,input.category,input.itemKey).first<{id:string}>();
  const id=record?.id||crypto.randomUUID(),now=Date.now();
  if(input.status==='done'&&(['exam','development','exchange'].includes(input.category)||['blackboard:content','blackboard:syllabus','training:assignments'].includes(input.category+':'+input.itemKey))){
   const evidence=record&&await db().prepare('SELECT id FROM trainer_work_files WHERE record_id=? LIMIT 1').bind(id).first();if(!evidence)fail(400,'ارفع الشاهد المطلوب أولًا قبل اعتماد التنفيذ.');
  }
  const saved=await db().batch<{id:string;updated_at:number}>([
   db().prepare('INSERT INTO trainer_work_records(id,trainer_id,course_key,category,item_key,status,payload,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(trainer_id,course_key,category,item_key) DO UPDATE SET status=excluded.status,payload=excluded.payload,updated_at=excluded.updated_at,revision=revision+1').bind(id,user.id,input.courseKey,input.category,input.itemKey,input.status,JSON.stringify(input.payload),now,now),
   db().prepare("INSERT INTO audit_log(id,actor_id,action,target_id,created_at) SELECT ?,?,'trainer_work_saved',id,? FROM trainer_work_records WHERE trainer_id=? AND course_key=? AND category=? AND item_key=?").bind(crypto.randomUUID(),user.id,now,user.id,input.courseKey,input.category,input.itemKey),
   db().prepare('SELECT id,updated_at FROM trainer_work_records WHERE trainer_id=? AND course_key=? AND category=? AND item_key=?').bind(user.id,input.courseKey,input.category,input.itemKey)
  ]);
  const result=saved[2].results[0];if(!result)fail(500,'تعذر قراءة نتيجة الحفظ.');return json({id:result.id,updatedAt:result.updated_at});
 }
 if(path==='trainer/workspace/files'&&method==='POST'){
  if(user.role!=='trainer')fail(403,'رفع الشواهد متاح للمدرب فقط.');
  if(!req.headers.get('content-type')?.startsWith('multipart/form-data'))fail(415,'اختر ملفًا لإرفاقه.');
  if(Number(req.headers.get('content-length')||0)>10*1024*1024+8192)fail(413,'حجم الملف يتجاوز ١٠ ميغابايت.');
  const form=await limitedForm(req,uploadLimit(path)),file=form.get('file');if(!(file instanceof File)||file.size<1||file.size>10*1024*1024)fail(400,'اختر ملفًا لا يتجاوز ١٠ ميغابايت.');
  const purpose=z.enum(['evidence','decision']).parse(form.get('purpose')||'evidence');
  const input=trainerRecordSchema.pick({courseKey:true,category:true,itemKey:true}).parse({courseKey:form.get('courseKey'),category:form.get('category'),itemKey:form.get('itemKey')});
  await validateWorkScope(user,input);
  if(purpose==='decision'&&input.category!=='assignment')fail(400,'قرار التكليف يرفق ضمن التكليفات فقط.');
  const bytes=new Uint8Array(await file.arrayBuffer());let mime:string;try{mime=await workFileType(file,bytes,input.category,purpose)}catch(error){fail(400,(error as Error).message)}
  const requestId=uploadKey(req),fingerprint=uploadFingerprint(bytes,{...input,purpose,filename:file.name}),replayed=await uploadReceipt(requestId,user.id,path,fingerprint);if(replayed)return json(replayed,200);
  const existing=await db().prepare('SELECT id FROM trainer_work_records WHERE trainer_id=? AND course_key=? AND category=? AND item_key=?').bind(user.id,input.courseKey,input.category,input.itemKey).first<{id:string}>();
  const provisionalId=existing?.id||crypto.randomUUID(),fileId=crypto.randomUUID(),key='trainer-work/'+user.id+'/'+provisionalId+'/'+fileId,now=Date.now();
  // R2 must succeed before creating any record. This unique candidate key is not referenced yet.
  try{await bucket().put(key,bytes,{httpMetadata:{contentType:mime}})}catch(error){await bucket().delete(key).catch(()=>console.warn('trainer_upload_candidate_cleanup_failed'));throw error}
  try{
   await db().batch([
    db().prepare("INSERT INTO trainer_work_records(id,trainer_id,course_key,category,item_key,status,payload,updated_at,created_at) VALUES(?,?,?,?,?,'not_done','{}',?,?) ON CONFLICT(trainer_id,course_key,category,item_key) DO NOTHING").bind(provisionalId,user.id,input.courseKey,input.category,input.itemKey,now,now),
    db().prepare('INSERT INTO trainer_work_files(id,record_id,object_key,original_filename,content_type,byte_size,uploaded_by,created_at,purpose) SELECT ?,r.id,?,?,?,?,?,?,? FROM trainer_work_records r WHERE r.trainer_id=? AND r.course_key=? AND r.category=? AND r.item_key=?').bind(fileId,key,file.name.slice(0,180)||'ملف',mime,file.size,user.id,now,purpose,user.id,input.courseKey,input.category,input.itemKey),
    db().prepare("INSERT INTO upload_requests(id,actor_id,scope,fingerprint,result,created_at) SELECT ?,?,?,?,json_object('id',f.id,'recordId',f.record_id,'filename',?),? FROM trainer_work_files f WHERE f.id=?").bind(requestId,user.id,path,fingerprint,file.name,now,fileId),
    db().prepare("UPDATE trainer_work_records SET status=CASE WHEN category='grade_analysis' THEN 'not_done' ELSE status END,payload=CASE WHEN category='grade_analysis' THEN '{}' ELSE payload END,updated_at=?,revision=revision+1 WHERE id=(SELECT record_id FROM trainer_work_files WHERE id=?)").bind(now,fileId),
    db().prepare("INSERT INTO audit_log(id,actor_id,action,target_id,created_at) SELECT ?,?,'trainer_work_file_uploaded',f.record_id,? FROM trainer_work_files f WHERE f.id=?").bind(crypto.randomUUID(),user.id,now,fileId)
   ]);
  }catch(error){
   // A batch response can fail after a commit. Recover its receipt before deleting any object.
   let replay;
   try{replay=await uploadReceipt(requestId,user.id,path,fingerprint)}catch(lookupError){
    if(lookupError instanceof HttpError&&lookupError.status===409){await bucket().delete(key).catch(()=>console.warn('trainer_upload_candidate_cleanup_failed'));throw lookupError}
    // Outcome is unknown while DB lookup is unavailable. Keep the candidate instead of risking a referenced original.
    console.warn('trainer_upload_batch_outcome_unknown');throw error;
   }
   if(replay){if(replay.id!==fileId)await bucket().delete(key).catch(()=>console.warn('trainer_upload_candidate_cleanup_failed'));return json(replay,200)}
   await bucket().delete(key).catch(()=>console.warn('trainer_upload_candidate_cleanup_failed'));throw error;
  }
  const result=await uploadReceipt(requestId,user.id,path,fingerprint);if(!result)fail(500,'تعذر قراءة نتيجة الرفع المحفوظة. أعد المحاولة بالمفتاح نفسه.');
  return json(result,201);
 }
 const trainerWorkFile=path.match(/^trainer\/workspace\/files\/([^/]+)$/);
 if(trainerWorkFile&&method==='GET'){
  if(user.role!=='trainer')fail(403,'هذا الملف متاح لصاحبه فقط.');
  const row=await db().prepare('SELECT f.object_key,f.content_type,f.original_filename FROM trainer_work_files f JOIN trainer_work_records r ON r.id=f.record_id WHERE f.id=? AND r.trainer_id=?').bind(trainerWorkFile[1],user.id).first<{object_key:string;content_type:string;original_filename:string}>();
  if(!row)fail(404,'الملف غير موجود.');const object=await bucket().get(row.object_key);if(!object?.body)fail(404,'تعذر العثور على الملف.');return privateFile(object.body,row.content_type,row.original_filename);
 }
 if(path==='dashboard/preferences'&&method==='PUT'){editable(user);const layout=layoutSchema.parse(await body(req));await db().batch([db().prepare('INSERT INTO dashboard_preferences(user_id,layout,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET layout=excluded.layout,updated_at=excluded.updated_at').bind(user.id,JSON.stringify(layout),Date.now()),auditStatement(user.id,'dashboard_layout_updated',user.id)]);return json({layout})}
 if(path==='users'&&method==='GET'){
  head(user);const query=(new URL(req.url).searchParams.get('q')||'').trim().slice(0,120),page=pagination(req.url,{path,query}),conditions=['created_at<=?'],values:unknown[]=[page.at];if(query){conditions.push("(instr(lower(display_name),lower(?))>0 OR instr(lower(username),lower(?))>0 OR id IN(SELECT user_id FROM profiles WHERE instr(staff_number,?)>0))");values.push(query,query,query)}
  const total=await db().prepare('SELECT COUNT(*) n FROM users WHERE '+conditions.join(' AND ')).bind(...values).first<{n:number}>();
  if(page.cursor){conditions.push('(created_at<? OR (created_at=? AND id<?))');values.push(page.cursor.key,page.cursor.key,page.cursor.id)}
  const rows=(await db().prepare('SELECT '+publicColumns+',created_at FROM users WHERE '+conditions.join(' AND ')+' ORDER BY created_at DESC,id DESC LIMIT ?').bind(...values,page.limit+1).all()).results,result=page.finish(rows,'created_at');return json({users:result.items,nextCursor:result.nextCursor,total:total?.n||0});
 }
 if(path==='users/import'&&method==='POST'){
  head(user);
  const input=accountTransferSchema.parse(await body(req));
  const existing=(await db().prepare('SELECT '+publicColumns+' FROM users').all<User>()).results;
  let plan:ReturnType<typeof planAccountTransfer>;
  try{plan=planAccountTransfer(input,existing,user.id)}catch(e){fail(409,(e as Error).message)}
  const summary=plan.map(p=>({username:p.account.username,role:p.account.role,action:p.action}));
  if(input.dryRun)return json({accounts:summary,dryRun:true});
  const statements:D1PreparedStatement[]=[],now=Date.now();
  for(const {account:a,targetId:id,action} of plan){
   if(action==='create')statements.push(db().prepare('INSERT INTO users(id,username,display_name,password_hash,role,active,is_test,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,1,0,?,?,?)').bind(id,a.username,a.display_name,a.password_hash,a.role,a.must_change_password,now,now));
   else statements.push(db().prepare('UPDATE users SET username=?,display_name=?,password_hash=?,active=1,is_test=0,must_change_password=?,updated_at=? WHERE id=? AND role=?').bind(a.username,a.display_name,a.password_hash,a.must_change_password,now,id,a.role),db().prepare('DELETE FROM sessions WHERE user_id=?').bind(id));
   statements.push(db().prepare('INSERT INTO profiles(user_id,staff_number,office,specialty,office_hours) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET staff_number=excluded.staff_number,office=excluded.office,specialty=excluded.specialty,office_hours=excluded.office_hours').bind(id,a.staff_number,a.office,a.specialty,JSON.stringify(a.office_hours)),auditStatement(user.id,'account_transferred',id));
  }
  try{await db().batch(statements)}catch(e){if(String(e).includes('UNIQUE'))fail(409,'تغيّرت الحسابات أثناء النقل. أعد مراجعة المطابقة.');throw e}
  return json({accounts:summary,transferred:plan.length});
 }
 if(path==='users'&&method==='POST'){
  head(user);const input=createUserSchema.parse(await body(req));const id=crypto.randomUUID(),now=Date.now();const passwordHash=hashPassword(input.password);
   try{await db().batch([db().prepare('INSERT INTO users(id,username,display_name,password_hash,role,active,is_test,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?,?)').bind(id,input.username,input.display_name,passwordHash,input.role,+input.is_test,input.is_test?+(input.must_change_password??false):1,now,now),db().prepare('INSERT INTO profiles(user_id,staff_number) VALUES(?,?)').bind(id,input.staff_number??null),auditStatement(user.id,'user_created',id)])}catch(e){if(String(e).includes('UNIQUE'))fail(409,'اسم المستخدم أو الرقم الوظيفي مستخدم بالفعل.');throw e}
  return json({user:await db().prepare('SELECT '+publicColumns+' FROM users WHERE id=?').bind(id).first()},201);
 }
 const userMatch=path.match(/^users\/([^/]+)$/);
 if(userMatch&&method==='PATCH'){
  head(user);const id=userMatch[1],input=updateUserSchema.parse(await body(req));const target=await db().prepare('SELECT '+publicColumns+' FROM users WHERE id=?').bind(id).first<User>();if(!target)fail(404,'الحساب غير موجود.');if(input.staff_number&&((input.role??target.role)!=='trainer'))fail(400,'يرتبط الرقم الوظيفي بحساب مدرب فقط.');
  if(id===user.id&&(input.active===false||(input.role&&input.role!=='head')))fail(409,'لا يمكنك إيقاف حسابك أو تغيير دورك الإداري.');
  // Prevent concurrent demotions from removing the last active head in one SQL statement.
  const result=await db().batch([
   db().prepare("UPDATE users SET display_name=?,role=?,active=?,password_hash=COALESCE(?,password_hash),must_change_password=CASE WHEN ?=1 THEN 1 ELSE must_change_password END,updated_at=? WHERE id=? AND NOT (role='head' AND active=1 AND (?<>'head' OR ?=0) AND (SELECT COUNT(*) FROM users WHERE role='head' AND active=1)<=1)").bind(input.display_name??target.display_name,input.role??target.role,input.active===undefined?target.active:+input.active,input.password?hashPassword(input.password):null,input.password&&!target.is_test?1:0,Date.now(),id,input.role??target.role,input.active===undefined?target.active:+input.active),
   ...(input.staff_number!==undefined?[db().prepare('UPDATE profiles SET staff_number=? WHERE user_id=?').bind(input.staff_number,id)]:input.role&&input.role!=='trainer'?[db().prepare('UPDATE profiles SET staff_number=NULL WHERE user_id=?').bind(id)]:[]),
   ...((input.password||input.role||input.active===false||input.staff_number!==undefined)?[db().prepare('DELETE FROM sessions WHERE user_id=?').bind(id)]:[]),auditStatement(user.id,input.password?'password_reset':input.staff_number!==undefined?'trainer_link_updated':'user_updated',id)
  ]);
  if(result[0].meta.changes===0)fail(409,'يجب إبقاء رئيس قسم نشط واحد على الأقل.');
  return json({ok:true});
 }
 const profileMatch=path.match(/^profiles\/([^/]+)$/);
 if(profileMatch){const id=profileMatch[1];own(user,id);if(method==='GET'){const row=await db().prepare('SELECT u.id,u.display_name,u.username,p.office,p.office_hours,p.specialty,p.staff_number FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id=?').bind(id).first();if(!row)fail(404,'الملف غير موجود.');return json({profile:{...row,office_hours:JSON.parse(String(row.office_hours||'[]'))}})}if(method==='PATCH'){const input=profileSchema.parse(await body(req));const exists=await db().prepare('SELECT user_id FROM profiles WHERE user_id=?').bind(id).first();if(!exists)fail(404,'الملف غير موجود.');await db().batch([db().prepare('UPDATE profiles SET office=COALESCE(?,office),specialty=?,office_hours=COALESCE(?,office_hours) WHERE user_id=?').bind(input.office??null,input.specialty,input.office_hours?JSON.stringify(input.office_hours):null,id),auditStatement(user.id,'profile_updated',id)]);return json({ok:true})}}
 if(path==='evidence/trainers'&&method==='GET'){
  head(user);return json({trainers:(await db().prepare("SELECT id,display_name,username FROM users WHERE role='trainer' AND active=1 ORDER BY display_name").all()).results});
 }
 if(path==='evidence'&&method==='GET'){
  editable(user);const params=new URL(req.url).searchParams,query=(params.get('q')||'').trim().slice(0,120),status=params.get('status')||'',trainerId=user.role==='trainer'?user.id:params.get('trainer')||'';
  if(status&&!['pending','passed','failed'].includes(status))fail(400,'حالة الشاهد غير صالحة.');
  const page=pagination(req.url,{path,user:user.id,query,status,trainerId}),conditions=['e.created_at<=?'],values:unknown[]=[page.at];
  if(trainerId){conditions.push('e.trainer_id=?');values.push(trainerId)}if(status){conditions.push('e.review_status=?');values.push(status)}if(query){conditions.push('instr(lower(e.title),lower(?))>0');values.push(query)}
  const where='WHERE '+conditions.join(' AND '),total=await db().prepare('SELECT COUNT(*) n FROM evidence e '+where).bind(...values).first<{n:number}>();
  if(page.cursor){conditions.push('(e.created_at<? OR (e.created_at=? AND e.id<?))');values.push(page.cursor.key,page.cursor.key,page.cursor.id)}
  const rows=(await db().prepare(`SELECT e.id,e.trainer_id,e.title,e.review_status,e.created_at,e.updated_at,u.display_name AS trainer_name,v.id AS latest_version_id,v.version_number,v.original_filename,v.content_type,v.byte_size,v.created_at AS version_at,up.display_name AS uploader_name FROM evidence e JOIN users u ON u.id=e.trainer_id LEFT JOIN evidence_versions v ON v.evidence_id=e.id AND v.version_number=(SELECT MAX(version_number) FROM evidence_versions WHERE evidence_id=e.id) LEFT JOIN users up ON up.id=v.uploaded_by WHERE ${conditions.join(' AND ')} ORDER BY e.created_at DESC,e.id DESC LIMIT ?`).bind(...values,page.limit+1).all()).results;
  const result=page.finish(rows,'created_at');return json({evidence:result.items,nextCursor:result.nextCursor,total:total?.n||0});
 }
 const historyMatch=path.match(/^evidence\/([^/]+)\/history$/);
 if(historyMatch&&method==='GET'){
  editable(user);const evidence=await db().prepare('SELECT trainer_id FROM evidence WHERE id=?').bind(historyMatch[1]).first<{trainer_id:string}>();if(!evidence)fail(404,'الشاهد غير موجود.');own(user,evidence.trainer_id);
  const page=pagination(req.url,{path,user:user.id});
  const historySql=`WITH events AS (
   SELECT v.id AS id,v.id AS version_id,v.version_number,v.original_filename,v.created_at AS version_at,up.display_name AS uploader_name,NULL AS review_status,NULL AS note,NULL AS reviewed_at,NULL AS reviewer_name,v.created_at AS event_at FROM evidence_versions v JOIN users up ON up.id=v.uploaded_by WHERE v.evidence_id=?
   UNION ALL SELECT r.id,v.id,v.version_number,v.original_filename,v.created_at,up.display_name,r.status,r.note,r.created_at,reviewer.display_name,r.created_at FROM evidence_reviews r JOIN evidence_versions v ON v.id=r.version_id JOIN users up ON up.id=v.uploaded_by JOIN users reviewer ON reviewer.id=r.reviewed_by WHERE r.evidence_id=?
  ) SELECT * FROM events WHERE event_at<=? ${page.cursor?'AND (event_at<? OR (event_at=? AND id<?))':''} ORDER BY event_at DESC,id DESC LIMIT ?`;
  const rows=(await db().prepare(historySql).bind(historyMatch[1],historyMatch[1],page.at,...(page.cursor?[page.cursor.key,page.cursor.key,page.cursor.id]:[]),page.limit+1).all()).results;
  const result=page.finish(rows,'event_at');return json({history:result.items,nextCursor:result.nextCursor});
 }
 const uploadMatch=path.match(/^evidence(?:\/([^/]+)\/versions)?$/);
 if(uploadMatch&&method==='POST'){
  editable(user);
  if(!req.headers.get('content-type')?.startsWith('multipart/form-data'))fail(415,'اختر ملف شاهد.');
  if(Number(req.headers.get('content-length')||0)>maxEvidenceBytes+8192)fail(413,'حجم الملف يتجاوز ١٠ ميغابايت.');
  const form=await limitedForm(req,uploadLimit(path)),file=form.get('file');
  if(!(file instanceof File)||file.size<1||file.size>maxEvidenceBytes)fail(400,'اختر ملفًا لا يتجاوز ١٠ ميغابايت.');
  const bytes=new Uint8Array(await file.arrayBuffer()),mime=evidenceType(bytes);
  if(!mime)fail(400,'الشواهد تقبل PDF أو PNG أو JPG أو WebP فقط.');
  const isNew=!uploadMatch[1],requestId=uploadKey(req),fingerprint=uploadFingerprint(bytes,{path,title:form.get('title'),trainer:form.get('trainer_id'),filename:file.name});const replay=await uploadReceipt(requestId,user.id,path,fingerprint);if(replay){const v=await db().prepare('SELECT version_number FROM evidence_versions WHERE id=?').bind(replay.versionId).first<{version_number:number}>();return json({...replay,version:v?.version_number})}let evidenceId=uploadMatch[1],trainerId=user.id,title='';
  if(evidenceId){
   const existing=await db().prepare('SELECT id,trainer_id,title FROM evidence WHERE id=?').bind(evidenceId).first<{id:string;trainer_id:string;title:string}>();
   if(!existing)fail(404,'الشاهد غير موجود.');own(user,existing.trainer_id);
   trainerId=existing.trainer_id;title=existing.title;
  }else{
   evidenceId=crypto.randomUUID();
   title=z.string().trim().min(3).max(120).parse(form.get('title'));
   if(user.role==='head'){
    trainerId=z.string().uuid().parse(form.get('trainer_id'));
    const trainer=await db().prepare("SELECT id FROM users WHERE id=? AND role='trainer' AND active=1").bind(trainerId).first();
    if(!trainer)fail(400,'اختر مدربًا نشطًا.');
   }
  }
  const versionId=crypto.randomUUID(),key='evidence/'+evidenceId+'/'+versionId,now=Date.now();
  await bucket().put(key,bytes,{httpMetadata:{contentType:mime}});
  try{
   await db().batch([
    ...(isNew?[db().prepare('INSERT INTO evidence(id,trainer_id,title,review_status,created_by,created_at,updated_at) VALUES(?,?,?,\'pending\',?,?,?)').bind(evidenceId,trainerId,title,user.id,now,now)]:[db().prepare("UPDATE evidence SET review_status='pending',updated_at=? WHERE id=?").bind(now,evidenceId)]),
    db().prepare('INSERT INTO evidence_versions(id,evidence_id,version_number,object_key,content_type,original_filename,byte_size,uploaded_by,created_at) SELECT ?,?,COALESCE(MAX(version_number),0)+1,?,?,?,?,?,? FROM evidence_versions WHERE evidence_id=?').bind(versionId,evidenceId,key,mime,file.name.slice(0,120)||'شاهد',file.size,user.id,now,evidenceId),receiptStatement(requestId,user.id,path,fingerprint,{id:evidenceId,versionId,trainerId}),
    auditStatement(user.id,isNew?'evidence_uploaded':'evidence_version_uploaded',evidenceId)
   ]);
  }catch(error){let replay;try{replay=await uploadReceipt(requestId,user.id,path,fingerprint)}catch(lookupError){if(lookupError instanceof HttpError&&lookupError.status===409){await bucket().delete(key).catch(()=>console.warn('evidence_candidate_cleanup_failed'));throw lookupError}console.warn('evidence_upload_batch_outcome_unknown');throw error}if(replay){if(replay.versionId!==versionId)await bucket().delete(key).catch(()=>console.warn('evidence_candidate_cleanup_failed'));const v=await db().prepare('SELECT version_number FROM evidence_versions WHERE id=?').bind(replay.versionId).first<{version_number:number}>();return json({...replay,version:v?.version_number})}await bucket().delete(key).catch(()=>console.warn('evidence_candidate_cleanup_failed'));throw error}
  const saved=await db().prepare('SELECT version_number FROM evidence_versions WHERE id=?').bind(versionId).first<{version_number:number}>();return json({id:evidenceId,version:saved!.version_number,versionId,trainerId},201);
 }
 const evidenceFile=path.match(/^evidence\/files\/([^/]+)$/);
 if(evidenceFile&&method==='GET'){
  editable(user);
  const row=await db().prepare('SELECT e.trainer_id,v.object_key,v.content_type,v.original_filename FROM evidence_versions v JOIN evidence e ON e.id=v.evidence_id WHERE v.id=?').bind(evidenceFile[1]).first<{trainer_id:string;object_key:string;content_type:string;original_filename:string}>();
  if(!row)fail(404,'الملف غير موجود.');own(user,row.trainer_id);
  const object=await bucket().get(row.object_key);if(!object?.body)fail(404,'تعذر العثور على الملف.');
  return privateFile(object.body,row.content_type,row.original_filename);
 }
 const reviewMatch=path.match(/^evidence\/([^/]+)\/review$/);
 if(reviewMatch&&method==='POST'){
  head(user);const input=z.object({status:z.enum(['passed','failed']),note:z.string().trim().max(1000),versionId:z.string().uuid()}).strict().parse(await body(req));
  const latest=await db().prepare('SELECT e.id,v.id AS version_id FROM evidence e JOIN evidence_versions v ON v.evidence_id=e.id WHERE e.id=? ORDER BY v.version_number DESC LIMIT 1').bind(reviewMatch[1]).first<{id:string;version_id:string}>();
  if(!latest)fail(404,'الشاهد غير موجود.');if(latest.version_id!==input.versionId)fail(409,'رُفعت نسخة أحدث. حدّث الصفحة قبل المراجعة.');
  const reviewId=crypto.randomUUID(),now=Date.now();
  const result=await db().batch([
   db().prepare('INSERT INTO evidence_reviews(id,evidence_id,version_id,status,note,reviewed_by,created_at) SELECT ?,?,?,?,?,?,? WHERE ?=(SELECT id FROM evidence_versions WHERE evidence_id=? ORDER BY version_number DESC LIMIT 1)').bind(reviewId,latest.id,input.versionId,input.status,input.note,user.id,now,input.versionId,latest.id),
   db().prepare('UPDATE evidence SET review_status=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM evidence_reviews WHERE id=?) AND ?=(SELECT id FROM evidence_versions WHERE evidence_id=? ORDER BY version_number DESC LIMIT 1)').bind(input.status,now,latest.id,reviewId,input.versionId,latest.id),
   db().prepare("INSERT INTO audit_log(id,actor_id,action,target_id,created_at) SELECT ?,?,'evidence_reviewed',?,? WHERE EXISTS(SELECT 1 FROM evidence_reviews WHERE id=?)").bind(crypto.randomUUID(),user.id,latest.id,now,reviewId)
  ]);if(result[0].meta.changes!==1||result[1].meta.changes!==1)fail(409,'رُفعت نسخة أحدث أثناء المراجعة. حدّث الشاهد ثم أعد مراجعته.');
  return json({ok:true});
 }
 if(path==='rayat'&&method==='GET'){
  head(user);const kind=new URL(req.url).searchParams.get('kind')||'',page=pagination(req.url,{path,kind}),conditions=['created_at<=?'],values:unknown[]=[page.at];if(kind){if(!Object.hasOwn(reportKinds,kind))fail(400,'نوع التقرير غير صالح.');conditions.push('kind=?');values.push(kind)}
  const total=await db().prepare('SELECT COUNT(*) n FROM rayat_reports WHERE '+conditions.join(' AND ')).bind(...values).first<{n:number}>();if(page.cursor){conditions.push('(created_at<? OR (created_at=? AND id<?))');values.push(page.cursor.key,page.cursor.key,page.cursor.id)}
  const columns='id,kind,term,normalized_term,original_filename,byte_size,summary,created_at,active';
  const rows=(await db().prepare('SELECT '+columns+' FROM rayat_reports WHERE '+conditions.join(' AND ')+' ORDER BY created_at DESC,id DESC LIMIT ?').bind(...values,page.limit+1).all()).results;
  const current=(await db().prepare(`SELECT ${columns} FROM rayat_reports r WHERE r.active=1 AND r.id=(SELECT a.id FROM rayat_reports a WHERE a.active=1 AND a.kind=r.kind ORDER BY a.created_at DESC,a.id DESC LIMIT 1)`).all()).results;
  const result=page.finish(rows,'created_at'),decode=(r:Record<string,unknown>)=>({...r,summary:JSON.parse(String(r.summary))});return json({reports:result.items.map(decode),current:current.map(decode),nextCursor:result.nextCursor,total:total?.n||0});
 }
 if(path==='rayat'&&method==='POST'){
  head(user);
  if(!req.headers.get('content-type')?.startsWith('multipart/form-data'))fail(415,'اختر ملف CSV من رايات.');
  if(Number(req.headers.get('content-length')||0)>maxRayatBytes+8192)fail(413,'حجم التقرير يتجاوز ٨ ميغابايت.');
  const form=await limitedForm(req,uploadLimit(path)),file=form.get('file'),kind=form.get('kind');
  if(typeof kind!=='string'||!Object.hasOwn(reportKinds,kind))fail(400,'اختر نوع التقرير الصحيح.');
  if(!(file instanceof File)||!file.name.toLowerCase().endsWith('.csv')||file.size<1||file.size>maxRayatBytes)fail(400,'اختر ملف CSV لا يتجاوز ٨ ميغابايت.');
  const bytes=new Uint8Array(await file.arrayBuffer());let inspection:ReturnType<typeof inspectRayat>;
  try{inspection=inspectRayat(kind as ReportKind,bytes)}catch(error){fail(400,error instanceof Error?error.message:'تقرير CSV غير صالح.')}
  // Both source labels were confirmed by the department to identify the same term.
  const normalized=inspection.term==='144710'||inspection.term==='الفصل التدريبي الأول 1448'?'1448-1':inspection.term;
  const id=crypto.randomUUID(),key='rayat/'+kind+'/'+id,now=Date.now();
  await bucket().put(key,bytes,{httpMetadata:{contentType:'text/csv; charset=utf-8'}});
  try{
   await db().batch([
    db().prepare('UPDATE rayat_reports SET active=0 WHERE kind=? AND normalized_term IS ? AND active=1').bind(kind,normalized),
    db().prepare('INSERT INTO rayat_reports(id,kind,term,normalized_term,original_filename,object_key,byte_size,summary,uploaded_by,created_at,active) VALUES(?,?,?,?,?,?,?,?,?,?,1)').bind(id,kind,inspection.term,normalized,file.name.slice(0,180),key,file.size,JSON.stringify(inspection.summary),user.id,now),
    auditStatement(user.id,'rayat_report_uploaded',id)
   ]);
  }catch(error){await bucket().delete(key);throw error}
  invalidateReports();return json({report:{id,kind,term:inspection.term,normalized_term:normalized,summary:inspection.summary,created_at:now,active:1}},201);
 }
 if(path==='department/actions'&&method==='GET'){
  head(user);
  const actions=(await db().prepare('SELECT id,kind,category,title,description,expected_result,status,target_date,created_at,updated_at FROM department_actions ORDER BY created_at DESC').all()).results;
  const evidence=(await db().prepare('SELECT id,action_id,original_filename,byte_size,created_at FROM department_action_evidence ORDER BY created_at DESC').all()).results;
  return json({actions:actions.map(a=>({...a,evidence:evidence.filter(e=>e.action_id===a.id)}))});
 }
 if(path==='department/actions'&&method==='POST'){
  head(user);const input=departmentActionSchema.parse(await body(req)),id=crypto.randomUUID(),now=Date.now();
  await db().batch([db().prepare('INSERT INTO department_actions(id,kind,category,title,description,expected_result,status,target_date,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,input.kind,input.category,input.title,input.description,input.expectedResult,input.status,input.targetDate||null,user.id,now,now),auditStatement(user.id,'department_action_created',id)]);
  return json({id},201);
 }
 const actionFile=path.match(/^department\/actions\/evidence\/([^/]+)$/);
 if(actionFile&&method==='GET'){
  head(user);
  const row=await db().prepare('SELECT object_key,original_filename,content_type FROM department_action_evidence WHERE id=?').bind(actionFile[1]).first<{object_key:string;original_filename:string;content_type:string}>();
  if(!row)fail(404,'الشاهد غير موجود.');const object=await bucket().get(row.object_key);if(!object?.body)fail(404,'تعذر العثور على الملف.');
  return privateFile(object.body,row.content_type,row.original_filename);
 }
 const actionEvidence=path.match(/^department\/actions\/([^/]+)\/evidence$/);
 if(actionEvidence&&method==='POST'){
  head(user);const actionId=actionEvidence[1];const action=await db().prepare('SELECT id FROM department_actions WHERE id=?').bind(actionId).first();if(!action)fail(404,'المبادرة أو الخطة غير موجودة.');
  if(!req.headers.get('content-type')?.startsWith('multipart/form-data'))fail(415,'اختر ملف شاهد.');
  if(Number(req.headers.get('content-length')||0)>maxEvidenceBytes+8192)fail(413,'حجم الشاهد يتجاوز ١٠ ميغابايت.');
  const form=await limitedForm(req,uploadLimit(path)),file=form.get('file');if(!(file instanceof File)||file.size<1||file.size>maxEvidenceBytes)fail(400,'اختر شاهدًا لا يتجاوز ١٠ ميغابايت.');
  const bytes=new Uint8Array(await file.arrayBuffer()),mime=evidenceType(bytes);if(!mime)fail(400,'الشاهد يجب أن يكون PDF أو PNG أو JPG أو WebP.');
  const id=crypto.randomUUID(),key='department-actions/'+actionId+'/'+id,now=Date.now();await bucket().put(key,bytes,{httpMetadata:{contentType:mime}});
  try{await db().batch([db().prepare('INSERT INTO department_action_evidence(id,action_id,object_key,original_filename,content_type,byte_size,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,actionId,key,file.name.slice(0,120)||'شاهد',mime,file.size,user.id,now),auditStatement(user.id,'department_action_evidence_uploaded',actionId)])}catch(error){await bucket().delete(key);throw error}
  return json({id},201);
 }
 const actionMatch=path.match(/^department\/actions\/([^/]+)$/);
 if(actionMatch&&method==='PATCH'){
  head(user);const input=departmentActionSchema.parse(await body(req));const exists=await db().prepare('SELECT id FROM department_actions WHERE id=?').bind(actionMatch[1]).first();if(!exists)fail(404,'المبادرة أو الخطة غير موجودة.');
  await db().batch([db().prepare('UPDATE department_actions SET kind=?,category=?,title=?,description=?,expected_result=?,status=?,target_date=?,updated_at=? WHERE id=?').bind(input.kind,input.category,input.title,input.description,input.expectedResult,input.status,input.targetDate||null,Date.now(),actionMatch[1]),auditStatement(user.id,'department_action_updated',actionMatch[1])]);
  return json({ok:true});
 }
 if(path==='audit'&&method==='GET'){head(user);return json({events:(await db().prepare('SELECT a.id,a.action,a.created_at,u.display_name AS actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 50').all()).results})}
 fail(404,'المسار غير موجود.');
 }catch(error){if(error instanceof BodyLimitError)return json({error:error.message},413);if(error instanceof HttpError)return json({error:error.message},error.status);if(String(error).includes('UNIQUE constraint failed: profiles'))return json({error:'الرقم الوظيفي مرتبط بحساب آخر بعد توحيد الأصفار البادئة.'},409);if(error instanceof z.ZodError)return json({error:'راجع الحقول المطلوبة وصيغ البيانات، ثم حاول مجددًا.'},400);console.error('Application request failed',error);return json({error:'تعذر إتمام الطلب. حاول مجددًا.'},503)}finally{
  // Finish small rejected bodies before returning on a reused connection.
  // Keep the discard bounded and never collect the rejected data in memory.
  if(req.body&&!req.bodyUsed&&!req.body.locked){
   let discarded=0;
   try{await req.body.pipeTo(new WritableStream<Uint8Array>({write(chunk){discarded+=chunk.byteLength;if(discarded>64000)throw new Error('Discard limit exceeded')}}),{signal:AbortSignal.timeout(1000)})}catch{/* Preserve the original response on disconnect, size or time limit. */}
  }
 }}
