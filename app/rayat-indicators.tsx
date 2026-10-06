'use client';
import {IndicatorChart} from './indicator-charts';
type Rayat={term:string|null;normalizedTerm?:string|null;registered:number|null;withdrawn:number|null;dismissed:number|null;deprived:number|null;unregistered:number|null;withUnexcusedAbsence:number|null;allCourseDeprived:number|null;sections:number|null;sectionRegistrations:number|null;remoteSections:number|null;remoteRegistrations:number|null;confirmedRemoteSections:number|null;continuingRegistrations?:number|null;deprivedRegistrations?:number|null;dismissedRegistrations?:number|null;withdrawnRegistrations?:number|null;staff?:number|null;excludedStaff?:number;reconciliation?:{SF01:number|null;SS01:number|null;SO08:number|null;consistent:boolean;available:number};linkage?:{scheduleSections:number;registrationSections:number;linkedSections:number;sameCourseSections:number;absenceSections:number;linkedAbsenceSections:number;absenceCourses:number;statusCourses:number;linkedCourses:number;excludedCourses:string[];missingAbsenceCourses:string[];electricalTrainees:number;electricalDeprived:number;electricalWithUnexcusedAbsence:number;scheduledTrainers:number}|null};
const number=(n:number|null)=>n===null?'—':n.toLocaleString('ar-SA-u-nu-latn');
export default function RayatIndicators({data,isHead}:{data:Rayat|null;isHead:boolean}){
 const items=[{label:'المنسحبون',value:data?.withdrawn??null},{label:'المطوي قيدهم',value:data?.dismissed??null},{label:'المحرومون بسبب الغياب',value:data?.deprived??null}];
 return <section className="panel rayat-indicators">
  <div className="panel-title"><div><h3>حالات المتدربين وخطط التحسين</h3><p>أعداد المتدربين الفريدة بحسب حالات التسجيل في شعب القسم بتقرير SF01.</p></div></div>
  <div className="rayat-population">
   <span>ربط الشعب بين SF01 وSS01: <b>{number(data?.linkage?.linkedSections??null)} / {number(data?.linkage?.registrationSections??null)}</b></span>
   <span>تطابق المقرر داخل الشعبة: <b>{number(data?.linkage?.sameCourseSections??null)}</b></span>
   <span>شعب الغياب المرتبطة بتقارير التسجيل والجداول: <b>{number(data?.linkage?.linkedAbsenceSections??null)} / {number(data?.linkage?.absenceSections??null)}</b></span>
   <span>شعب SO01 التي لا يقابلها رقم شعبة في SS01: <b>{number(data?.linkage?data.linkage.absenceSections-data.linkage.linkedAbsenceSections:null)}</b></span>
   <span>مقررات SO01 المطابقة لقسم التقنية الكهربائية في SO08: <b>{number(data?.linkage?.linkedCourses??null)} / {number(data?.linkage?.absenceCourses??null)}</b></span>
   <span>مدربون مسندة لهم شعب في SS01: <b>{number(data?.linkage?.scheduledTrainers??null)}</b></span>
  </div>
  {!!data?.linkage?.excludedCourses.length&&<p className="rayat-pending">اقتصر احتساب مؤشرات الغياب على المقررات المطابقة بالرمز والرقم لقسم التقنية الكهربائية في SO08؛ واستُبعدت رموز المقررات التي تظهر ضمن أقسام أخرى: {data.linkage.excludedCourses.join('، ')}.</p>}
  <div className="rayat-indicator-content">
   <div className="rayat-risk-chart"><IndicatorChart title="حالات المتدربين في SF01" labels={items.map(item=>item.label)} series={[{label:'عدد المتدربين',values:items.map(item=>item.value)}]} /></div>
   <div className="rayat-risk-grid">{items.map(item=><article key={item.label}><strong>{number(item.value)}</strong><span>{item.label}</span></article>)}</div>
   <div className="rayat-population">
    <span>متدربون فريدون في SF01: <b>{number(data?.registered??null)}</b></span>
    <span>بلا تسجيل بحسب SF06: <b>{number(data?.unregistered??null)}</b></span>
    <span>متدربون لديهم غياب دون عذر في مقرر واحد فأكثر (SO01): <b>{number(data?.withUnexcusedAbsence??null)}</b></span>
    <span>محرومون بسبب الغياب في مقرر واحد فأكثر (SO01): <b>{number(data?.allCourseDeprived??null)}</b></span>
    <span>شعب القسم وفق SS01: <b>{number(data?.sections??null)}</b></span>
    <span>تسجيلات الشعب في SS01: <b>{number(data?.sectionRegistrations??null)}</b></span>
    <span>شعب التدريب عن بُعد: <b>{number(data?.remoteSections??null)}</b></span>
    <span>تسجيلات شعب التدريب عن بُعد: <b>{number(data?.remoteRegistrations??null)}</b></span>
   </div>
   <div className="rayat-population">
    <span>تسجيلات SO08 المستمرة: <b>{number(data?.continuingRegistrations??null)}</b></span>
    <span>تسجيلات SO08 المحرومة: <b>{number(data?.deprivedRegistrations??null)}</b></span>
    <span>تسجيلات SO08 المطوي قيدهم: <b>{number(data?.dismissedRegistrations??null)}</b></span>
    <span>تسجيلات SO08 المنسحبين: <b>{number(data?.withdrawnRegistrations??null)}</b></span>
    <span>أعضاء التدريب في SL03 بعد الاستبعادات المؤكدة: <b>{number(data?.staff??null)}</b></span>
   </div>
   <p className="muted">تعريف الوحدات: حالات SF01 وغياب SO01 أعداد متدربين فريدين؛ حالات SO08 تسجيلات على مستوى المقرر وقد يظهر المتدرب في أكثر من مقرر؛ أعداد SO08 لا تُجمع مع أعداد SF01. لا تُجمع حالات المتدرب المتداخلة. {data?.reconciliation?.available===3?data.reconciliation.consistent?'إجمالي تسجيلات القسم متطابق في SF01 وSS01 وSO08. ':'يوجد اختلاف بين إجماليات SF01 وSS01 وSO08 ويحتاج مراجعة. ':'مقارنة إجمالي التسجيلات غير مكتملة لعدم توفر التقارير الثلاثة. '}{data?.excludedStaff?'استُبعد '+number(data.excludedStaff)+' سجلين من SL03 بناءً على تصحيح القسم. ':''}{data?.confirmedRemoteSections?'صُحح تصنيف '+number(data.confirmedRemoteSections)+' من شعب التدريب عن بُعد بتأكيد القسم. ':''}{data?.unregistered===0?'أكد القسم أن ملف SF06 الخالي من السجلات يخص الفصل الحالي. ':''}{data?.term?'الفصل: '+data.term+'.':''} {isHead?'تُدار خطط التحسين والشواهد أدناه.':'هذه مؤشرات للاطلاع فقط.'}</p>
   {data?.withdrawn==null&&<p className="rayat-pending">تظهر أعداد الحالات بعد رفع تقرير SF01 الصحيح من صفحة تقارير رايات.</p>}
  </div>
 </section>;
}
