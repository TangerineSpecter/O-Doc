import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {quantApi} from '../api/quant';
import {quantReadingApi as api} from '../api/quantReading';
import type {QuantWorkspace} from '../types/api/quantReading';
import {QuantReadingCache} from '../utils/quantReadingCache';
import {quantError} from '../utils/quant';

const merge = <T extends {id:string}>(old:T[],fresh:T[])=>{const rows=new Map(old.map(row=>[row.id,row]));for(const row of fresh)rows.set(row.id,{...rows.get(row.id),...row});return [...rows.values()];};
export function useQuantWorkspace(collection:string,entryId:string,preferredReportId='') {
    const [detail,setDetail]=useState<QuantWorkspace|null>(null);
    const [loading,setLoading]=useState(!!entryId),[error,setError]=useState('');
    const [pages,setPages]=useState<Record<string,{total:number;hasMore:boolean;offset:number}>>({});
    const cache=useRef(new QuantReadingCache());
    const lifetime=useRef(new AbortController());
    const current=useRef(detail);
    useLayoutEffect(()=>{current.current=detail;},[detail]);
    const offsets=useRef<Record<string,number>>({});
    const selected=useRef('');
    const reportVersions=useRef(new Map<string,string>());
    const marker=useRef('');
    const [pending,setPending]=useState(0);
    const apply=useCallback((change:(entry:QuantWorkspace)=>QuantWorkspace, signal:AbortSignal)=>{
        if(!signal.aborted)setDetail(old=>!signal.aborted&&old?.id===entryId?change(old):old);
    },[entryId]);
    const cached=useCallback(async<T,>(key:string,load:(signal:AbortSignal)=>Promise<T>,signal:AbortSignal)=>{
        const found=cache.current.get<T>(key);if(found!==undefined)return found;
        const value=await load(signal);if(!signal.aborted)cache.current.put(key,value);return value;
    },[]);
    const ensureRun=useCallback(async(id:string,signal=lifetime.current.signal)=>{
        const run=await api.run(collection,entryId,id,signal);
        apply(old=>({...old,runs:merge(old.runs,[run])}),signal);return run;
    },[collection,entryId,apply]);
    const ensureSource=useCallback(async(id:string,signal=lifetime.current.signal)=>{
        const value=await cached(`${collection}:${entryId}:source:${id}`,s=>api.source(collection,entryId,id,s),signal);
        apply(old=>({...old,sources:merge(old.sources,[value]).slice(-2)}),signal);return value;
    },[collection,entryId,cached,apply]);
    const readReport=useCallback(async(id:string,signal=lifetime.current.signal)=>{
        const header=current.current?.reportHeaders.find(row=>row.id===id);
        const key=`${collection}:${entryId}:report:${id}:${reportVersions.current.get(id)||`${header?.currentRevisionId||''}:${header?.contentHash||''}`}`;
        const report=await cached(key,s=>api.report(collection,entryId,id,s),signal);
        if(signal.aborted)return report;
        const version=`${report.currentRevisionId}:${report.contentHash}`;
        reportVersions.current.set(id,version);
        const actualKey=`${collection}:${entryId}:report:${id}:${version}`;
        if(key!==actualKey){cache.current.delete(key);cache.current.put(actualKey,report);}
        return report;
    },[collection,entryId,cached]);
    const ensureReport=useCallback(async(id:string,signal=lifetime.current.signal)=>{
        const report=await readReport(id,signal);
        if(signal.aborted)return report;
        const source=await api.sourceHeader(collection,entryId,report.sourceId,signal);
        apply(old=>({...old,reports:[report],sourceHeaders:merge(old.sourceHeaders,[source]),reportHeaders:merge(old.reportHeaders,[{
            id:report.id,sourceId:report.sourceId,runId:report.runId,schemaVersion:report.schemaVersion,
            currentRevisionId:report.currentRevisionId,contentHash:report.contentHash,createdAt:report.createdAt,
            title:report.data.title||'',totalScore:report.data.totalScore??null}])}),signal);
        await ensureRun(report.runId,signal);
        // Analysis needs source metadata, not its code. Full source content is
        // fetched explicitly by the code/settings/feedback entry points.
        return report;
    },[collection,entryId,readReport,apply,ensureRun]);
    const ensureRunBody=useCallback(async(id:string,signal=lifetime.current.signal)=>{
        const header=current.current?.runs.find(row=>row.id===id);
        const body=await cached(`${collection}:${entryId}:run:${id}:${header?.updatedAt||''}:${header?.status||''}`,s=>quantApi.poll(collection,entryId,id,s),signal);
        apply(old=>({...old,runBodies:[body]}),signal);return body;
    },[collection,entryId,apply,cached]);
    const readOriginal=useCallback((id:string,signal:AbortSignal)=>cached(`${collection}:${entryId}:original:${id}`,s=>api.original(collection,entryId,id,s),signal),[collection,entryId,cached]);
    const readRevision=useCallback((id:string,revision:string,signal:AbortSignal)=>cached(`${collection}:${entryId}:revision:${id}:${revision}`,s=>api.revision(collection,entryId,id,revision,s),signal),[collection,entryId,cached]);
    const loadPage=useCallback(async(resource:'reports'|'sources'|'runs'|'implementations'|'backtests'|'attachments'|'feedbackSources',append=false,signal=lifetime.current.signal)=>{
        const start=append?(offsets.current[resource]||0):0;
        const owner=lifetime.current;
        setPending(n=>n+1);
        try {
            const page=await api[resource](collection,entryId,start,signal);
            if(signal.aborted)return;
            // Resolve this page's associations by ID without fetching code bodies
            // or depending on which implementation directory pages were opened.
            const linkedVersions=resource==='backtests'
                ? await Promise.all([...new Set((page.items as Awaited<ReturnType<typeof api.backtests>>['items']).flatMap(row=>row.versionId?[row.versionId]:[]))]
                    .map(id=>api.versionHeader(collection,entryId,id,signal))) : [];
            if(signal.aborted)return;
            const linkedImplementations=await Promise.all([...new Set(linkedVersions.map(row=>row.implementationId))]
                .map(id=>api.implementationHeader(collection,entryId,id,signal)));
            if(signal.aborted)return;
            if(resource==='reports')for(const row of page.items as Awaited<ReturnType<typeof api.reports>>['items'])reportVersions.current.set(row.id,`${row.currentRevisionId}:${row.contentHash}`);
            offsets.current[resource]=start+page.items.length;
            setPages(old=>({...old,[resource]:{total:page.total,hasMore:page.hasMore,offset:offsets.current[resource]}}));
            // Each branch preserves the resource's own static contract.
            apply(old=>{
                if(resource==='reports'){const items=page.items as Awaited<ReturnType<typeof api.reports>>['items'];return {...old,reportHeaders:append?merge(old.reportHeaders,items):merge(items,old.reportHeaders.filter(row=>row.id===selected.current&&!items.some(item=>item.id===row.id)))};}
                if(resource==='sources'||resource==='feedbackSources'){const items=page.items as Awaited<ReturnType<typeof api.sources>>['items'];return {...old,sourceHeaders:append||resource==='feedbackSources'?merge(old.sourceHeaders,items):items};}
                if(resource==='runs'){const items=page.items as Awaited<ReturnType<typeof api.runs>>['items'];return {...old,runHeaders:append?merge(old.runHeaders,items):items,runs:merge(old.runs,items)};}
                if(resource==='implementations'){
                    const items=page.items as Awaited<ReturnType<typeof api.implementations>>['items'];
                    // Directory refreshes must retain owners resolved for backtests
                    // even when they are outside the refreshed directory page.
                    const linked=old.implementationHeaders.filter(impl=>old.backtests.some(test=>
                        (old.versionHeaders[impl.id]||[]).some(version=>version.id===test.versionId)));
                    return {...old,implementationHeaders:merge(append?old.implementationHeaders:linked,items)};
                }
                if(resource==='backtests'){
                    const items=page.items as Awaited<ReturnType<typeof api.backtests>>['items'];
                    const versionHeaders={...old.versionHeaders};
                    for(const version of linkedVersions)versionHeaders[version.implementationId]=merge(versionHeaders[version.implementationId]||[],[version]);
                    return {...old,backtests:append?merge(old.backtests,items):items,
                        implementationHeaders:merge(old.implementationHeaders,linkedImplementations),versionHeaders};
                }
                const items=page.items as Awaited<ReturnType<typeof api.attachments>>['items'];return {...old,attachments:append?merge(old.attachments,items):items};
            },signal);
            return page;
        }finally{if(owner===lifetime.current)setPending(n=>Math.max(0,n-1));}
    },[collection,entryId,apply]);
    const ensureImplementation=useCallback(async(id:string,signal=lifetime.current.signal)=>{
        const impl=await api.implementation(collection,entryId,id,signal);
        const version=impl.currentVersionId?await cached(`${collection}:${entryId}:version:${impl.currentVersionId}`,s=>api.version(collection,entryId,impl.currentVersionId,s),signal):null;
        const history=await api.versions(collection,entryId,id,0,signal);
        if(signal.aborted)return;
        apply(old=>{
            const previous=old.implementations.find(row=>row.id===id);
            const retained=previous?.versions.find(row=>row.id!==previous.currentVersionId)||previous?.versions[0];
            return {...old,implementationHeaders:merge(old.implementationHeaders,[impl]),implementations:[{...impl,versions:version?[version,...(retained&&retained.id!==version.id?[retained]:[])]:[]}],
                versionHeaders:{...old.versionHeaders,[id]:history.items}};
        },signal);
        offsets.current[`versions:${id}`]=history.items.length;
        if(!signal.aborted)setPages(old=>({...old,[`versions:${id}`]:{total:history.total,hasMore:history.hasMore,offset:history.items.length}}));
    },[collection,entryId,apply,cached]);
    const ensureVersion=useCallback(async(impl:string,id:string,signal=lifetime.current.signal)=>{
        const version=await cached(`${collection}:${entryId}:version:${id}`,s=>api.version(collection,entryId,id,s),signal);
        apply(old=>({...old,implementations:old.implementations.map(row=>row.id===impl?{...row,versions:merge(row.versions.filter(v=>v.id===row.currentVersionId),[version])}:row)}),signal);
    },[collection,entryId,apply,cached]);
    const ensureVersionHeader=useCallback(async(id:string)=>{
        const signal=lifetime.current.signal;
        const header=await api.versionHeader(collection,entryId,id,signal);
        const impl=await api.implementationHeader(collection,entryId,header.implementationId,signal);
        apply(old=>({...old,implementationHeaders:merge(old.implementationHeaders,[impl]),versionHeaders:{...old.versionHeaders,[impl.id]:merge(old.versionHeaders[impl.id]||[],[header])}}),signal);
        return header;
    },[collection,entryId,apply]);
    const loadVersionHeaders=useCallback(async(id:string)=>{
        const signal=lifetime.current.signal,page=await api.versions(collection,entryId,id,0,signal);
        apply(old=>({...old,versionHeaders:{...old.versionHeaders,[id]:page.items}}),signal);
        offsets.current[`versions:${id}`]=page.items.length;
        if(!signal.aborted)setPages(old=>({...old,[`versions:${id}`]:{total:page.total,hasMore:page.hasMore,offset:page.items.length}}));
    },[collection,entryId,apply]);
    const moreVersions=useCallback(async(id:string)=>{
        const signal=lifetime.current.signal,key=`versions:${id}`,start=offsets.current[key]||0;
        const page=await api.versions(collection,entryId,id,start,signal);
        apply(old=>({...old,versionHeaders:{...old.versionHeaders,[id]:merge(old.versionHeaders[id]||[],page.items)}}),signal);
        offsets.current[key]=start+page.items.length;
        if(!signal.aborted)setPages(old=>({...old,[key]:{total:page.total,hasMore:page.hasMore,offset:offsets.current[key]}}));
    },[collection,entryId,apply]);
    const initialize=useCallback(async(signal:AbortSignal)=>{
        const overview=await api.overview(collection,entryId,signal);
        if(signal.aborted)return;
        setDetail({...overview,notes:null,runBodies:[],sources:[],reports:[],runs:[],implementations:[],backtests:[],attachments:[],
            reportHeaders:[],sourceHeaders:[],runHeaders:[],implementationHeaders:[],versionHeaders:{}});
        const pages=await Promise.all(['reports','sources','runs'].map(key=>loadPage(key as 'reports'|'sources'|'runs',false,signal)));
        if(preferredReportId||overview.defaultReportId)await ensureReport(preferredReportId||overview.defaultReportId!,signal);
        else if(pages[2]?.items[0])await ensureRun(pages[2].items[0].id,signal);
    },[collection,entryId,preferredReportId,loadPage,ensureReport,ensureRun]);
    const refresh=useCallback(async(force=true)=>{
        if(!entryId)return;
        const signal=lifetime.current.signal;
        setError('');
        // An overview failure leaves no workspace to refresh; retry its initial reads.
        if(current.current?.id!==entryId){
            setLoading(true);
            try{await initialize(signal);}
            finally{if(!signal.aborted)setLoading(false);}
            return;
        }
        const overview=await api.overview(collection,entryId,signal);
        apply(old=>({...old,...overview}),signal);
        await Promise.all(['reports','sources','runs'].map(key=>loadPage(key as 'reports'|'sources'|'runs',false,signal)));
        const id=selected.current||overview.defaultReportId;
        if(force)cache.current.clear();
        if(id)await ensureReport(id,signal);
        if(force)await Promise.all((['implementations','backtests','attachments','feedbackSources'] as const).filter(key=>key in offsets.current).map(key=>loadPage(key,false,signal)));
        if(force&&current.current?.implementations[0])await ensureImplementation(current.current.implementations[0].id,signal);
        if(current.current?.notes){const notes=await api.notes(collection,entryId,signal);apply(old=>({...old,notes}),signal);}
    },[collection,entryId,apply,loadPage,ensureReport,ensureImplementation,initialize]);
    useEffect(()=>{
        lifetime.current.abort();const abort=new AbortController();lifetime.current=abort;
        selected.current=preferredReportId;reportVersions.current.clear();marker.current='';offsets.current={};cache.current.clear();
        // External target changes reset only the state owned by its requests.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDetail(null);setPending(0);setPages({});setError('');setLoading(!!entryId);
        if(entryId)void initialize(abort.signal)
            .catch(cause=>{if(!abort.signal.aborted)setError(quantError(cause));})
            .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
        return()=>abort.abort();
    },[collection,entryId,preferredReportId,initialize]);
    const running=!!detail?.activeRunIds.length;
    useEffect(()=>{
        if(!entryId||!running)return;
        const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
        const poll=async()=>{
            if(!document.hidden)try{
                const state=await api.status(collection,entryId,abort.signal);
                if(abort.signal.aborted)return;
                apply(old=>({...old,activeRunIds:state.activeRuns.map(row=>row.id),runs:merge(old.runs,state.activeRuns)}),abort.signal);
                if(state.changeMarker!==marker.current){marker.current=state.changeMarker;await refresh(false);}
            }catch(cause){if(!abort.signal.aborted)setError(`AI 任务状态更新失败：${quantError(cause)}`);}
            if(!abort.signal.aborted)timer=setTimeout(()=>void poll(),1800);
        };
        timer=setTimeout(()=>void poll(),1200);return()=>{abort.abort();clearTimeout(timer);};
    },[collection,entryId,running,apply,refresh]);
    const loadTab=useCallback(async(tab:string,signal=lifetime.current.signal)=>{
        if(tab==='notes'&&!current.current?.notes){const notes=await api.notes(collection,entryId,signal);apply(old=>({...old,notes}),signal);}
        if(tab==='code'&&!('implementations' in offsets.current))await loadPage('implementations',false,signal);
        if(tab==='feedback'&&!('feedbackSources' in offsets.current))await loadPage('feedbackSources',false,signal);
        if(tab==='attachments'||tab==='backtests'){
            if(!(tab in offsets.current))await loadPage(tab,false,signal);
            if(!('implementations' in offsets.current))await loadPage('implementations',false,signal);
        }
    },[collection,entryId,apply,loadPage]);
    const selectReport=useCallback(async(id:string)=>{selected.current=id;await ensureReport(id);},[ensureReport]);
    const selectedReport=useCallback(()=>selected.current,[]);
    const pinReportId=useCallback((id:string)=>{selected.current=id;},[]);
    return {detail,detailLoading:loading,readingError:error,readingPending:pending>0,setReadingError:setError,refresh,
        pages,loadPage,loadTab,pinReportId,ensureRunBody,readOriginal,readRevision,readReport,ensureReport,selectReport,selectedReport,ensureRun,ensureSource,ensureImplementation,ensureVersion,moreVersions,ensureVersionHeader,loadVersionHeaders,
        clearReadingCache:()=>cache.current.clear()};
}
