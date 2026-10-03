import {z} from 'zod';
import {usernameSchema,officeHoursSchema,type User} from './contracts';

export const accountTransferSchema=z.object({
 dryRun:z.boolean(),
 accounts:z.array(z.object({
  targetId:z.string().uuid().nullable(),
  username:usernameSchema,display_name:z.string().trim().min(2).max(80),
  role:z.enum(['head','trainer']),active:z.literal(1),
  password_hash:z.string().regex(/^scrypt\$16384\$8\$5\$[a-f0-9]{32}\$[a-f0-9]{64}$/),
  must_change_password:z.union([z.literal(0),z.literal(1)]),
  staff_number:z.string().regex(/^\d{3,12}$/).nullable(),
  office:z.string().max(80),specialty:z.string().max(120),office_hours:officeHoursSchema
 }).strict().refine(a=>a.role==='trainer'?!!a.staff_number:a.staff_number===null,{message:'تحقق من الرقم الوظيفي ونوع الحساب.'})).min(1).max(20)
}).strict();
const normalize=(v:string|null|undefined)=>v?.replace(/^0+/,'')||null;
export function planAccountTransfer(input:z.infer<typeof accountTransferSchema>,existing:User[],actorId:string){
 const names=new Set<string>(),numbers=new Set<string>(),targets=new Set<string>();
 return input.accounts.map(account=>{
  const number=normalize(account.staff_number);
  if(names.has(account.username)||(number&&numbers.has(number)))throw new Error('توجد حسابات أو أرقام وظيفية مكررة في طلب النقل.');
  names.add(account.username);if(number)numbers.add(number);
  const target=account.targetId?existing.find(u=>u.id===account.targetId):undefined;
  if(account.targetId&&!target)throw new Error('الحساب المطلوب ربطه غير موجود.');
  if(target){
   if(targets.has(target.id)||target.role!==account.role)throw new Error('لا يمكن تكرار الحساب المستهدف أو تغيير صلاحيته أثناء النقل.');
   if(account.role==='head'&&target.id!==actorId)throw new Error('يمكن لرئيس القسم نقل حسابه الإداري فقط.');
   if(account.role==='trainer'&&normalize(target.staff_number)!==number)throw new Error('الرقم الوظيفي لا يطابق الحساب المطلوب ربطه.');
   targets.add(target.id);
  }
  if(existing.some(u=>u.id!==target?.id&&(u.username===account.username||(number&&normalize(u.staff_number)===number))))throw new Error('اسم المستخدم أو الرقم الوظيفي مرتبط بحساب آخر.');
  return {account,targetId:target?.id??crypto.randomUUID(),action:target?'update':'create'};
 });
}
