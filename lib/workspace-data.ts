import {env} from 'cloudflare:workers';
import {pagination} from './pagination';
import {trainerProgress,progressFor,type WorkRecord,type TrainerCourse} from './trainer-domain';

export async function workspaceData(url:string,userId:string,courses:TrainerCourse[]){
 const db=env.DB!,params=new URL(url).searchParams,view=params.get('view')||'overview',course=params.get('section')||'',task=params.get('task')||'';
 const categories:Record<string,string>={exams:'exam',grades:'grade_analysis',blackboard:'blackboard',training:'training',advising:'advising',development:'development',exchange:'exchange'};
 const category=categories[view]||'',page=pagination(url,{path:'workspace-records',userId,view,course},20);
 // Only compact completion inputs are read for the whole-scope calculation.
 const summaries=(await db.prepare("SELECT r.id,r.course_key,r.category,r.item_key,r.status,json_extract(r.payload,'$.analysisVersion') analysis_version,json_extract(r.payload,'$.methods') methods,(SELECT COUNT(*) FROM trainer_work_files f WHERE f.record_id=r.id) file_count FROM trainer_work_records r WHERE r.trainer_id=? AND r.category IN ('exam','grade_analysis','blackboard','training','advising')").bind(userId).all()).results.map(r=>({...r,payload:{analysisVersion:r.analysis_version,methods:r.methods?JSON.parse(String(r.methods)):[]},files:[]})) as unknown as WorkRecord[];
 const score=trainerProgress(summaries,courses),courseProgress=Object.fromEntries(courses.map(c=>[c.key,progressFor(summaries,c.key)]));
 const attachments=await db.prepare('SELECT COUNT(*) n FROM trainer_work_files f JOIN trainer_work_records r ON r.id=f.record_id WHERE r.trainer_id=?').bind(userId).first<{n:number}>();
 const taskUrl=new URL(url);taskUrl.searchParams.delete('cursor');if(params.get('taskCursor'))taskUrl.searchParams.set('cursor',params.get('taskCursor')!);
 const taskPage=pagination(taskUrl.href,{path:'workspace-tasks',userId,view,task},view==='overview'?4:20),taskConditions=['t.trainer_id=?','t.created_at<=?'],taskValues:unknown[]=[userId,taskPage.at];
 if(task){taskConditions.push('t.id=?');taskValues.push(task)}
 if(view==='alerts'){taskConditions.push("t.status='pending' AND julianday(t.due_at)-julianday('now')<=t.reminder_days")}else if(view==='overview'){taskConditions.push("t.status='pending'")}
 const taskTotal=await db.prepare('SELECT COUNT(*) n FROM trainer_tasks t WHERE '+taskConditions.join(' AND ')).bind(...taskValues).first<{n:number}>();
 if(taskPage.cursor){taskConditions.push('(t.due_at>? OR(t.due_at=? AND t.id>?))');taskValues.push(taskPage.cursor.key,taskPage.cursor.key,taskPage.cursor.id)}
 const taskRows=(await db.prepare('SELECT t.*,u.display_name created_by_name FROM trainer_tasks t JOIN users u ON u.id=t.created_by WHERE '+taskConditions.join(' AND ')+' ORDER BY t.due_at,t.id LIMIT ?').bind(...taskValues,taskPage.limit+1).all()).results,taskResult=taskPage.finish(taskRows,'due_at');
 const upcomingTasks=view==='alerts'?(await db.prepare("SELECT t.*,u.display_name created_by_name FROM trainer_tasks t JOIN users u ON u.id=t.created_by WHERE t.trainer_id=? AND t.status='pending' AND julianday(t.due_at)>=julianday('now') ORDER BY t.due_at,t.id LIMIT 4").bind(userId).all()).results:[];
 const conditions=['r.trainer_id=?','r.created_at<=?'],values:unknown[]=[userId,page.at];
 if(category){conditions.push('r.category=?');values.push(category);if(['exam','grade_analysis','blackboard','training'].includes(category)){conditions.push("(r.course_key=? OR r.course_key='general')");values.push(course)}}
 else if(view==='assignments'){const ids=taskResult.items.map(t=>t.id);conditions.push("r.category='assignment'");conditions.push(ids.length?'r.item_key IN ('+ids.map(()=>'?').join(',')+')':'0=1');values.push(...ids)}
 else if(view!=='portfolio'){conditions.push('0=1')}
 const total=await db.prepare('SELECT COUNT(*) n FROM trainer_work_records r WHERE '+conditions.join(' AND ')).bind(...values).first<{n:number}>();
 if(page.cursor){conditions.push('r.id>?');values.push(page.cursor.id)}
 const rows=(await db.prepare('SELECT r.id,r.course_key,r.category,r.item_key,r.status,r.payload,r.updated_at FROM trainer_work_records r WHERE '+conditions.join(' AND ')+' ORDER BY r.id LIMIT ?').bind(...values,page.limit+1).all()).results,result=page.finish(rows,'id');
 const records=await Promise.all(result.items.map(async r=>{
  const fileUrl=new URL('/api/trainer/workspace/records/'+r.id+'/files',url),filePage=pagination(fileUrl.href,{path:'workspace-files',userId,record:r.id});
  const files=(await db.prepare('SELECT id,original_filename,content_type,byte_size,created_at,purpose FROM trainer_work_files WHERE record_id=? ORDER BY created_at,id LIMIT ?').bind(r.id,21).all()).results,fileResult=filePage.finish(files,'created_at');
  const count=await db.prepare('SELECT COUNT(*) n FROM trainer_work_files WHERE record_id=?').bind(r.id).first<{n:number}>();
  return {...r,payload:JSON.parse(String(r.payload)),files:fileResult.items,filesNextCursor:fileResult.nextCursor,file_count:count?.n||0};
 }));
 return {records,upcomingTasks,nextCursor:result.nextCursor,total:total?.n||0,tasks:taskResult.items,tasksNextCursor:taskResult.nextCursor,tasksTotal:taskTotal?.n||0,summary:{score,courseProgress,attachments:attachments?.n||0}};
}

export async function workspaceFiles(url:string,userId:string,record:string){
 const db=env.DB!,owned=await db.prepare('SELECT id FROM trainer_work_records WHERE id=? AND trainer_id=?').bind(record,userId).first();if(!owned)return null;
 const page=pagination(url,{path:'workspace-files',userId,record}),values:unknown[]=[record,page.at],conditions=['record_id=?','created_at<=?'];
 if(page.cursor){conditions.push('(created_at>? OR(created_at=? AND id>?))');values.push(page.cursor.key,page.cursor.key,page.cursor.id)}
 const rows=(await db.prepare('SELECT id,original_filename,content_type,byte_size,created_at,purpose FROM trainer_work_files WHERE '+conditions.join(' AND ')+' ORDER BY created_at,id LIMIT ?').bind(...values,page.limit+1).all()).results,result=page.finish(rows,'created_at');return {files:result.items,nextCursor:result.nextCursor};
}
