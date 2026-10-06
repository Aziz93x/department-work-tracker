import {readCsv} from './csv';
import {openZip} from './zip';
export {readCsv} from './csv';
export const gradeParserVersion='3.0.0',gradeRowLimit=2000;
export type GradeSheet={name:string;rows:string[][];cellTypes?:Record<string,string>};
export async function readGradeWorkbook(file:File):Promise<GradeSheet[]>{
 if(file.size>10*1024*1024||!file.size)throw new Error('اختر ملفًا غير فارغ حتى ١٠ ميغابايت.');
 const buffer=await file.arrayBuffer(),decoder=new TextDecoder('utf-8',{fatal:true});
 if(file.name.toLowerCase().endsWith('.csv')){const text=decoder.decode(buffer).replace(/^\uFEFF/,'');if(text.includes('\0'))throw new Error('ملف CSV ليس نصًا صالحًا.');return [{name:'ورقة CSV',rows:readCsv(text,{rows:20000,columns:500,cells:250000})}]}
 if(!file.name.toLowerCase().endsWith('.xlsx'))throw new Error('احفظ الملف بصيغة XLSX أو CSV ثم أعد المحاولة.');
 const zip=openZip(buffer),mainNamespaces=['http://schemas.openxmlformats.org/spreadsheetml/2006/main','http://purl.oclc.org/ooxml/spreadsheetml/main'],relationNamespaces=['http://schemas.openxmlformats.org/officeDocument/2006/relationships','http://purl.oclc.org/ooxml/officeDocument/relationships'];let markup=0,cells=0;
 const parse=typeof DOMParser!=='undefined'?new DOMParser():new (await import('@xmldom/xmldom')).DOMParser({onError:()=>{throw new Error('تعذر قراءة XML في ملف Excel.')}});
 const nodes=(node:Document|Element,name:string)=>Array.from(node.getElementsByTagNameNS(node.nodeType===9?(node as Document).documentElement.namespaceURI:(node as Element).namespaceURI,name));
 const readXml=async(name:string,root:string,namespaces=mainNamespaces)=>{
  const bytes=await zip.extract(name);if(bytes.byteLength>1024*1024)throw new Error('جزء Excel كبير؛ صدّر ورقة الدرجات المطلوبة وحدها أو بصيغة CSV.');
  const text=decoder.decode(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('تعريفات XML الخارجية غير مدعومة.');
  let count=0;for(let i=0;i<text.length;i++)if(text[i]==='<'&&!['/','!','?'].includes(text[i+1])){count++;markup++;if(count>24000||markup>30000)throw new Error('بنية Excel كثيفة؛ صدّر ورقة الدرجات المطلوبة وحدها أو بصيغة CSV.')}
  const doc=parse.parseFromString(text,'application/xml') as unknown as Document;
  if(!doc.documentElement||doc.getElementsByTagName('parsererror').length||doc.documentElement.localName!==root||!namespaces.includes(doc.documentElement.namespaceURI||''))throw new Error('نوع XML أو مساحة أسماء Excel غير مدعوم.');return doc;
 };
 const manifest=await readXml('[Content_Types].xml','Types',['http://schemas.openxmlformats.org/package/2006/content-types']);
 const contentTypes=new Map<string,string>();for(const item of nodes(manifest,'Override')){const key=(item.getAttribute('PartName')||'').replace(/^\//,'');if(contentTypes.has(key))throw new Error('تعريف أجزاء Excel مكرر.');contentTypes.set(key,item.getAttribute('ContentType')||'')}
 const content=(name:string,suffix:string)=>{if(contentTypes.get(name)!=='application/vnd.openxmlformats-officedocument.spreadsheetml.'+suffix+'+xml')throw new Error('تعريف نوع جزء Excel لا يطابق محتواه.')};
 content('xl/workbook.xml','sheet.main');
 const shared:string[]=[];if(zip.has('xl/sharedStrings.xml')){content('xl/sharedStrings.xml','sharedStrings');const doc=await readXml('xl/sharedStrings.xml','sst');for(const si of nodes(doc,'si')){if(shared.length>=10000)throw new Error('عدد نصوص Excel يتجاوز الحد المسموح.');shared.push(nodes(si,'t').map(t=>t.textContent||'').join(''))}}
 const paths=new Map<string,string>();for(const rel of nodes(await readXml('xl/_rels/workbook.xml.rels','Relationships',['http://schemas.openxmlformats.org/package/2006/relationships']),'Relationship')){
  const id=rel.getAttribute('Id')||'';if(!id||paths.has(id))throw new Error('معرفات روابط Excel مكررة أو ناقصة.');
  const type=rel.getAttribute('Type')||'';paths.set(id,rel.getAttribute('TargetMode')!=='External'&&relationNamespaces.some(ns=>type===ns+'/worksheet')?rel.getAttribute('Target')||'':'');
 }
 const result:GradeSheet[]=[];const names=new Set<string>(),targets=new Set<string>();
 for(const sheet of nodes(await readXml('xl/workbook.xml','workbook'),'sheet')){
  if(result.length>=50)throw new Error('عدد أوراق Excel يتجاوز ٥٠.');
  const id=relationNamespaces.map(ns=>sheet.getAttributeNS(ns,'id')).find(Boolean)||'',target=paths.get(id)||'',path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');if(!target||!zip.has(path)||targets.has(path))throw new Error('رابط ورقة Excel مكرر أو غير صالح.');targets.add(path);content(path,'worksheet');
  const name=sheet.getAttribute('name')||'ورقة عمل';if(names.has(name))throw new Error('أسماء أوراق العمل مكررة.');names.add(name);
  const rows:string[][]=[],cellTypes:Record<string,string>={};
  for(const row of nodes(await readXml(path,'worksheet'),'row')){
   const index=Number(row.getAttribute('r'))-1;if(!Number.isInteger(index)||index<0||index>=20000||rows[index])throw new Error('صف Excel مكرر أو يتجاوز ٢٠٠٠٠ صف.');const values:string[]=[];
   for(const cell of nodes(row,'c')){
    if(++cells>10000)throw new Error('عدد خلايا Excel يتجاوز ١٠٠٠٠؛ صدّر ورقة الدرجات المطلوبة وحدها.');
    const ref=cell.getAttribute('r')||'',match=ref.match(/^([A-Z]+)(\d+)$/);if(!match||Number(match[2])!==index+1)throw new Error('عنوان خلية Excel غير متسق.');let column=0;for(const letter of match[1])column=column*26+letter.charCodeAt(0)-64;if(column>500)throw new Error('عدد أعمدة الورقة يتجاوز ٥٠٠.');if(values[column-1]!==undefined)throw new Error('خلية Excel مكررة.');
    const type=cell.getAttribute('t')||'n',v=nodes(cell,'v')[0]?.textContent,formula=nodes(cell,'f').length>0;if(!['n','s','inlineStr','str','b','e','d'].includes(type))throw new Error('نوع خلية Excel غير معروف.');cellTypes[index+':'+(column-1)]=formula?(v&&type==='n'?'formula':'invalid-formula'):type;
    if(type==='s'&&(!v||!/^\d+$/.test(v)||Number(v)>=shared.length))throw new Error('مرجع نص Excel غير صالح.');
    values[column-1]=type==='s'?shared[Number(v)]:type==='inlineStr'?nodes(cell,'is')[0]?.textContent||'':v??(formula?'#NO_CACHED_VALUE':'');
   }
   rows[index]=values;
  }
  result.push({name,rows,cellTypes});
 }
 if(!result.length)throw new Error('لا توجد أوراق عمل قابلة للقراءة.');return result;
}
export const gradeNumber=(text:string)=>{const v=text.trim().replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/٫/g,'.');return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)?Number(v):null};
export function gradeSuggestions(sheet:GradeSheet){const header=sheet.rows.slice(0,30).findIndex(row=>row?.some(cell=>/^(الدرجة|الدرجات|score|mark|grade)$/i.test(cell?.trim()||'')));const row=sheet.rows[header]||[];const column=row.findIndex(c=>/^(الدرجة|الدرجات|score|mark|grade)$/i.test(c?.trim()||'')),idColumn=row.findIndex(c=>/^(رقم المتدرب|الرقم التدريبي|student.?id)$/i.test(c?.trim()||''));let maximum=100;for(const r of sheet.rows.slice(0,Math.max(header,1))){const i=r?.findIndex(v=>v?.includes('الدرجة العظمى'));if(i!==undefined&&i>=0){const n=gradeNumber(r[i+1]||'');if(n&&n<=100)maximum=n}}
 let last=header+1;for(let i=header+1;i<sheet.rows.length;i++){const v=sheet.rows[i]?.[idColumn>=0?idColumn:column]||'';if(gradeNumber(v)!==null)last=i+1;else if(last>header+1)break}
 const term=sheet.rows.slice(0,4).flat().find(v=>/^14\d{4}$/.test(v?.trim()||''));return {header:Math.max(1,header+1),column,idColumn,firstRow:Math.max(2,header+2),lastRow:Math.max(header+2,last),maximum,term};
}
export function selectedGrades(sheet:GradeSheet,column:number,first:number,last:number,maximum:number){
 if(!Number.isInteger(column)||column<0||column>=500||!Number.isInteger(first)||!Number.isInteger(last)||first<1||last<first||last-first+1>gradeRowLimit||last>sheet.rows.length)throw new Error('حدد عمود الدرجات ونطاقًا صالحًا بحد أقصى ٢٠٠٠ صف، شاملًا المستبعدين.');
 const scores:number[]=[];let excluded=0;const invalid:number[]=[];
 for(let i=first-1;i<last;i++){const text=(sheet.rows[i]?.[column]||'').trim(),type=sheet.cellTypes?.[i+':'+column];if(type&&['b','e','d','invalid-formula'].includes(type)){invalid.push(i+1);continue}if(!text||['غائب','غ','محروم','منسحب','مطوي قيده','—','-'].includes(text)){excluded++;continue}const value=(type==='n'||type==='formula')&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)?Number(text):gradeNumber(text);if(value===null||!Number.isFinite(value)||value<0||value>maximum||value>100)invalid.push(i+1);else scores.push(value)}
 if(invalid.length)throw new Error('راجع الدرجات في الصفوف: '+invalid.slice(0,12).join('، ')+'. لا تُقبل القيم المنطقية أو الأخطاء أو النصوص غير المعروفة أو الدرجات خارج النطاق.');if(!scores.length)throw new Error('لا توجد درجات رقمية في النطاق المختار.');return {scores,excluded};
}
