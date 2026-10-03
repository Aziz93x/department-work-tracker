export const reportKinds={
 SF01:{label:'تسجيل المتدربين في الشعب',required:['الفصل التدريبي','القسم','المقرر','الرقم المرجعي','رقم المتدرب','حالة تسجيل','حالة المتدرب']},
 SS01:{label:'جداول الشعب التدريبية',required:['الفصل التدريبي','القسم','المقرر','الرقم المرجعي','نوع الجدولة','سعة','مسجلين','متبقي','رقم المدرب']},
 SL03:{label:'أعضاء هيئة التدريب',required:['القسم','البريد الالكتروني','اسم عضو هيئة التدريبي','الرقم الوظيفي','الفصل التدريبي']},
 SO08:{label:'حالات التسجيل حسب المقرر',required:['الفصل التدريبي','اسم القسم','رمز المقرر','رقم المقرر','المستمرون','المحرومون','المطوي قيدهم','المنسحبون','إجمالي المسجلين']},
 SO01:{label:'غياب المتدربين حسب المقرر',required:['كود الفصل التدريبي','الفصل التدريبي','اسم القسم','كود المقرر','رقم المقرر','رقم المتدرب','حالة المقرر','إجمالي نسبة الغياب بدون عذر','إجمالي ساعات الغياب بدون عذر']},
 SF06:{label:'المتدربون بلا تسجيل',required:['الرقم التدريبي','البرنامج','القسم','المرحلة','الوحدة التدريبية']}
} as const;
export type ReportKind=keyof typeof reportKinds;
export const maxRayatBytes=8*1024*1024;
// Confirmed by the department for term 144710: these two scheduled sections are remote.
const confirmedRemoteSections144710=new Set(['65557','65559']);

function parseCsv(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=ch;continue}
  if(ch==='"'){if(field||closed)throw new Error('تنسيق CSV غير صالح.');quoted=true;continue}
  if(ch===','){row.push(field);field='';closed=false;continue}
  if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   row.push(field);if(row.some(v=>v!==''))rows.push(row);
   row=[];field='';closed=false;continue
  }
  if(closed)throw new Error('تنسيق CSV غير صالح.');
  field+=ch;
 }
 if(quoted)throw new Error('علامة اقتباس غير مغلقة في CSV.');
 row.push(field);if(row.some(v=>v!==''))rows.push(row);
 return rows;
}
const numeric=(value:string)=>/^\d+$/.test(value.trim());
const signedNumber=(value:string)=>/^-?\d+$/.test(value.trim());
function normalizeTrainerNumber(value:string){
 const digits=value.trim().replace(/[٠-٩]/g,char=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(char))).replace(/[۰-۹]/g,char=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char)));
 return /^\d+$/.test(digits)?digits.replace(/^0+(?=\d)/,''):digits;
}
export function inspectRayat(kind:ReportKind,bytes:Uint8Array){
 if(bytes.byteLength<1||bytes.byteLength>maxRayatBytes)throw new Error('حجم التقرير يجب ألا يتجاوز ٨ ميغابايت.');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
 if(text.includes('\0'))throw new Error('الملف ليس CSV نصيًا صالحًا.');
 const rows=parseCsv(text);if(rows.length<2&&kind!=='SF06')throw new Error('التقرير خالٍ من السجلات.');
 if(!rows.length)throw new Error('الملف لا يحتوي على عناوين أعمدة.');
 const headers=rows[0].map(v=>v.trim());if(new Set(headers).size!==headers.length)throw new Error('يتضمن التقرير عناوين أعمدة مكررة.');
 const missing=reportKinds[kind].required.filter(h=>!headers.includes(h));
 if(missing.length){
  const detected=(Object.keys(reportKinds) as ReportKind[]).find(other=>other!==kind&&reportKinds[other].required.every(h=>headers.includes(h)));
  if(detected)throw new Error(`هذا الملف يطابق ${detected} — ${reportKinds[detected].label}. ارفعه في خانة ${detected}.`);
  throw new Error('الملف لا يطابق '+kind+'. الأعمدة الناقصة: '+missing.join('، '));
 }
 const idx=(name:string)=>headers.indexOf(name);
 const records=rows.slice(1);
 for(let i=0;i<records.length;i++)if(records[i].length!==headers.length)throw new Error('عدد الأعمدة غير متطابق في السطر '+(i+2)+'.');
 const get=(row:string[],name:string)=>idx(name)<0?'':row[idx(name)].trim();
 const terms=[...new Set(records.map(r=>get(r,'الفصل التدريبي')).filter(Boolean))];
 if(terms.length>1)throw new Error('يحتوي التقرير على أكثر من فصل تدريبي؛ ارفع كل فصل على حدة.');
 const department=records.filter(r=>get(r,'القسم').includes('الكهربائية')||get(r,'وصف القسم').includes('الكهربائية')||get(r,'اسم القسم').includes('الكهربائية'));
 if(!department.length&&kind!=='SF06')throw new Error('لم تُعثر على سجلات لقسم التقنية الكهربائية.');
 const unique=(arr:string[])=>new Set(arr.filter(Boolean)).size;
 const summary:Record<string,number>={rows:records.length,departmentRows:department.length};
 if(kind==='SF01'){
  if(records.some(r=>!get(r,'رقم المتدرب')||!get(r,'الرقم المرجعي')))throw new Error('توجد سجلات دون رقم متدرب أو رقم مرجعي.');
  summary.trainees=unique(department.map(r=>get(r,'رقم المتدرب')));
  summary.sections=unique(department.map(r=>get(r,'الرقم المرجعي')));
  summary.courses=unique(department.map(r=>get(r,'المقرر')));
  const people=(predicate:(r:string[])=>boolean)=>unique(department.filter(predicate).map(r=>get(r,'رقم المتدرب')));
  summary.withdrawn=people(r=>get(r,'حالة تسجيل').includes('انسحاب'));
  summary.dismissed=people(r=>get(r,'حالة المتدرب').includes('مطوي')||get(r,'حالة تسجيل').includes('مطوي'));
  summary.deprived=people(r=>get(r,'حالة تسجيل').includes('حرمان بسبب غياب'));
 }else if(kind==='SS01'){
  if(records.some(r=>!get(r,'الرقم المرجعي')||!numeric(get(r,'سعة'))||!numeric(get(r,'مسجلين'))||!signedNumber(get(r,'متبقي'))))throw new Error('أرقام الشعب أو المقاعد غير صالحة.');
  summary.sections=unique(department.map(r=>get(r,'الرقم المرجعي')));
  summary.trainers=unique(department.map(r=>get(r,'رقم المدرب')));
  // Repeated meeting rows must not inflate seats; retain one value per section.
  const sections=new Map<string,{capacity:number;enrolled:number;remaining:number}>();
  for(const r of department){const ref=get(r,'الرقم المرجعي'),value={capacity:+get(r,'سعة'),enrolled:+get(r,'مسجلين'),remaining:+get(r,'متبقي')};
   const previous=sections.get(ref);if(previous&&JSON.stringify(previous)!==JSON.stringify(value))throw new Error('تختلف أعداد المقاعد بين مواعيد الشعبة ذات الرقم المرجعي نفسه.');
   if(value.capacity!==value.enrolled+value.remaining)throw new Error('سعة الشعبة لا تساوي مجموع المسجلين والمتبقي.');
   sections.set(ref,value)
  }
  summary.capacity=[...sections.values()].reduce((n,s)=>n+s.capacity,0);
  summary.enrolled=[...sections.values()].reduce((n,s)=>n+s.enrolled,0);
  summary.remaining=[...sections.values()].reduce((n,s)=>n+s.remaining,0);
  summary.overCapacity=[...sections.values()].filter(s=>s.remaining<0).length;
  const remoteRefs=new Set<string>(),confirmedRefs=new Set<string>();
  for(const r of department){const ref=get(r,'الرقم المرجعي'),sourceRemote=get(r,'نوع الجدولة').includes('عن بعد');
   const confirmed=terms[0]==='144710'&&confirmedRemoteSections144710.has(ref)&&Number(get(r,'رقم المدرب'))===29821;
   if(sourceRemote||confirmed)remoteRefs.add(ref);
   if(confirmed&&!sourceRemote)confirmedRefs.add(ref);
  }
  summary.remoteSections=remoteRefs.size;
  summary.remoteRegistrations=[...remoteRefs].reduce((n,ref)=>n+(sections.get(ref)?.enrolled||0),0);
  summary.confirmedRemoteSections=confirmedRefs.size;
 }else if(kind==='SO01'){
  const decimal=(value:string)=>/^\d+(?:\.\d+)?$/.test(value);
  if(records.some(r=>!get(r,'رقم المتدرب')||!get(r,'كود المقرر')||!get(r,'رقم المقرر')||!decimal(get(r,'إجمالي نسبة الغياب بدون عذر'))||!decimal(get(r,'إجمالي ساعات الغياب بدون عذر'))||Number(get(r,'إجمالي نسبة الغياب بدون عذر'))>100))throw new Error('توجد أرقام متدربين أو مقررات أو قيم غياب غير صالحة.');
  const codes=[...new Set(records.map(r=>get(r,'كود الفصل التدريبي')).filter(Boolean))];
  if(codes.length!==1||(terms[0]==='الفصل التدريبي الأول 1448'&&codes[0]!=='144710'))throw new Error('رمز الفصل التدريبي لا يطابق اسم الفصل في التقرير.');
  const currentCourses=department.filter(r=>!get(r,'حالة المقرر').includes('محذوف'));
  summary.trainees=unique(currentCourses.map(r=>get(r,'رقم المتدرب')));
  summary.courses=unique(department.map(r=>get(r,'كود المقرر')+'-'+get(r,'رقم المقرر')));
  summary.deprived=unique(currentCourses.filter(r=>get(r,'حالة المقرر').includes('حرمان بسبب غياب')).map(r=>get(r,'رقم المتدرب')));
  summary.withUnexcusedAbsence=unique(currentCourses.filter(r=>Number(get(r,'إجمالي ساعات الغياب بدون عذر'))>0).map(r=>get(r,'رقم المتدرب')));
  summary.deletedCourseRows=department.filter(r=>get(r,'حالة المقرر').includes('محذوف')).length;
 }else if(kind==='SO08'){
  const fields=['المستمرون','المحرومون','المطوي قيدهم','المنسحبون','إجمالي المسجلين'] as const;
  if(records.some(r=>fields.some(f=>!numeric(get(r,f)))))throw new Error('توجد أعداد حالات غير صالحة.');
  if(department.some(r=>fields.slice(0,4).reduce((n,f)=>n+Number(get(r,f)),0)!==Number(get(r,'إجمالي المسجلين'))))throw new Error('مجموع حالات أحد المقررات لا يساوي إجمالي المسجلين فيه.');
  summary.courses=unique(department.map(r=>get(r,'رمز المقرر')+'-'+get(r,'رقم المقرر')));
  summary.enrolled=department.reduce((n,r)=>n+Number(get(r,'إجمالي المسجلين')),0);
  summary.continuingRegistrations=department.reduce((n,r)=>n+Number(get(r,'المستمرون')),0);
  summary.deprivedRegistrations=department.reduce((n,r)=>n+Number(get(r,'المحرومون')),0);
  summary.dismissedRegistrations=department.reduce((n,r)=>n+Number(get(r,'المطوي قيدهم')),0);
  summary.withdrawnRegistrations=department.reduce((n,r)=>n+Number(get(r,'المنسحبون')),0);
 }else if(kind==='SF06'){
  if(records.some(r=>!get(r,'الرقم التدريبي')))throw new Error('توجد سجلات دون رقم تدريبي.');
  summary.trainees=unique(department.map(r=>get(r,'الرقم التدريبي')));
 }else{
  if(records.some(r=>!get(r,'الرقم الوظيفي')))throw new Error('يوجد عضو دون رقم وظيفي.');
  const excluded=department.filter(r=>{const name=get(r,'اسم عضو هيئة التدريبي');return name.includes('الصبحي')||(name.includes('رامي')&&name.includes('الغوانمه'))});
  const excludedNumbers=new Set(excluded.map(r=>get(r,'الرقم الوظيفي')));
  summary.staff=unique(department.filter(r=>!excludedNumbers.has(get(r,'الرقم الوظيفي'))).map(r=>get(r,'الرقم الوظيفي')));
  summary.excludedStaff=excludedNumbers.size;
 }
 return {kind,label:reportKinds[kind].label,term:terms[0]||null,summary};
}

export function trainerRayatMetrics(scheduleBytes:Uint8Array,registrationBytes:Uint8Array,staffNumber:string){
 const decode=(bytes:Uint8Array)=>parseCsv(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,''));
 const schedule=decode(scheduleBytes),registration=decode(registrationBytes);
 const scheduleHeaders=schedule[0].map(v=>v.trim()),registrationHeaders=registration[0].map(v=>v.trim());
 const val=(row:string[],headers:string[],name:string)=>{const i=headers.indexOf(name);return i<0?'':row[i].trim()};
 const isDepartment=(row:string[],headers:string[])=>['القسم','وصف القسم','اسم القسم'].some(name=>val(row,headers,name).includes('الكهربائية'));
 const target=normalizeTrainerNumber(staffNumber);
 const sections=schedule.slice(1).filter(row=>isDepartment(row,scheduleHeaders)&&normalizeTrainerNumber(val(row,scheduleHeaders,'رقم المدرب'))===target);
 const references=new Set(sections.map(row=>val(row,scheduleHeaders,'الرقم المرجعي')).filter(Boolean));
 const learners=new Set(registration.slice(1).filter(row=>isDepartment(row,registrationHeaders)&&references.has(val(row,registrationHeaders,'الرقم المرجعي'))).map(row=>val(row,registrationHeaders,'رقم المتدرب')).filter(Boolean));
 const courses=new Set(sections.map(row=>val(row,scheduleHeaders,'المقرر')).filter(Boolean));
 return {trainees:learners.size,sections:references.size,courses:courses.size,staffLinked:sections.length>0};
}

export function trainerRayatCourses(scheduleBytes:Uint8Array,registrationBytes:Uint8Array,staffNumber:string,normalizedTerm?:string){
 const decode=(bytes:Uint8Array)=>parseCsv(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,''));
 const schedule=decode(scheduleBytes),registration=decode(registrationBytes),sh=schedule[0].map(v=>v.trim()),rh=registration[0].map(v=>v.trim());
 const val=(row:string[],headers:string[],name:string)=>{const i=headers.indexOf(name);return i<0?'':(row[i]||'').trim()};
 const department=(row:string[],headers:string[])=>['القسم','وصف القسم','اسم القسم'].some(n=>val(row,headers,n).includes('الكهربائية'));
 const rows=schedule.slice(1).filter(r=>department(r,sh)&&normalizeTrainerNumber(val(r,sh,'رقم المدرب'))===normalizeTrainerNumber(staffNumber));
 const sections=new Map<string,{name:string;code:string;reference:string;term:string;sectionType:string}>();
 for(const row of rows){const reference=val(row,sh,'الرقم المرجعي'),code=val(row,sh,'المقرر'),name=val(row,sh,'اسم المقرر')||code,term=normalizedTerm||val(row,sh,'الفصل التدريبي');if(!reference||!code)continue;const key=term+'::'+reference,previous=sections.get(key);if(previous&&(previous.code!==code||previous.name!==name))throw new Error('يتكرر الرقم المرجعي '+reference+' ببيانات مقررات مختلفة في تقرير الشعب.');sections.set(key,{name,code,reference,term,sectionType:val(row,sh,'نوع الشعبة')||val(row,sh,'نوع الجدولة')})}
 return [...sections].map(([key,section])=>{const registrations=registration.slice(1).filter(r=>department(r,rh)&&val(r,rh,'الرقم المرجعي')===section.reference);const ids=(predicate:(r:string[])=>boolean)=>[...new Set(registrations.filter(predicate).map(r=>val(r,rh,'رقم المتدرب')).filter(Boolean))];return {key,...section,sections:1,trainees:ids(()=>true).length,learnerIds:ids(()=>true),deprived:ids(r=>val(r,rh,'حالة تسجيل').includes('حرمان')).length,withdrawn:ids(r=>val(r,rh,'حالة تسجيل').includes('انسحاب')).length,dismissed:ids(r=>val(r,rh,'حالة تسجيل').includes('مطوي')||val(r,rh,'حالة المتدرب').includes('مطوي')).length}}).sort((a,b)=>a.name.localeCompare(b.name,'ar')||a.reference.localeCompare(b.reference));
}

export function rayatLinkage(scheduleBytes:Uint8Array,registrationBytes:Uint8Array,absenceBytes:Uint8Array,courseStatusBytes:Uint8Array){
 const decode=(bytes:Uint8Array)=>parseCsv(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,''));
 const [schedule,registration,absence,courseStatus]=[scheduleBytes,registrationBytes,absenceBytes,courseStatusBytes].map(decode);
 const headers=[schedule[0],registration[0],absence[0],courseStatus[0]].map(row=>row.map(v=>v.trim()));
 const val=(row:string[],index:number,name:string)=>{const i=headers[index].indexOf(name);return i<0?'':row[i].trim()};
 const isDepartment=(row:string[],index:number)=>['القسم','وصف القسم','اسم القسم'].some(name=>val(row,index,name).includes('الكهربائية'));
 const rows=[schedule.slice(1).filter(row=>isDepartment(row,0)),registration.slice(1).filter(row=>isDepartment(row,1)),absence.slice(1).filter(row=>isDepartment(row,2)),courseStatus.slice(1).filter(row=>isDepartment(row,3))];
 const pairs=(rs:string[][],index:number,courseField:string)=>new Set(rs.map(row=>val(row,index,'الرقم المرجعي')+'\0'+val(row,index,courseField)).filter(pair=>!pair.startsWith('\0')));
 const scheduleRefs=new Set(rows[0].map(row=>val(row,0,'الرقم المرجعي')).filter(Boolean));
 const registrationRefs=new Set(rows[1].map(row=>val(row,1,'الرقم المرجعي')).filter(Boolean));
 const linkedRefs=new Set([...scheduleRefs].filter(ref=>registrationRefs.has(ref)));
 const schedulePairs=pairs(rows[0],0,'المقرر'),registrationPairs=pairs(rows[1],1,'المقرر');
 const sameCourseSections=new Set([...schedulePairs].filter(pair=>registrationPairs.has(pair)).map(pair=>pair.split('\0')[0]));
 const courseKey=(row:string[],index:number)=>val(row,index,'رقم المقرر')+'\0'+val(row,index,'اسم المقرر').normalize('NFKC').replace(/\s+/g,' ').trim();
 const absenceCourseRows=new Map<string,string[][]>();
 for(const row of rows[2]){const key=courseKey(row,2);if(!absenceCourseRows.has(key))absenceCourseRows.set(key,[]);absenceCourseRows.get(key)!.push(row)}
 const statusCourses=new Set(rows[3].map(row=>courseKey(row,3)).filter(key=>!key.startsWith('\0')));
 const absenceCourses=new Set(absenceCourseRows.keys());
 const linkedCourses=new Set([...absenceCourses].filter(key=>statusCourses.has(key)));
 const eligibleAbsenceRows=[...linkedCourses].flatMap(key=>absenceCourseRows.get(key)||[]);
 const absenceRefs=new Set(eligibleAbsenceRows.flatMap(row=>val(row,2,'أرقام شعب المقرر').split(/[,،\s]+/).filter(Boolean)));
 const linkedAbsenceRefs=new Set([...absenceRefs].filter(ref=>linkedRefs.has(ref)));
 const traineeNumber=(row:string[])=>val(row,2,'رقم المتدرب');
 const currentAbsenceRows=eligibleAbsenceRows.filter(row=>!val(row,2,'حالة المقرر').includes('محذوف'));
 const distinct=(values:string[])=>new Set(values.filter(Boolean)).size;
 const electricalTrainees=distinct(currentAbsenceRows.map(traineeNumber));
 const electricalDeprived=distinct(currentAbsenceRows.filter(row=>val(row,2,'حالة المقرر').includes('حرمان بسبب غياب')).map(traineeNumber));
 const electricalWithUnexcusedAbsence=distinct(currentAbsenceRows.filter(row=>Number(val(row,2,'إجمالي ساعات الغياب بدون عذر'))>0).map(traineeNumber));
 const trainers=new Set(rows[0].map(row=>val(row,0,'رقم المدرب')).filter(Boolean));
 return {scheduleSections:scheduleRefs.size,registrationSections:registrationRefs.size,linkedSections:linkedRefs.size,sameCourseSections:sameCourseSections.size,absenceSections:absenceRefs.size,linkedAbsenceSections:linkedAbsenceRefs.size,absenceCourses:absenceCourses.size,statusCourses:statusCourses.size,linkedCourses:linkedCourses.size,excludedCourses:[...new Set([...absenceCourses].filter(key=>!statusCourses.has(key)).map(key=>key.split('\0',1)[0]))].sort(),missingAbsenceCourses:[...statusCourses].filter(key=>!absenceCourses.has(key)).map(key=>key.split('\0',1)[0]).sort(),electricalTrainees,electricalDeprived,electricalWithUnexcusedAbsence,scheduledTrainers:trainers.size};
}
