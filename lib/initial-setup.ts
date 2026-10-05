import {timingSafeEqual} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {usernameSchema,passwordSchema} from './contracts';
import {digest,hashPassword} from './security';

const setupSchema=z.object({
 username:usernameSchema,
 display_name:z.string().trim().min(2).max(80),
 password:passwordSchema,
}).strict();

// An operator enables this only while provisioning a new, empty database.
// Existing installations cannot be reinitialized, even with the setup secret.
export async function initializeDepartment(req:Request,db:D1Database){
 const secret=env.DEPARTMENT_SETUP_TOKEN;
 const supplied=req.headers.get('x-department-setup-token')||'';
 if(!secret||secret.length<32||supplied.length>256||!timingSafeEqual(Buffer.from(digest(secret)),Buffer.from(digest(supplied)))){
  return Response.json({error:'المسار غير متاح.'},{status:404,headers:{'Cache-Control':'no-store'}});
 }
 if(!req.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'نوع الطلب غير مدعوم.'},{status:415});
 const raw=await req.text();
 if(raw.length>4096)return Response.json({error:'الطلب أكبر من المسموح.'},{status:413});
 let input:z.infer<typeof setupSchema>;
 try{input=setupSchema.parse(JSON.parse(raw))}catch{return Response.json({error:'بيانات التهيئة غير صالحة.'},{status:400})}
 const existing=await db.prepare('SELECT id FROM users LIMIT 1').first();
 if(existing)return Response.json({error:'سبق تهيئة المنصة.'},{status:409});
 const id=crypto.randomUUID(),now=Date.now();
 const results=await db.batch([
  db.prepare("INSERT INTO users(id,username,display_name,password_hash,role,active,is_test,must_change_password,created_at,updated_at) SELECT ?,?,?,?,'head',1,0,1,?,? WHERE NOT EXISTS (SELECT 1 FROM users)").bind(id,input.username,input.display_name,hashPassword(input.password),now,now),
  db.prepare('INSERT INTO profiles(user_id) SELECT id FROM users WHERE id=?').bind(id),
  db.prepare("INSERT INTO audit_log(id,actor_id,action,target_id,created_at) SELECT ?,id,'platform_initialized',id,? FROM users WHERE id=?").bind(crypto.randomUUID(),now,id),
 ]);
 if(results[0].meta.changes!==1)return Response.json({error:'سبق تهيئة المنصة.'},{status:409});
 return Response.json({created:true,username:input.username,must_change_password:true},{status:201,headers:{'Cache-Control':'no-store'}});
}
