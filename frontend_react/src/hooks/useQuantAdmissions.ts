import {useCallback,useEffect,useRef,useState} from 'react';
import {quantAdmissions} from '../api/quantAdmissions';
import type {AdmissionPage} from '../types/api/quantAdmission';
export function useQuantAdmissions(collection:string,candidate:string,enabled:boolean) {
    const [offset,setOffset]=useState(0),[epoch,setEpoch]=useState(0);
    const [result,setResult]=useState<{key:string;data?:AdmissionPage;error:string}>({key:'',error:''});
    const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
    const indexController=useRef<AbortController|null>(null);
    const key=JSON.stringify([collection,candidate,offset,epoch]);
    const reload=useCallback(()=>setEpoch(x=>x+1),[]);
    useEffect(()=>()=>indexController.current?.abort(),[collection,candidate]);
    useEffect(()=>{
        if(!enabled)return;
        const controller=new AbortController();
        void quantAdmissions.read(collection,candidate,offset,controller.signal).then(data=>{if(!controller.signal.aborted)setResult({key,data,error:''});})
            .catch((cause:unknown)=>{if(!controller.signal.aborted)setResult({key,error:cause instanceof Error?cause.message:'研究分层读取失败'});});
        return()=>controller.abort();
    },[key,collection,candidate,offset,enabled]);
    const stop=useCallback(()=>{indexController.current?.abort();setBusy(false);setNotice('已停止归集，保存的记录保留');reload();},[reload]);
    const index=useCallback(async()=>{
        indexController.current?.abort();const controller=new AbortController();indexController.current=controller;setBusy(true);setNotice('正在归集已有证据，不启动新的研究…');
        try{
            let start=0;
            do{
                const value=await quantAdmissions.index(collection,candidate,start,controller.signal);if(controller.signal.aborted)return;
                setNotice(`已归集 ${value.nextOffset} / ${value.total} 条证据`);
                if(!value.hasMore)break;
                if(value.nextOffset<=start)throw new Error('分层归集未推进，请重试');
                start=value.nextOffset;
            }while(!controller.signal.aborted);
            if(!controller.signal.aborted){setBusy(false);reload();}
        }catch(cause){if(!controller.signal.aborted){setBusy(false);setNotice(cause instanceof Error?cause.message:'归集失败，请重试');}}
    },[collection,candidate,reload]);
    return {data:result.key===key?result.data:undefined,error:result.key===key?result.error:'',loading:result.key!==key,offset,setOffset,reload,index,stop,busy,notice};
}
