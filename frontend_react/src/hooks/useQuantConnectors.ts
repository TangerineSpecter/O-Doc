import {useCallback,useEffect,useState} from 'react';
import {quantStudyApi} from '../api/quantStudy';
import type {QuantConnector, QuantConnectorInput,QuantConnectorPreview,QuantExternalResponse} from '../types/api/quantStudy';
export function useQuantConnectors(collection:string){
    const[items,setItems]=useState<QuantConnector[]>([]),[responses,setResponses]=useState<QuantExternalResponse[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<QuantConnectorPreview|null>(null),[revision,setRevision]=useState(0);
    const reload=useCallback(()=>setRevision(n=>n+1),[]);
    useEffect(()=>{const abort=new AbortController();Promise.all([quantStudyApi.connectors(collection,abort.signal),quantStudyApi.responses(collection,abort.signal)]).then(([list,proofs])=>{if(!abort.signal.aborted){setItems(list.items);setResponses(proofs.items);setError('');setLoading(false);}}).catch(cause=>{if(!abort.signal.aborted){setError(cause instanceof Error?cause.message:'连接配置读取失败');setLoading(false);}});return()=>abort.abort();},[collection,revision]);
    const act=async<T,>(action:()=>Promise<T>)=>{setBusy(true);setError('');try{return await action();}catch(cause){setError(cause instanceof Error?cause.message:'连接器操作失败');return null;}finally{setBusy(false);}};
    return{items,responses,loading,busy,error,preview,reload,
        save:async(id:string|undefined,data:QuantConnectorInput)=>{const row=await act(()=>quantStudyApi.saveConnector(collection,id,data));if(row)reload();return row;},
        testMapping:async(configJson:string,responseJson:string,contextJson:string)=>{const row=await act(()=>quantStudyApi.preview(collection,{configJson,responseJson,contextJson}));setPreview(row);return row;},
        execute:async(id:string,contextJson:string)=>{const row=await act(()=>quantStudyApi.execute(collection,id,contextJson));if(row){setResponses(old=>[row,...old]);reload();}return row;}};
}
