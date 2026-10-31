import {useCallback,useEffect,useRef,useState} from 'react';
import {quantDocumentApi} from '../api/quantDocument';
import type {DocumentOperation,QuantDocument} from '../types/api/quantDocument';
import {quantError} from '../utils/quant';
export function useQuantDocument(collection:string,entry:string,marker:string,refresh?:()=>Promise<unknown>) {
    const [loaded,setLoaded]=useState<{key:string;value:QuantDocument}|null>(null);
    const key=`${collection}:${entry}`;
    const document=loaded?.key===key?loaded.value:null;
    const [error,setError]=useState('');
    const [busy,setBusy]=useState(false);
    const sequence=useRef(0);
    const [attempt,setAttempt]=useState(0);
    const retry=useCallback(()=>setAttempt(value=>value+1),[]);
    useEffect(()=>{
        const abort=new AbortController(),number=++sequence.current;
        void quantDocumentApi.get(collection,entry,{},abort.signal).then(value=>{if(number===sequence.current){setLoaded({key,value});setError('');}})
            .catch(cause=>{if(!abort.signal.aborted)setError(quantError(cause));});
        return()=>abort.abort();
    },[collection,entry,key,marker,attempt]);
    const change=useCallback(async(operation:Omit<DocumentOperation,'expectedRevision'>)=>{
        if(!document)return;
        setBusy(true);setError('');++sequence.current;
        try {setLoaded({key,value:await quantDocumentApi.change(collection,entry,{...operation,expectedRevision:document.revision})});await refresh?.();}
        catch(cause){setError(quantError(cause));throw cause;}
        finally{setBusy(false);}
    },[collection,entry,key,document,refresh]);
    return {document,error,busy,change,retry};
}
export type QuantDocumentController=ReturnType<typeof useQuantDocument>;
