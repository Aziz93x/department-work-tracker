export class BodyLimitError extends Error{}
export async function limitedBytes(req:Request,limit:number){
 const advertised=Number(req.headers.get('content-length'));if(Number.isFinite(advertised)&&advertised>limit)throw new BodyLimitError('حجم الطلب يتجاوز الحد المسموح.');
 if(!req.body)return new Uint8Array();const reader=req.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new BodyLimitError('حجم الطلب يتجاوز الحد المسموح.')}parts.push(value)}}finally{reader.releaseLock()}
 const output=new Uint8Array(size);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.byteLength}return output;
}
export async function limitedForm(req:Request,limit:number){const bytes=await limitedBytes(req,limit);return new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData()}
