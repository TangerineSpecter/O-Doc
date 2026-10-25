import type {QuantExecutionAssessment} from '../../../../types/api/quantPlatformEvidence';
import {readComputedExecution, executionStatuses} from '../../../../utils/quantPlatformEvidence';
import {ExecutionParameters} from './ExecutionParameters';

const kinds = {supports: '有限支持', counters: '反驳或差异', limitation: '限制与待核对'};
export function ExecutionAssessment({json, assessment}: {json?: string; assessment?: QuantExecutionAssessment}) {
    if (!json && !assessment) return null;
    let value; try {value = json ? readComputedExecution(json) : undefined;} catch (cause) {return <p role="alert" className="rounded-xl bg-orange-50 p-4 text-sm text-orange-800">{cause instanceof Error ? cause.message : 'AI 固定核算依据无法读取'}</p>;}
    const summary = value?.execution_summary;
    return <section className="space-y-4" aria-label="AI 采用执行证据的分析">
        <div><h3 className="text-sm font-semibold text-slate-900">AI 如何采用执行证据</h3><p className="mt-2 text-xs leading-6 text-slate-500">{summary ? `固定核算状态：${executionStatuses[summary.status]}。` : '缺少固定核算摘要。'}以下是模型的解释与研究假设；确定性金额和差异保留在执行证据中。</p></div>
        {assessment && <div className="space-y-3 text-sm leading-7 text-slate-700"><p className="whitespace-pre-wrap break-words">{assessment.summary}</p>{assessment.findings.map((finding, index) => <div key={index} className="rounded-xl border border-slate-200 p-4"><p className="mb-2 text-xs font-semibold text-slate-500">{kinds[finding.kind]}</p><p className="whitespace-pre-wrap break-words">{finding.claim}</p><div className="mt-2 space-y-1">{finding.refs.map(ref => <p key={ref} className={`break-all font-mono text-[11px] ${summary?.refs.includes(ref) ? 'text-slate-400' : 'text-orange-700'}`}>{ref}{summary && !summary.refs.includes(ref) ? ' · 未在固定核算依据中找到' : ''}</p>)}</div></div>)}{assessment.unknowns.length > 0 && <div className="rounded-xl bg-slate-50 p-4 text-xs leading-7"><h4 className="font-semibold">尚未解决的问题</h4>{assessment.unknowns.map((text, index) => <p key={index} className="whitespace-pre-wrap break-words">{text}</p>)}</div>}</div>}
        {value && <><ExecutionParameters parameters={value.execution_summary.parameters} comparison={value.execution_parameter_comparison}/><details className="text-xs text-slate-500"><summary className="cursor-pointer">交给模型的固定核算摘要与引用范围</summary><p className="mt-2 leading-6">模型仅看到有界摘要，完整账目与原文仍保存在反馈中。参数全量保留，记录样例与差异省略数在摘要中明确显示。</p><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 leading-6 scrollbar-hide">{JSON.stringify(value, null, 2)}</pre></details></>}
    </section>;
}
