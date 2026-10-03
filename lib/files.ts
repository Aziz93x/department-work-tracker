import {env} from 'cloudflare:workers';

export const maxEvidenceBytes=10*1024*1024;
export const maxAvatarBytes=2*1024*1024;

export function bucket(){
 if(!env.BUCKET)throw new Error('Private file storage unavailable');
 return env.BUCKET;
}

// File type is derived from the bytes, never the browser's filename or MIME header.
export function imageType(bytes:Uint8Array){
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 return null;
}
export function evidenceType(bytes:Uint8Array){
 if(bytes.length>=5&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-')return 'application/pdf';
 return imageType(bytes);
}

export function privateFile(body:ReadableStream<Uint8Array>,contentType:string,filename:string,inline=false){
 const safe=encodeURIComponent(filename.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,120));
 return new Response(body,{headers:{
  'Content-Type':contentType,'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${safe}`,
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer'
 }});
}
