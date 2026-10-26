import {useRef,useState} from 'react';
import {nativePythonApi} from '../../../api/quantNativePython';
import type {NativePythonRecord} from '../../../types/api/quantNativePython';
import {readNativePlan,readNativeResult,nativeStatusLabels,nativeReasonLabels,nativeVerdictLabels} from '../../../utils/quantNativePython';
import {QuantButton} from '../ui';
import {NativeAudit} from './NativeAudit';
import {quantApi} from '../../../api/quant';
import {createRequestKey} from '../../../utils/requestKey';
import {NativeReviewHistory} from './NativeReviewHistory';
function decode(record:NativePythonRecord){
    try{return {plan:readNativePlan(record.planJson||''),result:record.resultJson?readNativeResult(record.resultJson):null,error:''};}
    catch(cause){return {plan:null,result:null,error:cause instanceof Error?cause.message:'验证记录无法读取'};}
}
export function NativeResult({collection,record,reload,openSource}:{collection:string;record:NativePythonRecord;reload:()=>void;openSource:(entryId?:string,reportId?:string)=>void}) {
    const [busy,setBusy]=useState(false),[error,setError]=useState('');
    const generationKey=useRef({run:'',key:''});
    const generate=async()=>{
        const source=record.analysis;if(!source)return;
        if(generationKey.current.run!==(source.runId||'')||!generationKey.current.key)generationKey.current={run:source.runId||'',key:createRequestKey()};
        setBusy(true);setError('');
        try{await quantApi.run(collection,source.entryId,{kind:'feedback_review',sourceId:source.sourceId,requestKey:generationKey.current.key});reload();}
        catch(cause){setError(cause instanceof Error?cause.message:'完整AI解读创建失败');}finally{setBusy(false);}
    };
    const cancel=async()=>{setBusy(true);setError('');try{await nativePythonApi.cancel(collection,record.id);reload();}catch(cause){setError(cause instanceof Error?cause.message:'取消失败');}finally{setBusy(false);}};
    const cancelReview=async()=>{const source=record.analysis;if(!source?.runId)return;setBusy(true);setError('');try{await quantApi.cancel(collection,source.entryId,source.runId);reload();}catch(cause){setError(cause instanceof Error?cause.message:'取消解读失败');}finally{setBusy(false);}};
    const review=async()=>{
        const source=record.analysis;const reportId=source?.reportId||source?.previousReportId;
        if(!source||!reportId)return;
        setBusy(true);setError('');
        try{await quantApi.run(collection,source.entryId,{kind:'feedback_review',sourceId:source.sourceId,auditReportId:reportId,requestKey:createRequestKey()});reload();}
        catch(cause){setError(cause instanceof Error?cause.message:'报告复核创建失败');}finally{setBusy(false);}
    };
    const {plan,result,error:decodeError}=decode(record);
    if(!plan)return <p role="alert" className="text-xs text-red-600">{decodeError}</p>;
        const comparison=result?.comparison;
        return <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-6 text-slate-600">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-slate-800">{record.name}</h4><span>{nativeStatusLabels[record.status]||record.status}</span></div>
            {comparison?<><p className="font-medium text-slate-800">{nativeVerdictLabels[comparison.status]} · 共同有效 {comparison.counts.common_valid} 行 · 数值差异 {comparison.counts.value_mismatches} 行 · 缺失差异 {comparison.counts.missing_mismatches} 行</p><p>{comparison.start} → {comparison.end}</p><p>最大绝对误差 {comparison.max_abs_error??'无共同数值'} · 相对误差 {comparison.max_relative_error??'无共同数值'}</p></>:<p>{nativeReasonLabels[result?.reason||record.error]||result?.reason||record.error||'执行完成后保留原始输出、比较和运行环境。'}</p>}
            <p className="break-words font-mono">候选表达式实际参数：{Object.entries(plan.candidate.parameters).map(([name,value])=>`${name}=${JSON.stringify(value)}`).join('，')||'无可调参数'}</p>
            <p className="break-words">原函数显式映射 {plan.native.entrypoint} · {plan.native.arguments.map(row=>`${row.name} ← ${row.kind==='series'?row.column:row.kind==='parameter'?row.parameter:row.kind==='dataframe'?row.columns.join('/'):JSON.stringify(row.value)}`).join('；')}</p>
            <p>从偏移 {plan.dataset.offset} 起 {plan.dataset.row_count} 行 · 共同预热 {plan.policy.warmup_bars} 行 · 绝对容差 {plan.policy.absolute_tolerance} / 相对容差 {plan.policy.relative_tolerance}</p>
            {comparison?.differences.length?<div className="max-h-64 space-y-2 overflow-auto scrollbar-hide"><p className="font-medium">前 {comparison.differences.length} 条差异（左：受控表达式，右：原始函数）</p>{comparison.differences.map(row=><p key={row.index} className="break-words rounded-lg bg-slate-50 p-2">第 {row.index} 行 · {row.timestamp}<br/>{JSON.stringify(row.left)} → {JSON.stringify(row.right)} · {row.kind}</p>)}</div>:null}
            <p>仅支持当前Python函数与样本的输出观察；单位取候选声明。其他区间、平台及盈利能力仍未验证。</p>
            <details><summary className="cursor-pointer">固定源码、运行环境与指纹</summary><div className="mt-2 space-y-2 break-all"><p>Python {plan.environment.runtime.python} · pandas {plan.environment.runtime.pandas} · numpy {plan.environment.runtime.numpy} · {plan.environment.architecture}</p><p>镜像 {plan.environment.image_id}</p><p>源码 {plan.source.id} · {plan.source.hash}</p>{plan.source.files.map(row=><p key={row.path}>{row.path} · {row.sha256}</p>)}<p>行情 {plan.dataset.id} · {plan.dataset.hash}</p><p>记录 {record.id} · {record.contentHash}</p></div></details>
            {record.analysis&&<div className="space-y-3 border-t border-slate-100 pt-3"><p>AI解读：{nativeStatusLabels[record.analysis.status]||record.analysis.status}</p>{record.analysis.error&&<p className="text-orange-700">{record.analysis.error}</p>}<QuantButton onClick={()=>openSource(record.analysis?.entryId,record.analysis?.reportId||record.analysis?.previousReportId||undefined)}>{record.analysis.reportId?'打开已归档的AI报告':record.analysis.previousReportId?'打开上一次已归档报告':'打开来源研究查看解读任务'}</QuantButton>
                {!['pending','running','completed'].includes(record.analysis.status)&&<div className="space-y-2"><QuantButton disabled={busy} onClick={()=>void generate()}>重新生成完整AI解读</QuantButton><p>使用当前默认模型重新生成原稿，再审查及最多一次修订；最多3次调用、6分钟。原稿、拒绝问题和旧报告保留，不重跑原始函数。明确拒绝的稿件不能只复核同一原稿申请通过。</p></div>}
                {record.analysis.runId&&['pending','running'].includes(record.analysis.status)&&<QuantButton disabled={busy} onClick={()=>void cancelReview()}>停止本次AI解读</QuantButton>}
                {(record.analysis.reportId||record.analysis.previousReportId)&&!['pending','running'].includes(record.analysis.status)&&<div className="space-y-2"><QuantButton disabled={busy} onClick={()=>void review()}>核对并修订AI原稿</QuantButton><p>使用当前默认对话模型，最多3次调用、6分钟。读取已有AI原稿后审查及复核，人工修订另存，不覆盖旧报告，不重跑原始函数。</p></div>}
                {record.analysis.audit&&record.analysis.runId&&<NativeAudit key={record.analysis.runId} collection={collection} entryId={record.analysis.entryId} runId={record.analysis.runId} workflow={record.analysis.audit} onResumed={reload}/>}
                <NativeReviewHistory collection={collection} entry={record.analysis.entryId} items={record.analysis.history||[]} total={record.analysis.historyTotal||0} openReport={id=>openSource(record.analysis?.entryId,id)}/>
            </div>}
            {plan.analyze&&!record.analysis&&['completed','failed'].includes(record.status)&&<p>原始事实已保存，AI解读尚未归档；可重新读取记录或打开来源研究查看。</p>}
            {['pending','running'].includes(record.status)&&<QuantButton disabled={busy||record.cancelRequested} onClick={()=>void cancel()}>{record.cancelRequested?'已请求取消':'停止本次验证'}</QuantButton>}
            {error&&<p role="alert" className="text-red-600">{error}</p>}
        </article>;
}
