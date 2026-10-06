// Author: Abdulaziz Almalki
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function assertLocalBase(base){assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/,'Tests must target the local database server on loopback only');return base}
export const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9Z1ioAAAAASUVORK5CYII=','base64'));
export const gradeCsv='اسم المتدرب,رقم المتدرب,الدرجات\nأ,900001,0\nب,900002,10\nج,900003,12\nد,900004,20\nهـ,900005,غائب\nو,900006,\n';
export const gradeSelection={maximum:20,passMark:12,sheet:'ورقة CSV',column:'الدرجات [3]',firstRow:2,lastRow:7};
export function assertAuthoritativeGrade(payload,fileId){
 const expected={scores:[0,10,12,20],excluded:2,count:4,average:10.5,averagePercent:52.5,passRate:50,sourceHash:createHash('sha256').update(new TextEncoder().encode(gradeCsv)).digest('hex')};
 for(const[key,value]of Object.entries(expected))assert.deepEqual(payload[key],value,key);
 assert.equal(payload.analysisVersion,2);assert.equal(payload.sourceFileId,fileId);assert.equal(payload.columnIndex,2);
 assert.equal(payload.sourceParserVersion,'3.0.0');assert.equal(payload.formulaPolicy,'cached-numeric-only');assert.ok(Number.isSafeInteger(payload.validatedAt));
}
export async function collectPages(getJson,path,key,{limit=20,maxPages=100,cursorParam='cursor',nextKey='nextCursor'}={}){
 const records=[],ids=new Set(),seen=new Set();let cursor;
 for(let page=0;page<maxPages;page++){
  const url=new URL(path,'http://127.0.0.1');url.searchParams.set('limit',String(limit));if(cursor)url.searchParams.set(cursorParam,cursor);
  const body=await getJson(url.pathname.replace(/^\//,'')+url.search);
  assert.ok(Array.isArray(body[key]),key+' must be an array');assert.ok(body[key].length<=limit);
  for(const row of body[key]){assert.ok(!ids.has(row.id),'Repeated record across pages: '+row.id);ids.add(row.id);records.push(row)}
  if(body[nextKey]===null)return records;
  assert.equal(typeof body[nextKey],'string');assert.ok(!seen.has(body[nextKey]),'Repeated cursor');seen.add(body[nextKey]);cursor=body[nextKey];
 }
 throw new Error('Pagination exceeded bounded fixture maximum');
}
