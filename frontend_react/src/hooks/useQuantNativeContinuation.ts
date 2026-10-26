import {useRef,useState} from 'react';
import {quantApi} from '../api/quant';
import {createRequestKey} from '../utils/requestKey';

export function useQuantNativeContinuation(collection:string,entry:string,run:string,source:string,changed?:()=>void) {
    const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
    const key=useRef('');
    const resume=async()=>{
        if(busy||!source)return;
        key.current||=createRequestKey();setBusy(true);setError('');
        try{
            await quantApi.run(collection,entry,{kind:'feedback_review',sourceId:source,nativeResumeRunId:run,requestKey:key.current});
            setNotice('续作已排队，原稿和已完成修订保留；只请求剩余阶段。');changed?.();
        }catch(cause){setError(cause instanceof Error?cause.message:'阶段续作创建失败，请重试');}
        finally{setBusy(false);}
    };
    return {busy,error,notice,resume};
}
