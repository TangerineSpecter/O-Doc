import {useCallback, useEffect, useState} from 'react';
import {quantStudyApi} from '../api/quantStudy';
import type {QuantStudy, QuantStudyInput} from '../types/api/quantStudy';
export function useQuantStudies(collection: string) {
    const [items,setItems]=useState<QuantStudy[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
    const reload=useCallback(()=>setRevision(n=>n+1),[]);
    useEffect(()=>{const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
        const read=async()=>{try{const data=await quantStudyApi.list(collection,abort.signal);if(abort.signal.aborted)return;setItems(data.items);setError('');setLoading(false);if(data.items.some(row=>['pending','running'].includes(row.status)))timer=setTimeout(()=>void read(),1800);}catch(cause){if(!abort.signal.aborted){setError(cause instanceof Error?cause.message:'AI研究读取失败');setLoading(false);}}};void read();return()=>{abort.abort();clearTimeout(timer);};
    },[collection,revision]);
    const act=async(action:()=>Promise<QuantStudy>)=>{setBusy(true);setError('');try{const saved=await action();setItems(old=>[saved,...old.filter(row=>row.id!==saved.id)]);reload();return saved;}catch(cause){setError(cause instanceof Error?cause.message:'研究操作失败');return null;}finally{setBusy(false);}};
    return{items,loading,error,busy,reload,start:(data:QuantStudyInput)=>act(()=>quantStudyApi.start(collection,data)),control:(id:string,action:'cancel'|'resume')=>act(()=>quantStudyApi.control(collection,id,action)),revise:(id:string,markdown:string)=>act(()=>quantStudyApi.revise(collection,id,markdown))};
}
