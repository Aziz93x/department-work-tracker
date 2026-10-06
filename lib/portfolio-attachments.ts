import {Buffer} from 'node:buffer';
import {imageType} from './files';

type Attachment={id:string;filename:string;title:string};
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const encoder=new TextEncoder(),chunkBytes=48*1024;

/** Shared framing keeps the original file in one data URI; preview JavaScript reuses that URI. */
export function portfolioAttachmentFrame(file:Attachment,signature:Uint8Array){
 const mime=imageType(signature);
 return {
  prefix:`<section class="attachment" id="file-${escape(file.id)}"><h3>${escape(file.filename)}</h3><a download="${escape(file.filename)}" href="data:${mime||'application/octet-stream'};base64,`,
  suffix:`">تنزيل الشاهد الأصلي</a>${mime?`<img alt="${escape(file.title)}" data-preview>`:'<p>الملف الأصلي مضمّن للتنزيل. تُطبع الملفات غير المصورة من تطبيقها المناسب.</p>'}</section>`
 };
}

/** At most 48 KiB is encoded at once; carry between arbitrary source chunks is at most two bytes. */
export async function* portfolioAttachmentChunks(file:Attachment,body:ReadableStream<Uint8Array>,expectedBytes:number):AsyncGenerator<Uint8Array>{
 if(!Number.isSafeInteger(expectedBytes)||expectedBytes<0||expectedBytes>32*1024*1024){await body.cancel().catch(()=>{});throw new Error('حجم مرفق ملف الإنجاز غير صالح.')}
 const reader=body.getReader(),signature=new Uint8Array(12);let signatureLength=0,total=0,carry=new Uint8Array(0);
 let frame:ReturnType<typeof portfolioAttachmentFrame>|undefined;
 // The pending chunks cover only the first 12 signature bytes plus the current source chunk.
 let prefixChunks:Uint8Array[]=[];
 function* encode(bytes:Uint8Array){
  for(let offset=0;offset<bytes.byteLength;){
   const take=Math.min(chunkBytes-carry.byteLength,bytes.byteLength-offset),combined=new Uint8Array(carry.byteLength+take);
   combined.set(carry);combined.set(bytes.subarray(offset,offset+take),carry.byteLength);offset+=take;
   const length=combined.byteLength-combined.byteLength%3;
   carry=combined.slice(length);
   if(length)yield encoder.encode(Buffer.from(combined.buffer,combined.byteOffset,length).toString('base64'));
  }
 }
 try{
  for(;;){
   const next=await reader.read();if(next.done)break;
   if(!(next.value instanceof Uint8Array))throw new Error('تعذر قراءة مرفق ملف الإنجاز.');
   total+=next.value.byteLength;if(total>expectedBytes)throw new Error('تغيّر حجم المرفق أثناء التنزيل. أعد المحاولة.');
   if(!frame){
    const amount=Math.min(signature.byteLength-signatureLength,next.value.byteLength);signature.set(next.value.subarray(0,amount),signatureLength);signatureLength+=amount;
    // Ignore zero-length chunks so an unusual source cannot grow this array indefinitely.
    if(next.value.byteLength)prefixChunks.push(next.value);
    if(signatureLength<signature.byteLength)continue;
    frame=portfolioAttachmentFrame(file,signature);yield encoder.encode(frame.prefix);
    for(const bytes of prefixChunks)yield* encode(bytes);prefixChunks=[];
   }else yield* encode(next.value);
  }
  if(total!==expectedBytes)throw new Error('لم يكتمل مرفق ملف الإنجاز. أعد المحاولة.');
  if(!frame){frame=portfolioAttachmentFrame(file,signature.subarray(0,signatureLength));yield encoder.encode(frame.prefix);for(const bytes of prefixChunks)yield* encode(bytes);prefixChunks=[]}
  if(carry.byteLength)yield encoder.encode(Buffer.from(carry).toString('base64'));
  yield encoder.encode(frame.suffix);
 }finally{
  // Runs on completion, source failure and consumer cancellation through iterator.return().
  await reader.cancel().catch(()=>{});reader.releaseLock();
 }
}
