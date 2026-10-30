import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {quantReadingApi, type QuantDirectoryQuery} from '../api/quantReading';
import type {QuantDirectory, QuantEntrySummary} from '../types/api/quantReading';
import {quantError} from '../utils/quant';

export function useQuantDirectory(collection: string) {
    const [query,setQuery]=useState<QuantDirectoryQuery>({q:'',kind:'',language:'',sort:'updated'});
    const [debounced,setDebounced]=useState(query);
    const currentQuery=useRef(query);
    useLayoutEffect(()=>{currentQuery.current=query;},[query]);
    const [data,setData]=useState<QuantDirectory>({items:[],total:0,kindCounts:{},hasMore:false});
    const [loading,setLoading]=useState(true),[moreLoading,setMoreLoading]=useState(false),[error,setError]=useState('');
    const request=useRef<AbortController|null>(null);
    const offset=useRef(0);
    const lastAppend=useRef(false);
    useEffect(()=>{const timer=setTimeout(()=>setDebounced(query),300);request.current?.abort();return()=>clearTimeout(timer);},[query]);
    const load=useCallback(async(append=false)=>{
        if(currentQuery.current!==debounced)return;
        lastAppend.current=append;
        request.current?.abort();const abort=new AbortController();request.current=abort;
        if(append)setMoreLoading(true);else setLoading(true);
        setError('');
        try {
            const page=await quantReadingApi.directory(collection,debounced,append?offset.current:0,abort.signal);
            if(abort.signal.aborted||currentQuery.current!==debounced)return;
            offset.current=(append?offset.current:0)+page.items.length;
            setData(old=>({...page,items:append?[...new Map([...old.items,...page.items].map(row=>[row.id,row])).values()]:page.items}));
        }catch(cause){if(!abort.signal.aborted)setError(quantError(cause));}
        finally{if(!abort.signal.aborted){setLoading(false);setMoreLoading(false);}}
    },[collection,debounced]);
    // The effect owns a new external request and its loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(()=>{offset.current=0;setData({items:[],total:0,kindCounts:{},hasMore:false});void load();return()=>request.current?.abort();},[load]);
    const update=useCallback((value:Partial<QuantDirectoryQuery>)=>setQuery(old=>({...old,...value})),[]);
    const patchEntry=useCallback((entry:Partial<QuantEntrySummary>&{id:string})=>setData(old=>({...old,items:old.items.map(row=>row.id===entry.id?{...row,...entry}:row)})),[]);
    return {...data,entries:data.items,loading,moreLoading,error,query,update,refresh:load,loadMore:()=>load(true),retry:()=>load(lastAppend.current),
        removeLocal:(id:string)=>setData(old=>({...old,items:old.items.filter(row=>row.id!==id),total:Math.max(0,old.total-1)})),
        patchEntry};
}
