'use client';
import {useState,useEffect} from 'react';
import {Download,FileCheck2,Upload,Paperclip,X,CheckCircle2,RotateCcw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {WorkFile} from '@/lib/trainer-domain';
export function EvidenceFiles({files,recordId,nextCursor,purpose}:{files:WorkFile[];recordId?:string;nextCursor?:string|null;purpose?:'decision'|'evidence'}){
 const[extra,setExtra]=useState<WorkFile[]>([]),[cursor,setCursor]=useState(nextCursor),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setExtra([]);setCursor(nextCursor)},[files,nextCursor,recordId]);
 const visible=[...files,...extra].filter(f=>!purpose||(f.purpose||'evidence')===purpose);
 return <div className="evidence-links">{visible.map(f=><a key={f.id} href={'/api/trainer/workspace/files/'+f.id}><FileCheck2 size={18}/><span>{f.original_filename}<small>{(f.byte_size/1024).toFixed(0)} كيلوبايت{f.purpose==='decision'?' · قرار التكليف':''}</small></span><Download size={16}/></a>)}{cursor&&recordId&&<Button type="button" variant="outline" className="no-print" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const response=await fetch('/api/trainer/workspace/records/'+recordId+'/files?cursor='+encodeURIComponent(cursor)),data=await response.json() as {files:WorkFile[];nextCursor:string|null;error?:string};if(!response.ok)throw new Error(data.error);setExtra(v=>[...v,...data.files.filter(f=>![...files,...v].some(p=>p.id===f.id))]);setCursor(data.nextCursor)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>عرض مرفقات أخرى</Button>}{error&&<p role="alert">{error}</p>}</div>;
}
export type UploadEntry={id:string;file:File;state:'ready'|'uploading'|'saved'|'failed';error?:string};
export function validateEvidenceFiles(files:File[]){if(files.length>20)throw new Error('اختر حتى ٢٠ ملفًا في الدفعة الواحدة.');if(files.some(f=>f.size===0||f.size>10*1024*1024))throw new Error('يجب أن يكون كل شاهد غير فارغ وألا يتجاوز حجمه ١٠ ميغابايت.');}
export function useEvidenceQueue(){
 const[entries,setEntries]=useState<UploadEntry[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function add(files:File[]){try{validateEvidenceFiles(files);if(entries.length+files.length>20)throw new Error('تستوعب قائمة الرفع ٢٠ ملفًا في كل دفعة.');setEntries(previous=>[...previous,...files.filter(file=>!previous.some(e=>e.file.name===file.name&&e.file.size===file.size&&e.file.lastModified===file.lastModified)).map(file=>({id:crypto.randomUUID(),file,state:'ready' as const}))]);setError('')}catch(e){setError((e as Error).message)}}
 async function upload(send:(file:File,id:string)=>Promise<unknown>){setBusy(true);setError('');let success=true;
  try{for(const entry of entries.filter(e=>e.state!=='saved')){setEntries(previous=>previous.map(e=>e.id===entry.id?{...e,state:'uploading',error:undefined}:e));try{await send(entry.file,entry.id);setEntries(previous=>previous.map(e=>e.id===entry.id?{...e,state:'saved'}:e))}catch(error){success=false;setEntries(previous=>previous.map(e=>e.id===entry.id?{...e,state:'failed',error:(error as Error).message}:e))}}return success}finally{setBusy(false)}
 }
 return {entries,busy,error,add,upload,clear:()=>setEntries([]),remove:(id:string)=>setEntries(v=>v.filter(e=>e.id!==id))};
}
type Queue=ReturnType<typeof useEvidenceQueue>;
export function EvidencePicker({busy,onFiles,label='اختيار المرفقات',count=0,accept='.pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx'}:{busy:boolean;onFiles:(files:File[])=>void;label?:string;count?:number;accept?:string}){return <label className={'file-button evidence-picker '+(busy?'disabled':'')}><Upload size={18}/><span>{label}<small>حتى ١٠ ميغابايت لكل ملف، ٢٠ ملفًا للدفعة</small></span><input aria-label={label} type="file" multiple accept={accept} disabled={busy} onChange={e=>{const files=Array.from(e.target.files||[]);if(files.length)onFiles(files);e.target.value=''}}/>{count>0&&<b><Paperclip size={14}/>{count}</b>}</label>}
export function EvidenceQueue({queue,label,disabled=false,decision=false}:{queue:Queue;label?:string;disabled?:boolean;decision?:boolean}){
 const saved=queue.entries.filter(e=>e.state==='saved').length;
 return <div className="upload-queue"><EvidencePicker busy={queue.busy||disabled} onFiles={queue.add} label={label} count={queue.entries.length} accept={decision?'.pdf,.png,.jpg,.jpeg,.webp':undefined}/>{queue.error&&<p className="error" role="alert">{queue.error}</p>}{queue.entries.length>0&&<><ul className="upload-files">{queue.entries.map(e=><li key={e.id} data-state={e.state}><div><b>{e.file.name}</b><small>{(e.file.size/1024).toLocaleString('ar-SA',{maximumFractionDigits:0})} كيلوبايت · {e.state==='ready'?'جاهز للرفع':e.state==='saved'?'تم الحفظ':e.state==='uploading'?'جارٍ الرفع':'تعثر الرفع'}</small>{e.error&&<p role="alert">{e.error}</p>}</div>{e.state==='saved'?<CheckCircle2 aria-label="تم الحفظ"/>:<button type="button" aria-label={'إزالة '+e.file.name} disabled={queue.busy||disabled} onClick={()=>queue.remove(e.id)}><X size={17}/></button>}</li>)}</ul><p className="help" role="status" aria-live="polite">حُفظ {saved} من {queue.entries.length} ملف.</p>{saved===queue.entries.length&&<Button type="button" variant="outline" disabled={queue.busy||disabled} onClick={queue.clear}>بدء دفعة جديدة</Button>}</>}</div>;
}
export async function uploadWorkFile(csrf:string,category:string,itemKey:string,courseKey:string,file:File,requestId:string,purpose='evidence'){
 validateEvidenceFiles([file]);const form=new FormData();form.set('file',file);form.set('category',category);form.set('itemKey',itemKey);form.set('courseKey',courseKey);form.set('purpose',purpose);
 const response=await fetch('/api/trainer/workspace/files',{method:'POST',headers:{'X-CSRF-Token':csrf,'X-Upload-Id':requestId},body:form}),result=await response.json() as {id:string;recordId:string;error?:string};if(!response.ok)throw new Error(result.error||'تعذر رفع الملف.');return result;
}
export function EvidenceUploader({csrf,category,itemKey,courseKey,purpose='evidence',label='اختيار المرفقات',onSaved,disabled=false}:{csrf:string;category:string;itemKey:string;courseKey:string;purpose?:string;label?:string;onSaved:(complete:boolean)=>Promise<void>;disabled?:boolean}){
 const queue=useEvidenceQueue(),[refreshError,setRefreshError]=useState(''),pending=queue.entries.some(e=>e.state!=='saved');
 return <div className="evidence-uploader"><EvidenceQueue queue={queue} label={label} disabled={disabled} decision={purpose==='decision'}/>{pending&&<Button type="button" variant="outline" disabled={queue.busy||disabled} onClick={async()=>{setRefreshError('');const complete=await queue.upload((file,id)=>uploadWorkFile(csrf,category,itemKey,courseKey,file,id,purpose));try{await onSaved(complete)}catch(e){setRefreshError((e as Error).message)}}}>{queue.entries.some(e=>e.state==='failed')?<RotateCcw size={16}/>:<Upload size={16}/>} {queue.busy?'جارٍ رفع المرفقات…':queue.entries.some(e=>e.state==='failed')?'إعادة رفع المتعثر فقط':'رفع الملفات المختارة'}</Button>}{refreshError&&<p className="error" role="alert">تعذر تحديث قائمة المرفقات: {refreshError}</p>}</div>;
}
// Retained for callers that upload a controlled file list programmatically.
const requestIds=new WeakMap<File,string>();
export async function uploadEvidence(csrf:string,category:string,itemKey:string,courseKey:string,files:File[],purpose='evidence'){
 validateEvidenceFiles(files);const result=[];for(const file of files){let id=requestIds.get(file);if(!id){id=crypto.randomUUID();requestIds.set(file,id)}result.push(await uploadWorkFile(csrf,category,itemKey,courseKey,file,id,purpose))}return result;
}
