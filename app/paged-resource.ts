'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
export function usePagedResource<T extends {id:string}>(url:string,field:string){
 const[items,setItems]=useState<T[]>([]),[loading,setLoading]=useState(true),[moreLoading,setMoreLoading]=useState(false),[error,setError]=useState(''),[nextCursor,setNextCursor]=useState<string|null>(null),[total,setTotal]=useState(0),[extra,setExtra]=useState<Record<string,unknown>>({});const generation=useRef(0),abort=useRef<AbortController|null>(null);
 const read=useCallback(async(cursor?:string)=>{const gen=++generation.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;setError('');if(cursor)setMoreLoading(true);else setLoading(true);
  try{const endpoint=url+(url.includes('?')?'&':'?')+(cursor?'cursor='+encodeURIComponent(cursor):'limit=20'),response=await fetch(endpoint,{cache:'no-store',signal:controller.signal}),result=await response.json() as Record<string,unknown>;if(!response.ok)throw new Error(String(result.error||'تعذر تحميل البيانات.'));if(generation.current!==gen)return;const incoming=result[field] as T[];setItems(previous=>cursor?[...previous,...incoming.filter(item=>!previous.some(p=>p.id===item.id))]:incoming);setNextCursor(result.nextCursor as string|null);setTotal(Number(result.total??incoming.length));setExtra(result)}catch(e){if(generation.current===gen&&(e as Error).name!=='AbortError')setError((e as Error).message)}finally{if(generation.current===gen){setLoading(false);setMoreLoading(false)}}
 },[url,field]);
 useEffect(()=>{setItems([]);setNextCursor(null);void read();return()=>{generation.current++;abort.current?.abort()}},[read]);
 return {items,loading,moreLoading,error,nextCursor,total,extra,reload:()=>read(),loadMore:()=>nextCursor?read(nextCursor):Promise.resolve()};
}
