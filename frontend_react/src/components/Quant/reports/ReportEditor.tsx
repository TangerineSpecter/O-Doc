import {useState} from 'react';
import {Save,PenLine} from 'lucide-react';
import type {QuantReport} from '../../../types/api/quant';
import type {QuantController} from '../../../hooks/useQuant';
import type {QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {useQuantReportDraft} from '../../../hooks/useQuantReportDraft';
import {quantDate} from '../../../utils/quant';
import {QuantButton,cardClass} from '../ui';
import {ReportMarkdown} from '../ReportMarkdown';
import {SourceFindings} from '../SourceFindings';
import {ParameterConfiguration} from '../feedback/ParameterConfiguration';
import {ReportScore} from './ReportScore';
import {ReportParameterDetails} from './ReportParameterDetails';

export function ReportEditor({report,collection,entryId,controller,register,pin}:{
    report:QuantReport;collection:string;entryId:string;controller:QuantController;register:QuantRegisterDraft;pin:()=>void;
}) {
    const state=useQuantReportDraft(report,collection,entryId,controller.safe,register);
    const[view,setView]=useState<'report'|'parameters'>('report');
    const data=report.data;
    const significant=data.sourceFindings?.filter(row=>row.severity==='critical'||row.severity==='high')||[];
    return <section className={cardClass} aria-label="研究报告内容">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0"><h2 className="break-words text-lg font-semibold text-slate-900">{data.title||'历史代码解释'}</h2>
                <p className="mt-1 text-xs leading-6 text-slate-500">{quantDate(report.createdAt)} · {report.schemaVersion===5?data.nativeReview?'本机Python输出对照解读 · 固定样本':'外部反馈解读 · 用户声明尚未独立验证':report.schemaVersion===4?'本机实验解读 · 原平台与实盘未验证':'静态研究 · 实证表现未评估'}{state.revisionId?' · 已有人工修订':''}</p></div>
            <QuantButton onClick={()=>{pin();state.setEditing(!state.editing);setView('report');}}><PenLine size={14}/>{state.editing?'预览报告':'编辑与删减'}</QuantButton>
        </div>
        {data.summary&&<div className="mb-5 space-y-2"><h3 className="text-xs font-medium text-slate-500">AI 原稿摘要</h3><p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{data.summary}</p></div>}
        {!state.editing&&<div role="group" aria-label="报告阅读内容" className="mb-5 inline-flex max-w-full flex-wrap gap-1 rounded-full bg-slate-100 p-1">
            {([['report','结论与评分'],['parameters',report.schemaVersion===4?'实验参数结论':report.schemaVersion===5?'配置与参数':`参数分析（${data.parameters?.length||0}）`]] as const).map(([id,label])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>setView(id)} className={`rounded-full px-4 py-2 text-sm ${view===id?'bg-white font-medium text-orange-600 shadow-sm':'text-slate-600 hover:text-slate-800'}`}>{label}</button>)}
        </div>}
        {state.editing?<textarea aria-label="编辑研究报告" value={state.draft} onChange={e=>{pin();state.setDraft(e.target.value);}} rows={28} className="w-full resize-none rounded-xl border border-slate-200 p-4 font-mono text-sm leading-7 outline-none focus:border-orange-400 scrollbar-hide"/>
            :view==='parameters'?<div className="space-y-4">{(data.initialPlanningVersion===1||data.feedbackPlanningVersion===1)&&<a className="inline-block text-sm font-medium text-orange-600 underline underline-offset-4" href={`#quant-report-plan-${report.id}`}>查看 AI 实验方案</a>}<ReportParameterDetails report={report}/></div>:<>
                {!!significant.length&&<p role="status" className="mb-4 rounded-xl bg-red-50 p-4 text-sm leading-7 text-red-800">有 {significant.length} 项严重或高影响问题：{significant.slice(0,3).map(row=>row.title).join('；')}{significant.length>3?'等':''}。研究总分不代表通过，完整影响和依据见下方问题清单。</p>}
                <ReportScore report={report}/>
                {[2,3].includes(report.schemaVersion)&&<SourceFindings version={data.sourceFindingsVersion} findings={data.sourceFindings} note={data.sourceFindingsNote}/>}
                {data.parameterConfiguration&&<div className="mb-5"><ParameterConfiguration configuration={data.parameterConfiguration} comparison={data.parameterComparison}/></div>}
                <ReportMarkdown text={state.draft}/>
            </>}
        {state.dirty&&<div className="mt-4 flex justify-end"><QuantButton primary disabled={controller.busy} onClick={()=>void state.save()}><Save size={14}/>保存修订</QuantButton></div>}
        <details className="mt-6 border-t border-slate-100 pt-4"><summary className="cursor-pointer text-sm text-slate-500">查看 AI 原稿与历史修订</summary>
            <div className="mt-4 space-y-5"><ReportMarkdown text={report.originalMarkdown}/>{report.revisions.map(item=><details key={item.id}><summary className="cursor-pointer text-xs text-slate-500">修订 · {quantDate(item.createdAt)}</summary><ReportMarkdown text={item.markdown}/></details>)}</div>
        </details>
    </section>;
}
