import {normalizeDigits} from './identity';
import {z} from 'zod';
export const roles=['head','trainer','deputy','dean'] as const;
export const roleLabels={head:'رئيس القسم',trainer:'مدرب',deputy:'وكيل',dean:'عميد'};
export type Role=typeof roles[number];
export type User={id:string;username:string;display_name:string;role:Role;active:number;is_test:number;must_change_password?:number;avatar_updated_at?:number|null;staff_number?:string|null};
export const metricKeys=['trainees','sections','courses','trainers'] as const;
export const defaultLayout={density:'comfortable' as const,hidden:[] as string[]};
export const layoutSchema=z.object({density:z.enum(['comfortable','compact']),hidden:z.array(z.enum(metricKeys)).max(4)}).strict();
export const usernameSchema=z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/);
export const passwordSchema=z.string().min(6).max(128);
const staffNumberSchema=z.string().transform(normalizeDigits).pipe(z.string().regex(/^\d{3,12}$/).refine(v=>/[1-9]/.test(v))).nullable().optional();
export const createUserSchema=z.object({username:usernameSchema,display_name:z.string().trim().min(2).max(80),password:passwordSchema,role:z.enum(roles),is_test:z.boolean().default(false),must_change_password:z.boolean().optional(),staff_number:staffNumberSchema}).strict().refine(v=>!v.staff_number||v.role==='trainer',{message:'يرتبط الرقم الوظيفي بحساب مدرب فقط.',path:['staff_number']});
export const updateUserSchema=z.object({display_name:z.string().trim().min(2).max(80).optional(),role:z.enum(roles).optional(),active:z.boolean().optional(),password:passwordSchema.optional(),staff_number:staffNumberSchema}).strict().refine(v=>!v.staff_number||!v.role||v.role==='trainer',{message:'يرتبط الرقم الوظيفي بحساب مدرب فقط.',path:['staff_number']});
export const officeHoursSchema=z.array(z.object({day:z.number().int().min(0).max(6),start:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),end:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)}).strict().refine(v=>v.start<v.end,{message:'وقت النهاية يجب أن يكون بعد وقت البداية.'})).max(21).refine(rows=>rows.every((a,i)=>rows.every((b,j)=>i===j||a.day!==b.day||a.end<=b.start||b.end<=a.start)),{message:'توجد فترات مكتبية متداخلة في اليوم نفسه.'});
export const profileSchema=z.object({office:z.string().trim().max(80).optional(),specialty:z.string().trim().max(120),office_hours:officeHoursSchema.optional()}).strict();

