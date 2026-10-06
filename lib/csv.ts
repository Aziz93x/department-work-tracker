/** Strict CSV shared by the report and grade importers. */
export function readCsv(text:string,limits={rows:100000,columns:1000,cells:250000}):string[][]{
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false,cells=0,started=false;
 const push=()=>{if(++cells>limits.cells||row.length>=limits.columns)throw new Error('عدد خلايا أو أعمدة CSV يتجاوز الحد المسموح.');row.push(field);field='';closed=false};
 const finish=()=>{if(rows.length>=limits.rows)throw new Error('عدد صفوف CSV يتجاوز الحد المسموح.');rows.push(row);row=[];started=false};
 for(let i=0;i<text.length;i++){
  const ch=text[i];started=true;
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=ch;continue}
  if(ch==='"'){if(field||closed)throw new Error('تنسيق CSV غير صالح: علامة اقتباس داخل حقل غير مقتبس.');quoted=true;continue}
  if(ch===','){push();continue}
  if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;push();finish();continue}
  if(closed)throw new Error('تنسيق CSV غير صالح: نص بعد إغلاق علامة الاقتباس.');field+=ch;
 }
 if(quoted)throw new Error('علامة اقتباس غير مغلقة في CSV.');if(started){push();finish()}return rows;
}
