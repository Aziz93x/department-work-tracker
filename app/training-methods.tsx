'use client';
import {useState} from 'react';
import {trainingMethods} from '@/lib/trainer-domain';
import {Button} from '@/components/ui/button';
export default function TrainingMethods({saved,busy,onSave,onDirty}:{saved:string[];busy:boolean;onSave:(methods:string[])=>Promise<void>;onDirty:(dirty:boolean)=>void}){
 const[chosen,setChosen]=useState(saved),[baseline,setBaseline]=useState(saved),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');const dirty=JSON.stringify(chosen)!==JSON.stringify(baseline);
 return <div className="methods-editor"><div className="training-methods">{trainingMethods.map(m=><label key={m}><input type="checkbox" disabled={busy||saving} checked={chosen.includes(m)} onChange={e=>{const next=trainingMethods.filter(v=>v===m?e.target.checked:chosen.includes(v));setChosen(next);onDirty(JSON.stringify(next)!==JSON.stringify(baseline));setNotice('')}}/>{m}</label>)}</div><div className="action-row"><Button type="button" disabled={!dirty||busy||saving} onClick={async()=>{setSaving(true);setError('');try{await onSave(chosen);setBaseline(chosen);onDirty(false);setNotice('حُفظت الأساليب. حدّد حالة التنفيذ في الخطوة التالية.')}catch(e){setError((e as Error).message)}finally{setSaving(false)}}}>{saving?'جارٍ حفظ الأساليب…':'حفظ الأساليب المختارة'}</Button><small className="help" role="status">{dirty?'لديك اختيارات لم تُحفظ':notice||'الاختيارات المعروضة محفوظة'}</small></div>{error&&<p className="error" role="alert">{error}</p>}</div>;
}
