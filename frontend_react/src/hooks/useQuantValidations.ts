import {useCallback,useEffect,useState} from 'react';
import {quantValidations} from '../api/quantValidations';
import type {QuantValidation,QuantValidationSummary} from '../types/api/quantValidation';
export function useQuantValidations(collection: string,source: string) {
    const [offset,changeOffset]=useState(0),[selected,setSelected]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
    const [state,setState]=useState<{key: string;items: QuantValidationSummary[];total: number;detail?: QuantValidation;error: string}>({key:'',items:[],total:0,error:''});
    const key=JSON.stringify([collection,source,offset,selected,revision]);
    const reload=useCallback(()=>setRevision(v=>v+1),[]);
    useEffect(()=>{
        const abort=new AbortController();let timer: ReturnType<typeof setTimeout>|undefined;
        const read=async()=>{
            if (document.hidden) {timer=setTimeout(()=>void read(),2000);return;}
            try {
                const response=await quantValidations.list(collection,source,offset,abort.signal);
                const id=selected || response.items[0]?.id;
                const detail=id?await quantValidations.detail(collection,id,abort.signal):undefined;
                if (abort.signal.aborted) return;
                setState({key,...response,detail,error:''});
                if (response.items.some(row=>row.evaluation && ['pending','running'].includes(row.evaluation.status)) || detail?.evaluation?.reviews?.some(row=>['pending','running'].includes(row.run.status))) timer=setTimeout(()=>void read(),2000);
            } catch(cause) {if (!abort.signal.aborted) setState({key,items:[],total:0,error:cause instanceof Error?cause.message:'固定验证加载失败'});}
        };
        void read();return()=>{abort.abort();clearTimeout(timer);};
    },[collection,source,offset,selected,key]);
    const act=async(action: ()=>Promise<QuantValidation>)=>{
        if (busy) return;
        setBusy(true);setActionError('');
        try {const value=await action();setSelected(value.id);reload();}
        catch(cause) {setActionError(cause instanceof Error?cause.message:'固定验证操作失败');}
        finally {setBusy(false);}
    };
    const loading=state.key!==key;
    return {loading,items:loading?[]:state.items,total:loading?0:state.total,detail:loading?undefined:state.detail,error:loading?'':state.error,
        actionError,busy,selected,setSelected,offset,setOffset:(v: number)=>{changeOffset(v);setSelected('');},reload,act};
}
