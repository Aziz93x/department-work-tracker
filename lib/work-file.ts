import {evidenceType} from './files';
import {readGradeWorkbook} from './grade-workbook';
import {openZip} from './zip';
export async function workFileType(file:File,bytes:Uint8Array,category:string,purpose:string){
 const extension=file.name.toLowerCase().split('.').pop()||'';
 if(category==='grade_analysis'){
  if(!['csv','xlsx'].includes(extension))throw new Error('تحليل الدرجات يقبل XLSX أو CSV فقط.');
  await readGradeWorkbook(file);return extension==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 }
 const mime=evidenceType(bytes),expected:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
 if(mime&&expected[extension]===mime)return mime;
 const office:Record<string,[string,string]>={docx:['word/document.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],pptx:['ppt/presentation.xml','application/vnd.openxmlformats-officedocument.presentationml.presentation'],xlsx:['xl/workbook.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']};
 if(purpose!=='decision'&&office[extension]){
  const zip=openZip(await file.arrayBuffer()),[part,type]=office[extension];
  if(!zip.has('[Content_Types].xml')||!zip.has(part)||zip.names.some(n=>/vbaProject|activeX/i.test(n)))throw new Error('ملف Office لا يطابق صيغته أو يحتوي على محتوى غير مدعوم.');
  const {DOMParser}=await import('@xmldom/xmldom'),parser=new DOMParser({onError:()=>{throw new Error('بنية ملف Office غير صالحة.')}});
  const parsed=[];for(const name of ['[Content_Types].xml',part]){const data=await zip.extract(name);if(data.length>1024*1024)throw new Error('جزء Office يتجاوز الحد المدعوم؛ صدّر الشاهد بصيغة PDF.');const text=new TextDecoder('utf-8',{fatal:true}).decode(data);if(!text.trim().startsWith('<')||/<!DOCTYPE|<!ENTITY/i.test(text)||(text.match(/</g)||[]).length>30000)throw new Error('بنية ملف Office غير صالحة.');parsed.push(parser.parseFromString(text,'application/xml'))}
  const spec:Record<string,[string,string[],string]>={docx:['document',['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main'],'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'],pptx:['presentation',['http://schemas.openxmlformats.org/presentationml/2006/main','http://purl.oclc.org/ooxml/presentationml/main'],'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'],xlsx:['workbook',['http://schemas.openxmlformats.org/spreadsheetml/2006/main','http://purl.oclc.org/ooxml/spreadsheetml/main'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml']};
  const [root,namespaces,contentType]=spec[extension],manifest=parsed[0].documentElement,main=parsed[1].documentElement;
  if(manifest?.localName!=='Types'||manifest.namespaceURI!=='http://schemas.openxmlformats.org/package/2006/content-types'||main?.localName!==root||!namespaces.includes(main.namespaceURI||'')||!Array.from(parsed[0].getElementsByTagNameNS(manifest.namespaceURI,'Override')).some(item=>item.getAttribute('PartName')==='/'+part&&item.getAttribute('ContentType')===contentType))throw new Error('نوع ملف Office لا يطابق تعريف أجزائه.');
  return type;
 }
 throw new Error(purpose==='decision'?'قرار التكليف يقبل PDF أو PNG أو JPG أو WebP.':'المرفقات تقبل PDF أو الصور PNG وJPG وWebP أو ملفات DOCX وPPTX وXLSX المطابقة لصيغتها.');
}
