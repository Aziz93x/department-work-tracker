import {createHash} from 'node:crypto';
import {bucket} from './files';
import {readCsv} from './csv';
import {normalizeReportTerm} from './identity';
import type {ParsedReport} from './rayat';

// Bump whenever CSV parsing, blank-row handling, or stored-row semantics change.
export const reportParserRevision='rayat-rows-4';
const MiB=1024*1024;
type StoredObject={size:number;body:ReadableStream<Uint8Array>};
type CacheBucket={get(key:string):Promise<StoredObject|null>;put(key:string,value:Uint8Array,options?:{httpMetadata:{contentType:string;cacheControl:string}}):Promise<unknown>};
type Envelope={format:1;parserRevision:string;objectKey:string;term:string;sourceSha256:string;rows:string[][]};
type Entry={report:ParsedReport;weight:number};
type Settings={getBucket:()=>CacheBucket;revision?:string;maximumRetained?:number;maximumProjection?:number;maximumLoads?:number;maximumPending?:number;parse?:(bytes:Uint8Array)=>string[][];onIssue?:(event:string)=>void};

function jsonStringBytes(value:string){
 let size=2;
 for(let i=0;i<value.length;i++){
  const c=value.charCodeAt(i);
  if(c===34||c===92){size+=2;continue}
  if(c<32){size+=(c===8||c===9||c===10||c===12||c===13)?2:6;continue}
  if(c<128){size++;continue}if(c<2048){size+=2;continue}
  if(c>=0xd800&&c<=0xdbff){const next=value.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff){size+=4;i++;continue}size+=6;continue}
  size+=c>=0xdc00&&c<=0xdfff?6:3;
 }
 return size;
}

function parseRows(bytes:Uint8Array){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
 if(text.includes('\0'))throw new Error('الملف ليس CSV نصيًا صالحًا.');
 return readCsv(text).filter(row=>row.some(value=>value!==''));
}

// This is conservative cache accounting, not a claim of exact Worker heap use.
function validateAndWeigh(rows:unknown){
 if(!Array.isArray(rows)||!rows.length||rows.length>100000)throw new Error('Invalid report projection rows');
 let cells=0,characters=0,weight=256,jsonBytes=2+rows.length-1;
 const width=Array.isArray(rows[0])?rows[0].length:0;
 if(!width||width>1000)throw new Error('Invalid report projection headers');
 for(const row of rows){
  if(!Array.isArray(row)||row.length!==width)throw new Error('Invalid report projection columns');
  if((cells+=row.length)>250000)throw new Error('Invalid report projection cell count');
  weight+=64+8*row.length;jsonBytes+=2+row.length-1;
  for(const value of row){
   if(typeof value!=='string'||value.includes('\0'))throw new Error('Invalid report projection cell');
   if((characters+=value.length)>8*MiB)throw new Error('Invalid report projection character count');
   weight+=48+2*value.length;jsonBytes+=jsonStringBytes(value);
  }
 }
 return {weight,jsonBytes};
}

async function readBounded(object:StoredObject,maximum:number){
 if(object.size>maximum)throw new Error('Report object exceeds allowed size');
 const reader=object.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{
  for(;;){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>maximum){await reader.cancel();throw new Error('Report object exceeds allowed size')}chunks.push(next.value)}
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return bytes;
}

/** Private immutable row projections; trainer filtering stays in the existing sync domain functions. */
export function createReportCache(settings:Settings){
 const revision=settings.revision||reportParserRevision,maximum=settings.maximumRetained??24*MiB;
 const projectionMaximum=settings.maximumProjection??12*MiB,maxLoads=settings.maximumLoads??1,maxPending=settings.maximumPending??16;
 const parse=settings.parse||parseRows,issue=settings.onIssue||((event:string)=>console.warn('rayat_cache',event));
 const entries=new Map<string,Entry>(),pending=new Map<string,Promise<ParsedReport|null>>(),waiting:Array<()=>void>=[];
 let retained=0,generation=0,activeLoads=0,totalPending=0;
 const keyFor=(objectKey:string,term='')=>'rayat-cache/'+revision+'/'+createHash('sha256').update(JSON.stringify([revision,normalizeReportTerm(term),objectKey])).digest('hex')+'.json';
 async function acquire(){if(activeLoads<maxLoads){activeLoads++;return}await new Promise<void>(resolve=>waiting.push(resolve))}
 function release(){const next=waiting.shift();if(next)next();else activeLoads--}
 function remember(key:string,entry:Entry,epoch:number){
  if(epoch!==generation||entry.weight>maximum)return;
  const prior=entries.get(key);if(prior){retained-=prior.weight;entries.delete(key)}
  while(retained+entry.weight>maximum&&entries.size){const first=entries.keys().next().value!;retained-=entries.get(first)!.weight;entries.delete(first)}
  entries.set(key,entry);retained+=entry.weight;
 }
 async function load(objectKey:string,term:string,key:string,epoch:number):Promise<ParsedReport|null>{
  await acquire();
  try{
   const storage=settings.getBucket();
   // Cache failures fall back to the original validated import, never to empty data.
   try{
    const cached=await storage.get(key);
    if(cached){
     const raw=await readBounded(cached,projectionMaximum);
     const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)) as Envelope;
     if(data?.format!==1||data.parserRevision!==revision||data.objectKey!==objectKey||data.term!==term||typeof data.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(data.sourceSha256))throw new Error('Invalid report projection identity');
     const {weight}=validateAndWeigh(data.rows),report:ParsedReport={format:'rayat-parsed',rows:data.rows};
     remember(key,{report,weight},epoch);return report;
    }
   }catch{issue('projection_read_failed')}
   const source=await storage.get(objectKey);if(!source)return null;
   const bytes=await readBounded(source,8*MiB),rows=parse(bytes),{weight,jsonBytes}=validateAndWeigh(rows);
   const report:ParsedReport={format:'rayat-parsed',rows};
   const envelope:Envelope={format:1,parserRevision:revision,objectKey,term,sourceSha256:createHash('sha256').update(bytes).digest('hex'),rows};
   try{
    // Accepted reports normally fit. Cache write failure never breaks imported data.
    const header={...envelope,rows:[]};
    const expectedSize=new TextEncoder().encode(JSON.stringify(header)).byteLength-2+jsonBytes;
    if(expectedSize<=projectionMaximum){const encoded=new TextEncoder().encode(JSON.stringify(envelope));await storage.put(key,encoded,{httpMetadata:{contentType:'application/json; charset=utf-8',cacheControl:'private, no-store'}})}
    else issue('projection_too_large');
   }catch{issue('projection_write_failed')}
   remember(key,{report,weight},epoch);return report;
  }finally{release()}
 }
 async function reportData(objectKey:string,term=''){
  if(!objectKey||objectKey.length>1024)throw new Error('Invalid report source key');
  term=normalizeReportTerm(term);if(term.length>128)throw new Error('Invalid report term');
  const key=keyFor(objectKey,term),hit=entries.get(key);
  if(hit){entries.delete(key);entries.set(key,hit);return hit.report}
  const existing=pending.get(key);if(existing)return existing;
  if(totalPending>=maxPending)throw new Error('تقارير رايات مشغولة الآن؛ أعد المحاولة بعد لحظات.');
  totalPending++;const epoch=generation,promise=load(objectKey,term,key,epoch);pending.set(key,promise);
  try{return await promise}finally{totalPending--;if(pending.get(key)===promise)pending.delete(key)}
 }
 return {
  reportData,
  invalidate(){generation++;entries.clear();retained=0;pending.clear()},
  // Internal acceptance-test support. Do not expose through an HTTP endpoint.
  stats(){return {retained,entries:entries.size,pending:totalPending,activeLoads,waiting:waiting.length,generation}},
  keyFor
 };
}

const cache=createReportCache({getBucket:bucket});
export const reportData=cache.reportData;
// Transitional alias keeps current API imports/call sites working during integration.
export const reportBytes=reportData;
export const invalidateReports=cache.invalidate;
