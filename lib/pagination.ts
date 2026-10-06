import {createHash} from 'node:crypto';
import {z} from 'zod';
const cursorSchema=z.object({v:z.literal(1),at:z.number().int().positive(),key:z.union([z.number().finite(),z.string().max(100)]),id:z.string().max(100),scope:z.string().length(16)}).strict();
export function pagination(url:string,scope:unknown,defaultLimit=20){
 const params=new URL(url).searchParams,limit=z.coerce.number().int().min(1).max(50).parse(params.get('limit')||defaultLimit),hash=createHash('sha256').update(JSON.stringify(scope)).digest('hex').slice(0,16),raw=params.get('cursor');
 let cursor:z.infer<typeof cursorSchema>|null=null;
 if(raw){try{if(raw.length>1000)throw new Error();cursor=cursorSchema.parse(JSON.parse(Buffer.from(raw,'base64url').toString('utf8')));if(cursor.scope!==hash)throw new Error()}catch{throw new z.ZodError([{code:'custom',path:['cursor'],message:'مؤشر الصفحة لا يطابق التصفية الحالية.'}])}}
 const at=cursor?.at||Date.now();
 return {limit,cursor,at,finish<T extends Record<string,unknown>>(rows:T[],key:string){const items=rows.slice(0,limit),last=items.at(-1);return {items,nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify({v:1,at,key:last[key],id:last.id,scope:hash})).toString('base64url'):null}}};
}
