import {useEffect,useState} from 'react';
import type {NativeReviewEvidence,NativeReviewStage,NativeReviewWorkflow,NativeReviewOutcome} from '../../../types/api/quantNativeReview';
import {nativeReviewApi} from '../../../api/quantNativeReview';
import {readNativeReview,nativeReviewDecisions,nativeReviewErrors,nativeReviewIssues} from '../../../utils/quantNativeReview';
import {QuantButton,QuantModal} from '../ui';
import {NativeAlignment} from './NativeAlignment';
import {useQuantNativeContinuation} from '../../../hooks/useQuantNativeContinuation';
function Evidence({value,openOriginal}:{value:NativeReviewEvidence;openOriginal:(run:string)=>void}) {
    let parsed:NativeReviewOutcome|null=null;let error='';
    try{parsed=value.outcomeJson?readNativeReview(value.outcomeJson):null;}catch(cause){error=cause instanceof Error?cause.message:'无法读取审查结果';}
    return <div className="space-y-4 text-xs leading-6 text-slate-600">
        {error?<p role="alert" className="text-red-600">{error}</p>:parsed?<>
            {parsed.reused_from&&<div className="space-y-2"><p className="break-words text-orange-700">复用已完成阶段，未新增模型调用。原始返回与用量保留在原任务 {parsed.reused_from.run_id}。</p><QuantButton onClick={()=>openOriginal(parsed!.reused_from!.run_id)}>查看原阶段记录</QuantButton></div>}
            <p className="font-medium">{parsed.output.decision?nativeReviewDecisions[parsed.output.decision]:parsed.output.origin==='report_snapshot'?'读取已有AI原稿，未新增生成调用':parsed.status==='completed'?'原始解读已保留':nativeReviewErrors[parsed.error]||parsed.error}</p>
            {parsed.output.analysis?.summary&&<p className="whitespace-pre-wrap break-words">{parsed.output.analysis.summary}</p>}
            {parsed.output.issues?.map((row,index)=><article key={index} className="space-y-2 rounded-xl border border-slate-200 p-4"><p className="break-words font-medium">{nativeReviewIssues[row.code]||row.code}</p>{row.quote_origin==='frozen_text_span'&&<p className="text-slate-500">程序按模型选中的原文区间复制</p>}<blockquote className="whitespace-pre-wrap break-words border-l-2 border-orange-200 pl-3">{row.quote}</blockquote><p className="whitespace-pre-wrap break-words">{row.explanation}</p><p className="break-words text-slate-400">原稿位置：{row.path}<br/>依据：{row.evidence_refs.join('、')}</p></article>)}
            <details><summary className="cursor-pointer">完整原始模型返回</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 scrollbar-hide">{parsed.raw.text||'此步骤未产生新的模型返回'}</pre>{parsed.raw.truncated&&<p className="text-orange-700">原始返回超限，保存了前段和全文哈希，不能作为完整成果采用。</p>}</details>
        </>:<p>此阶段尚未保存完整结果；恢复不会自动重试模型。</p>}
        <details><summary className="cursor-pointer">固定输入及记录指纹</summary><p className="mt-2 break-all">输入：{value.inputHash}<br/>结果：{value.outcomeHash||'未完成'}</p><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 scrollbar-hide">{value.inputJson}</pre></details>
    </div>;
}
function Inspector({collection,entryId,runId,stage,workflow,close,openOriginal}:{collection:string;entryId:string;runId:string;stage:NativeReviewStage;workflow:NativeReviewWorkflow;close:()=>void;openOriginal:(run:string)=>void}) {
    const [data,setData]=useState<NativeReviewEvidence|null>(null),[error,setError]=useState(''),[epoch,setEpoch]=useState(0);
    const row=workflow.stages.find(value=>value.stage===stage),outcome=row?.outcomeId;
    useEffect(()=>{
        const controller=new AbortController();
        void nativeReviewApi.evidence(collection,entryId,runId,stage,controller.signal).then(value=>{if(!controller.signal.aborted){setData(value);setError('');}}).catch((cause:unknown)=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'审查记录加载失败');});
        return()=>controller.abort();
    },[collection,entryId,runId,stage,outcome,epoch]);
    return <QuantModal title={row?.name||'AI审查记录'} wide close={close}><div className="space-y-4 p-5">{error?<div role="alert" className="text-sm text-red-600"><p>{error}</p><QuantButton onClick={()=>setEpoch(value=>value+1)}>重试读取</QuantButton></div>:data?<Evidence value={data} openOriginal={openOriginal}/>:<p role="status" className="text-sm text-slate-500">正在读取原稿、审查问题及固定输入…</p>}</div></QuantModal>;
}
export function NativeAudit({collection,entryId,runId,workflow,onResumed,allowResume=true}:{collection:string;entryId:string;runId:string;workflow:NativeReviewWorkflow;onResumed?:()=>void;allowResume?:boolean}) {
    const [selected,setSelected]=useState<{stage:NativeReviewStage;run:string}|null>(null);
    const continuation=useQuantNativeContinuation(collection,entryId,runId,workflow.sourceId||'',onResumed);
    return <section className="space-y-3 border-t border-slate-100 pt-3" aria-label="AI事实审查流程"><h5 className="text-sm font-semibold">AI事实审查</h5><p>最多{workflow.policy.maxModelCalls}次调用、{workflow.policy.maxSeconds/60}分钟；最多修订一次。模型复核不属于独立验证。</p>
        {workflow.sourceReportId&&<p>原稿来自已保存报告，不覆盖旧报告，也不重跑原始函数。</p>}
        {workflow.resumeRunId&&<p>本次从已停止任务继续，沿用固定来源、模型选择和历史上下文；已完成的修订计入一次修订上限。</p>}
        {workflow.alignmentJson&&<NativeAlignment json={workflow.alignmentJson}/>}
        {workflow.stages.some(row=>row.decision==='reject')&&<p role="status" className="text-orange-700">本次未发布新报告，原稿与审查问题已保留。</p>}
        {workflow.stages.map(row=><div key={row.stage} className="space-y-1"><QuantButton onClick={()=>setSelected({stage:row.stage,run:runId})}>{row.name} · {row.reusedFrom?'复用已保存阶段':row.status==='completed'?'已保存':row.status==='failed'?'未通过':row.status==='running'?'进行中':'已中断'}</QuantButton>{row.decision&&<p>{nativeReviewDecisions[row.decision]}</p>}{row.issueCount>0&&<p>逐字定位{row.issueCount}个问题，原稿与修订分别保留。</p>}{row.usage&&<p className="text-slate-400">{row.reusedFrom?'本次新增':'记录'}调用{row.usage.requestCount}次{row.usage.totalTokens!==null?` · ${row.usage.totalTokens} tokens`:''}</p>}{row.error&&<p className="text-orange-700">{nativeReviewErrors[row.error]||row.error}</p>}</div>)}
        {allowResume&&workflow.canResume&&workflow.sourceId&&<div className="space-y-2"><QuantButton disabled={continuation.busy||!!continuation.notice} onClick={()=>void continuation.resume()}>{continuation.busy?'正在创建续作…':'从失败阶段继续AI解读'}</QuantButton><p>复用已完成的原稿及修订，从未完成阶段继续；原稿不完整时重新生成。每次续作仍受3次调用、6分钟和一次修订限制，不重跑原始函数。</p></div>}
        {continuation.notice&&<p role="status">{continuation.notice}</p>}{continuation.error&&<p role="alert" className="text-red-600">{continuation.error}</p>}
        {!workflow.stages.length&&<p>{workflow.canResume?'此任务未保存完整阶段，可显式续作；父链中已完成的原稿与修订仍会复用。':'等待本机模型队列；不会因数据恢复自动开始。'}</p>}
        {selected&&<Inspector key={`${selected.run}:${selected.stage}`} collection={collection} entryId={entryId} runId={selected.run} stage={selected.stage} workflow={workflow} close={()=>setSelected(null)} openOriginal={run=>setSelected({run,stage:selected.stage})}/>}
    </section>;
}
