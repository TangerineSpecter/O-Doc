import {useCallback,useEffect,useRef,useState} from 'react';
import {getAnthologyDetail} from '../api/anthology';
import {quantApi} from '../api/quant';
import type {QuantModels} from '../types/api/quant';
import {quantError} from '../utils/quant';
import {useQuantDirectory} from './useQuantDirectory';
import {useQuantWorkspace} from './useQuantWorkspace';

export function useQuant(collection:string,entryId:string,reportId='') {
    const directory=useQuantDirectory(collection);
    const workspace=useQuantWorkspace(collection,entryId,reportId);
    const [title,setTitle]=useState(''),[models,setModels]=useState<QuantModels>({models:[],defaultModelId:''});
    // Reading and review may come from different adopted reports. Never copy
    // a historical reading header's score over the current directory score.
    const overviewId=workspace.detail?.id;
    const score=workspace.detail?.researchScore;
    const patchEntry=directory.patchEntry;
    useEffect(()=>{
        if(entryId===overviewId&&score!==undefined)patchEntry({id:entryId,researchScore:score});
    },[entryId,overviewId,score,patchEntry]);
    const [error,setError]=useState(''),[busy,setBusy]=useState(false);
    const busyRef=useRef(false);
    useEffect(()=>{
        const abort=new AbortController();
        void Promise.all([quantApi.models(abort.signal),getAnthologyDetail(collection)]).then(([options,anthology])=>{
            if(!abort.signal.aborted){setModels(options);setTitle(anthology.title);}
        }).catch(cause=>{if(!abort.signal.aborted)setError(quantError(cause));});return()=>abort.abort();
    },[collection]);
    const refreshWorkspace=workspace.refresh,refreshDirectory=directory.refresh;
    const refresh=useCallback(async()=>{await refreshWorkspace();},[refreshWorkspace]);
    const safe=useCallback(async(operation:()=>Promise<unknown>,reload=true):Promise<boolean>=>{
        if(busyRef.current)return false;busyRef.current=true;setBusy(true);setError('');
        try{await operation();if(reload){await refresh();await refreshDirectory();}return true;}
        catch(cause){setError(quantError(cause));return false;}
        finally{busyRef.current=false;setBusy(false);}
    },[refresh,refreshDirectory]);
    return {...workspace,title,models,entries:directory.entries,directory,loading:directory.loading,busy,
        error:error||workspace.readingError||directory.error,safe,refresh,reload:async()=>{await refresh();await refreshDirectory();},setError,
        languageFilter:directory.query.language,setLanguageFilter:(language:string)=>directory.update({language}),removeLocal:directory.removeLocal};
}
export type QuantController=ReturnType<typeof useQuant>;
