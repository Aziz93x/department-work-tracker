const MAX_ENTRY=8*1024*1024,MAX_TOTAL=16*1024*1024;
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
export function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
export function openZip(buffer:ArrayBuffer){
 const view=new DataView(buffer),decoder=new TextDecoder('utf-8',{fatal:true});
 const bad=()=>new Error('بنية ملف Office أو بيانات الضغط غير متسقة. أعد حفظ الملف ثم حاول مجددًا.');
 const bounds=(p:number,size:number)=>{if(!Number.isSafeInteger(p)||p<0||size<0||p+size>view.byteLength)throw bad()};
 const u16=(p:number)=>{bounds(p,2);return view.getUint16(p,true)},u32=(p:number)=>{bounds(p,4);return view.getUint32(p,true)};
 let end=-1;for(let p=view.byteLength-22;p>=Math.max(0,view.byteLength-65557);p--)if(u32(p)===0x06054b50&&p+22+u16(p+20)===view.byteLength){end=p;break}
 if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))throw bad();
 const count=u16(end+10),start=u32(end+16),centralSize=u32(end+12);if(count>2000||count===65535||start+centralSize!==end)throw bad();bounds(start,centralSize);
 type Entry={method:number;size:number;unpacked:number;offset:number;crc:number;flags:number;data:number};
 const files=new Map<string,Entry>();let p=start,declared=0,actual=0;const intervals:Array<[number,number]>=[];
 for(let i=0;i<count;i++){
  bounds(p,46);if(u32(p)!==0x02014b50)throw bad();const nameLength=u16(p+28),extra=u16(p+30),comment=u16(p+32);bounds(p,46+nameLength+extra+comment);
  const name=decoder.decode(new Uint8Array(buffer,p+46,nameLength));if(!name||name.includes('\0')||name.includes('\\')||name.startsWith('/')||name.split('/').some(v=>v==='..'||v==='.')||files.has(name)||u16(p+34))throw bad();
  const entry:Entry={method:u16(p+10),size:u32(p+20),unpacked:u32(p+24),offset:u32(p+42),crc:u32(p+16),flags:u16(p+8),data:0};
  if(entry.flags&~(0x800|8|6)||![0,8].includes(entry.method)||entry.size===0xffffffff||entry.unpacked>MAX_ENTRY)throw bad();
  for(let q=p+46+nameLength;q<p+46+nameLength+extra;){if(q+4>p+46+nameLength+extra)throw bad();const id=u16(q),length=u16(q+2);if(id===1||q+4+length>p+46+nameLength+extra)throw bad();q+=4+length}
  declared+=entry.unpacked;if(declared>MAX_TOTAL)throw new Error('محتوى الملف بعد فك الضغط يتجاوز ١٦ ميغابايت.');
  bounds(entry.offset,30);if(u32(entry.offset)!==0x04034b50||u16(entry.offset+8)!==entry.method||u16(entry.offset+6)!==entry.flags)throw bad();
  const localName=u16(entry.offset+26),localExtra=u16(entry.offset+28);bounds(entry.offset+30,localName+localExtra);
  for(let q=entry.offset+30+localName;q<entry.offset+30+localName+localExtra;){if(q+4>entry.offset+30+localName+localExtra)throw bad();const id=u16(q),length=u16(q+2);if(id===1||q+4+length>entry.offset+30+localName+localExtra)throw bad();q+=4+length}
  if(decoder.decode(new Uint8Array(buffer,entry.offset+30,localName))!==name)throw bad();
  if(!(entry.flags&8)&&(u32(entry.offset+14)!==entry.crc||u32(entry.offset+18)!==entry.size||u32(entry.offset+22)!==entry.unpacked))throw bad();
  entry.data=entry.offset+30+localName+localExtra;bounds(entry.data,entry.size);if(entry.data+entry.size>start)throw bad();
  let entryEnd=entry.data+entry.size;
  if(entry.flags&8){const matches=(q:number)=>q+12<=start&&u32(q)===entry.crc&&u32(q+4)===entry.size&&u32(q+8)===entry.unpacked;if(matches(entryEnd))entryEnd+=12;else if(entryEnd+16<=start&&u32(entryEnd)===0x08074b50&&matches(entryEnd+4))entryEnd+=16;else throw bad()}
  intervals.push([entry.offset,entryEnd]);files.set(name,entry);p+=46+nameLength+extra+comment;
 }
 if(p!==end)throw bad();intervals.sort((a,b)=>a[0]-b[0]);if(intervals.some((r,i)=>i>0&&r[0]<intervals[i-1][1]))throw bad();
 return {names:[...files.keys()],has:(name:string)=>files.has(name),async extract(name:string){
  const f=files.get(name);if(!f)throw new Error('ينقص الملف جزء مطلوب: '+name);const bytes=new Uint8Array(buffer.slice(f.data,f.data+f.size));let output:Uint8Array;
  if(f.method===0){output=bytes;actual+=output.byteLength}else{
   const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();const chunks:Uint8Array[]=[];let length=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;actual+=value.byteLength;if(length>f.unpacked||length>MAX_ENTRY||actual>MAX_TOTAL){await reader.cancel();throw new Error('تجاوز فك ضغط الملف الحجم المسموح.')}chunks.push(value)}}finally{reader.releaseLock()}
   output=new Uint8Array(length);let pos=0;for(const chunk of chunks){output.set(chunk,pos);pos+=chunk.byteLength}
  }
  if(actual>MAX_TOTAL||output.byteLength!==f.unpacked||crc32(output)!==f.crc)throw bad();return output;
 }};
}
