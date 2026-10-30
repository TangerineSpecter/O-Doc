/** Typed local-only reading projections. Does not analyze or execute user source. */
import type {QuantEntryDetail,QuantReport,QuantSource} from '../../types/api/quant';
import type {QuantEntryOverview,QuantReportReading,QuantSourceHeader,QuantRunSummary} from '../../types/api/quantReading';
import {defaultResearchReport,researchReportScore} from '../../utils/quantReportScore';
import {HttpResponse} from 'msw';
const fail=(status:number,msg:string)=>HttpResponse.json({code:status,msg,data:null},{status});
const ordered=<T extends {createdAt:string;id:string}>(rows:T[])=>[...rows].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
export function mockOverview(entry:QuantEntryDetail):QuantEntryOverview {
    const {content,implementations,backtests,attachments,runs,reports=[],sources=[],...base}=entry;
    return {...base,hasNotes:!!content,currentSourceId:sources.find(row=>row.payload.provenance!=='external_feedback')?.id||null,defaultReportId:defaultResearchReport(reports)?.id||null,
        activeRunIds:runs.filter(row=>['pending','running'].includes(row.status)).map(row=>row.id),
        counts:{reports:reports.length,sources:sources.length,implementations:implementations.length,
            backtests:backtests.length,attachments:attachments.length,runs:runs.length,
            feedback:sources.filter(row=>row.payload.provenance==='external_feedback').length}};
}
export function mockReportBody(report:QuantReport):QuantReportReading {
    const {originalMarkdown:_original,revisions,...body}=report;
    return {...body,revisionCount:revisions.length,contentHash:`local-reading-${report.id}`};
}
export function mockRunSummary(run:QuantEntryDetail['runs'][number],detailed=true):QuantRunSummary {
    const {result:_result,researchMemoryJson:_memory,outputAssociationsJson:_associations,libraryRetrieval:_library,feedbackMemory:_feedback,requirements,...summary}=run;
    let workflow=summary.workflow;
    if(workflow){const {localReadingEvidenceJson:_evidence,...projected}=workflow;workflow=projected;}
    return {...summary,workflow,...(detailed?{requirements}:{})};
}
export function mockDirectory(entries:QuantEntryDetail[],params:URLSearchParams) {
    const query=(params.get('q')||'').trim().toLowerCase(),kind=params.get('kind')||'',language=params.get('language')||'';
    if(kind&&!['factor','indicator','strategy'].includes(kind))return fail(400,'研究类型无效');
    if(language&&!['python','pine','mql4','tongdaxin','text'].includes(language))return fail(400,'代码语言无效');
    const rows=entries.filter(row=>(!query||[row.title,row.content,...row.tags].join(' ').toLowerCase().includes(query))&&(!language||row.implementations.some(impl=>impl.language===language)||row.sources?.some(source=>source.payload.language===language)));
    const kindCounts:Record<string,number>={factor:0,indicator:0,strategy:0};for(const row of rows)kindCounts[row.kind]++;
    const filtered=rows.filter(row=>!kind||row.kind===kind).sort(params.get('sort')==='title'?(a,b)=>a.title<b.title?-1:a.title>b.title?1:a.id.localeCompare(b.id):(a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id));
    const page=mockPage(filtered,params,row=>({id:row.id,title:row.title,kind:row.kind,createdAt:row.createdAt,updatedAt:row.updatedAt,
        preview:row.content.slice(0,640).replace(/[#>*`~_-]+/g,' ').replace(/\s+/g,' ').trim().slice(0,160),researchScore:researchReportScore(row.reports)}),50);
    return page instanceof Response?page:{...page,kindCounts};
}
function mockPage<T,R=T>(rows:T[],params:URLSearchParams,project:(row:T)=>R=(row=>row as unknown as R),defaultLimit=20) {
    const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||defaultLimit);
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)return fail(400,'分页参数无效');
    return {items:rows.slice(offset,offset+limit).map(project),total:rows.length,hasMore:offset+limit<rows.length};
}
export function resolveReading(request:Request,entry:QuantEntryDetail,path:string[]) {
    const url=new URL(request.url),[section,id,child,childId]=path;
    if(request.method!=='GET')return undefined;
    if(section==='notes')return {id:entry.id,collId:entry.collId,title:entry.title,kind:entry.kind,content:entry.content,sourceUrl:entry.sourceUrl,tags:entry.tags,isValid:entry.isValid,createdAt:entry.createdAt,updatedAt:entry.updatedAt};
    if(section==='reports'){
        const reports=ordered(entry.reports||[]),report=reports.find(row=>row.id===id);
        if(!id)return mockPage(reports,url.searchParams,row=>({id:row.id,sourceId:row.sourceId,runId:row.runId,schemaVersion:row.schemaVersion,currentRevisionId:row.currentRevisionId,createdAt:row.createdAt,title:row.data.title||'',totalScore:row.data.totalScore??null,contentHash:`local-reading-${row.id}`}));
        if(!report)return fail(404,'报告不存在');
        if(child==='original')return {id:report.id,markdown:report.originalMarkdown,createdAt:report.createdAt};
        if(child==='revisions'){
            if(childId){const row=report.revisions.find(row=>row.id===childId);return row||fail(404,'修订不存在');}
            return mockPage(ordered(report.revisions),url.searchParams,row=>({id:row.id,parentId:'',createdAt:row.createdAt,contentHash:`local-reading-${row.id}`}));
        }
        return mockReportBody(report);
    }
    if(section==='sources'){
        const rows=ordered(entry.sources||[]).filter(row=>!url.searchParams.get('provenance')||row.payload.provenance===url.searchParams.get('provenance'));
        const project=(row:QuantSource):QuantSourceHeader=>({id:row.id,materialId:row.materialId,codeVersionId:row.codeVersionId,contentHash:row.contentHash,materialCurrentSourceId:row.materialCurrentSourceId,
            latestRunId:ordered(entry.runs.filter(run=>run.sourceId===row.id))[0]?.id||null,latestReportId:ordered(entry.reports?.filter(report=>report.sourceId===row.id)||[])[0]?.id||null,createdAt:row.createdAt,title:row.payload.title||'',language:row.payload.language||'',hasCode:!!row.payload.code?.trim(),provenance:row.payload.provenance||'',targetSourceId:row.payload.targetSourceId});
        if(!id)return mockPage(rows,url.searchParams,project);
        const row=rows.find(row=>row.id===id);
        return row?(url.searchParams.get('metadata')==='1'?project(row):row):fail(404,'来源不存在');
    }
    if(section==='implementations'){
        const impl=entry.implementations.find(row=>row.id===id);
        if(!id)return mockPage(entry.implementations,url.searchParams,row=>({id:row.id,entryId:row.entryId,name:row.name,language:row.language,currentVersionId:row.currentVersionId,createdAt:row.createdAt,updatedAt:row.updatedAt}));
        if(!impl)return fail(404,'实现不存在');
        if(child==='versions')return mockPage(ordered(impl.versions),url.searchParams,row=>({id:row.id,implementationId:row.implementationId,note:row.note,createdAt:row.createdAt,contentHash:`local-reading-${row.id}`}));
        if(url.searchParams.get('metadata')==='1')return mockImplementationReceipt(impl);
        const {versions:_versions,...body}=impl;return body;
    }
    if(section==='versions'){
        const row=entry.implementations.flatMap(row=>row.versions).find(row=>row.id===id);if(!row)return fail(404,'版本不存在');
        return url.searchParams.get('metadata')==='1'?{id:row.id,implementationId:row.implementationId,note:row.note,createdAt:row.createdAt,contentHash:`local-reading-${row.id}`}:row;
    }
    if(section==='runs'){
        if(!id)return mockPage(ordered(entry.runs),url.searchParams,row=>mockRunSummary(row,false));
        const run=entry.runs.find(row=>row.id===id);return run?mockRunSummary(run):fail(404,'任务不存在');
    }
    if(section==='backtests')return mockPage(ordered(entry.backtests),url.searchParams);
    if(section==='attachments')return mockPage(ordered(entry.attachments),url.searchParams);
    return fail(404,'读取入口不存在');
}
export function mockStatus(entry:QuantEntryDetail) {
    return {changeMarker:JSON.stringify([entry.updatedAt,entry.reports?.map(row=>[row.id,row.currentRevisionId]),entry.sources?.map(row=>row.id),entry.runs.map(row=>[row.id,row.status])]),
        activeRuns:entry.runs.filter(row=>['pending','running'].includes(row.status)).map(row=>mockRunSummary(row,false)),defaultReportId:defaultResearchReport(entry.reports)?.id||null};
}

export function mockImplementationReceipt(row:QuantEntryDetail['implementations'][number]) {
    const {id,entryId,name,language,currentVersionId,createdAt,updatedAt}=row;
    return {id,entryId,name,language,currentVersionId,createdAt,updatedAt};
}
