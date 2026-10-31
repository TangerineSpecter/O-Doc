import {publishMockRepairs} from './repairs';
import {HttpResponse} from 'msw';
import type {QuantEntryDetail,QuantReport} from '../../types/api/quant';
import type {DocumentOperation,DocumentPointer,QuantDocument,ResearchSection} from '../../types/api/quantDocument';
import {quantState,quantId} from './state';
import {collectMockFactors} from './factors';

const fields:Record<ResearchSection,string[]>={reading:['title','kind','summary','principle','formula','usage'],parameters:['parameters','parameterBindingVersion','parameterInventoryJson'],factors:['extractionVersion','extractionNote','factors','factorRepair'],review:['scores','totalScore','rubricVersion','risks','sourceFacts','assumptions','unknowns','sourceFindings','sourceFindingsVersion','sourceFindingsNote','sourceFindingsScope','memoryAssessment','memoryNote','researchMemoryJson','sourceMemoryVersion','sourceChangeReviewVersion','sourceChangeFactsJson','sourceChangeAssessment'],plan:['initialPlanningVersion','initialPlanningNote','initialProposal','validationPlan']};
const keys=Object.keys(fields) as ResearchSection[];
const fail=(status:number,msg:string)=>HttpResponse.json({code:status,msg,data:null},{status});
export type MockDocument=Omit<QuantDocument,'report'|'comparison'>;
const pointer=(report:QuantReport):DocumentPointer=>({reportId:report.id,revisionId:report.currentRevisionId});
const pointers=(report:QuantReport)=>Object.fromEntries(keys.map(key=>[key,pointer(report)])) as Record<ResearchSection,DocumentPointer>;
export function initDocument(entry:QuantEntryDetail):MockDocument {
    const state=quantState();state.documents||={};
    if(state.documents[entry.id])return state.documents[entry.id];
    const reports=(entry.reports||[]).filter(row=>[2,3].includes(row.schemaVersion));
    const latest=reports[0],reading=reports.find(row=>row.currentRevisionId)||latest;
    return state.documents[entry.id]={revision:1,sections:latest?{...pointers(latest),reading:pointer(reading)}:{},pending:[],historyLimit:5,
        history:reports.slice(1,6).map(row=>({id:quantId('history'),createdAt:row.createdAt,label:'原分析记录',sections:pointers(row)}))};
}
function payload(entry:QuantEntryDetail,ref:DocumentPointer|undefined,key:ResearchSection):Record<string,unknown> {
    const report=entry.reports?.find(row=>row.id===ref?.reportId);if(!report)return {};
    const data=report.data as unknown as Record<string,unknown>;
    return {...(key==='plan'?{proposal:report.proposal||null}:{}),...Object.fromEntries(fields[key].filter(field=>field in data).map(field=>[field,data[field]])),
        ...(key==='review'?{researchMemoryJson:report.researchMemoryJson??entry.runs.find(row=>row.id===report.runId)?.researchMemoryJson??null}:{}),
        ...(key==='reading'?{markdown:report.revisions.find(row=>row.id===ref?.revisionId)?.markdown||report.originalMarkdown}:{})};
}
function differences(entry:QuantEntryDetail,document:MockDocument,target:Partial<Record<ResearchSection,DocumentPointer>>) {
    return keys.filter(key=>target[key]).map(section=>{
        const before=payload(entry,document.sections[section],section),after=payload(entry,target[section],section);
        const generated=section==='reading'&&document.sections[section]&&!document.sections[section]?.revisionId&&!target[section]?.revisionId;
        const comparable=(value:Record<string,unknown>)=>generated?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='markdown')):value;
        return {section,label:section,changed:JSON.stringify(comparable(before))!==JSON.stringify(comparable(after)),before,after};
    });
}
export function offerDocument(entry:QuantEntryDetail,report:QuantReport) {
    const doc=initDocument(entry);report.publicationMode='pending';
    if(!doc.sections.reading){doc.sections=pointers(report);report.publicationMode='adopted';}
    else if(differences(entry,doc,pointers(report)).some(row=>row.changed)){
        for(const previous of doc.pending){const old=entry.reports!.find(row=>row.id===previous.id)!;doc.history=[{id:quantId('history'),createdAt:old.createdAt,label:'未采用的分析',sections:pointers(old)},...doc.history].slice(0,5);}
        doc.pending=[{id:report.id,createdAt:report.createdAt,changedSections:[]}];
    }
    doc.revision++;
}
function present(entry:QuantEntryDetail,document:MockDocument,params:URLSearchParams):QuantDocument {
    const base=entry.reports?.find(row=>row.id===document.sections.reading?.reportId);
    let report:QuantDocument['report']=null;
    if(base){
        const {revisions,originalMarkdown:_original,...body}=base;
        const data=structuredClone(base.data) as unknown as Record<string,unknown>;
        for(const section of keys){for(const field of fields[section])delete data[field];Object.assign(data,payload(entry,document.sections[section],section));}
        const markdown=String(data.markdown||'');delete data.markdown;delete data.proposal;
        const researchMemoryJson=typeof data.researchMemoryJson==='string'?data.researchMemoryJson:null;delete data.researchMemoryJson;
        const planReport=entry.reports?.find(row=>row.id===document.sections.plan?.reportId);
        const factorReport=entry.reports?.find(row=>row.id===document.sections.factors?.reportId);
        const candidates=collectMockFactors([entry]);
        const factorNames=Object.fromEntries((factorReport?.data.factors||[]).map((factor,index)=>[String(index),candidates.find(row=>row.id===`candidate-${factorReport!.id}-${index}`)?.curation.name||factor.name]));
        report={...body,researchMemoryJson,proposal:planReport?.proposal||null,documentRevision:document.revision,data:data as unknown as QuantReport['data'],markdown,currentRevisionId:document.sections.reading!.revisionId,factorNames,revisionCount:revisions.length,contentHash:`local-document-${document.revision}`};
    }
    const pending=document.pending.map(row=>{const report=entry.reports!.find(item=>item.id===row.id)!;return {...row,changedSections:differences(entry,document,pointers(report)).filter(item=>item.changed).map(item=>item.section)};});
    const target=params.get('historyId')?document.history.find(row=>row.id===params.get('historyId'))?.sections:entry.reports?.find(row=>row.id===params.get('compareId'));
    return {...document,report,pending,...(target?{comparison:differences(entry,document,'id' in target?pointers(target as QuantReport):target as Record<ResearchSection,DocumentPointer>)}:{})};
}
export function resolveDocument(request:Request,entry:QuantEntryDetail,input:Record<string,unknown>) {
    const doc=initDocument(entry);
    if(request.method==='GET')return present(entry,doc,new URL(request.url).searchParams);
    if(request.method!=='POST')return fail(405,'不支持此操作');
    const operation=input as unknown as DocumentOperation;
    if(operation.expectedRevision!==doc.revision)return fail(409,'研究内容已更新，请刷新后操作');
    const identity=operation.identity;
    if(operation.action==='adopt'||operation.action==='restore'){
        const report=entry.reports?.find(row=>row.id===identity);
        const target=operation.action==='adopt'&&report&&doc.pending.some(row=>row.id===identity)?pointers(report):operation.action==='restore'?doc.history.find(row=>row.id===identity)?.sections:null;
        if(!target||!operation.sections?.length||operation.sections.some(key=>!keys.includes(key)))return fail(400,'请选择有效内容');
        if(operation.sections.includes('plan')){
            const planReport=entry.reports!.find(row=>row.id===target.plan.reportId)!;
            const factors=operation.sections.includes('factors')?target.factors:doc.sections.factors;
            if(planReport.proposal&&JSON.stringify(payload(entry,target.plan,'factors'))!==JSON.stringify(payload(entry,factors,'factors')))return fail(400,'此实验方案引用了不同的算法，请同时选择对应的因子算法');
        }
        const changed=differences(entry,doc,target).filter(row=>row.changed&&operation.sections!.includes(row.section));
        if(changed.length){
            doc.history=[{id:quantId('history'),createdAt:new Date().toISOString(),label:'变更前',sections:structuredClone(doc.sections) as Record<ResearchSection,DocumentPointer>},...doc.history].slice(0,5);
            for(const row of changed){doc.sections[row.section]=target[row.section];if(row.section==='factors'||row.section==='plan'){const selected=entry.reports!.find(item=>item.id===target[row.section].reportId)!;selected.publicationMode='adopted';publishMockRepairs(entry,selected);}}
        }
        if(operation.action==='adopt'&&!differences(entry,doc,target).some(row=>row.changed))doc.pending=doc.pending.filter(row=>row.id!==identity);
    }else if(operation.action==='discard')doc.pending=doc.pending.filter(row=>row.id!==identity);
    else if(operation.action==='delete_history')doc.history=doc.history.filter(row=>row.id!==identity);
    else if(operation.action==='clear_history')doc.history=[];
    else return fail(400,'未知研究操作');
    doc.revision++;entry.updatedAt=new Date().toISOString();
    return present(entry,doc,new URLSearchParams());
}
