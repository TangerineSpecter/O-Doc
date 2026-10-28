import {useCallback,useEffect,useState} from 'react';
import {nativePythonApi} from '../api/quantNativePython';
import {quantApi} from '../api/quant';
import type {NativeOptions,NativePythonRecord} from '../types/api/quantNativePython';
import type {QuantDataset} from '../types/api/quantDataset';
const message=(error:unknown)=>error instanceof Error?error.message:'Python验证记录加载失败';
export function useQuantNativePython(collection:string,candidate:string) {
    const [epoch,setEpoch]=useState(0),[data,setData]=useState<{options:NativeOptions;items:NativePythonRecord[];total:number;datasets:QuantDataset[]}|null>(null);
    const [error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState('');
    const [detail,setDetail]=useState<NativePythonRecord|null>(null),[detailError,setDetailError]=useState('');
    const reload=useCallback(()=>setEpoch(value=>value+1),[]);
    useEffect(()=>{
        const controller=new AbortController();
        const timer=setTimeout(()=>{
            setLoading(true);setError('');
            void Promise.all([nativePythonApi.options(collection,candidate,controller.signal),nativePythonApi.list(collection,candidate,controller.signal),quantApi.datasets(collection,0,controller.signal)])
                .then(([options,records,datasets])=>{if (!controller.signal.aborted){setData({options,...records,datasets:datasets.items});setLoading(false);}})
                .catch((cause:unknown)=>{if (!controller.signal.aborted){setError(message(cause));setLoading(false);}});
        },0);
        return()=>{clearTimeout(timer);controller.abort();};
    },[collection,candidate,epoch]);
    useEffect(()=>{
        if (!selected)return;
        const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let archiveRetries=0;
        const load=()=>{if (document.hidden) {timer=setTimeout(load,1500);return;}void nativePythonApi.detail(collection,selected,controller.signal).then(record=>{
            if (controller.signal.aborted)return;
            setDetail(record);setDetailError('');
            setData(previous=>previous?{...previous,items:previous.items.map(row=>row.id===record.id?record:row)}:previous);
            let awaitingArchive=false;
            try{awaitingArchive=['completed','failed'].includes(record.status)&&!record.analysis&&JSON.parse(record.planJson||'{}').analyze===true&&archiveRetries++<8;}catch{/* Invalid detail is displayed by the record reader. */}
            if (['pending','running'].includes(record.status)||awaitingArchive||record.analysis&&['pending','running'].includes(record.analysis.status))timer=setTimeout(load,1500);
        }).catch((cause:unknown)=>{if (!controller.signal.aborted)setDetailError(message(cause));});};
        timer=setTimeout(load,0);return()=>{clearTimeout(timer);controller.abort();};
    },[collection,selected,epoch]);
    const select=(id:string)=>{if(id===selected){reload();return;}setDetail(null);setDetailError('');setSelected(id);};
    return {data,error,loading,reload,selected,select,detail,detailError};
}
