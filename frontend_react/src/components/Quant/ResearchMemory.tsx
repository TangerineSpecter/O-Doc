import {FixedResearchEvidence} from './FixedResearchEvidence';
import {readResearchMemory, researchMemoryNegativeLabel, researchMemoryReference} from '../../utils/quantResearchMemory';
import {quantDate} from '../../utils/quant';
import {QuantButton} from './ui';
import type {QuantMemoryAssessment} from '../../types/api/quantResearchMemory';
import {ResearchComparisonEvidence} from './ResearchComparisonEvidence';

export function ResearchMemory({json, note, assessments, openEntry}: {json?: string | null; note?: string; assessments?: QuantMemoryAssessment[]; openEntry?: (entryId: string) => void}) {
    if (!json) return null;
    let memory;
    try {memory = readResearchMemory(json);} catch (cause) {
        return <p role="alert" className="rounded-xl border border-orange-100 bg-white p-4 text-xs leading-6 text-orange-700">{cause instanceof Error ? cause.message : '历史研究依据无法读取'}。当前报告仍可阅读，请核对原始研究记录。</p>;
    }
    if (!memory) return null;
    return <details className="rounded-xl border border-slate-200 bg-white p-4" aria-label="跨来源历史研究记忆">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">本次分析参考了 {memory.items.length} 条历史研究</summary>
        <p className="mt-3 text-xs leading-6 text-slate-500">范围：当前文集；截至 {quantDate(memory.cutoff)}。每类最近最多扫描 {memory.scanLimit} 条，实际扫描 {memory.scanned.experiments} 个实验、{memory.scanned.feedback} 份反馈{memory.version >= 2 ? `、${memory.scanned.comparisons} 份对照` : ''}{memory.version===3?`、${memory.scanned.fixed_validations} 份固定验证`:""}；找到相关 {memory.eligible.experiments} 个实验、{memory.eligible.feedback} 份反馈{memory.version >= 2 ? `、${memory.eligible.comparisons} 份直接对照` : ''}{memory.version===3?`、${memory.eligible.fixed_validations} 份固定验证`:""}。{memory.omittedForSize > 0 ? `${memory.omittedForSize} 条因上下文大小未提供给 AI。` : ''}</p>
        <p className="mt-2 text-xs leading-6 text-slate-500">以下是发起分析时固定的历史依据，刷新不会改用后来记录。相关机制、标签与市场只用于寻找线索；历史结果和重复反馈不构成独立验证，未标记反面证据也不代表有效。</p>
        {memory.scanLimits && <p className="mt-2 text-xs leading-6 text-slate-500">历史扫描上限 {memory.scanLimits.seconds} 秒 / {memory.scanLimits.maxChars.toLocaleString()} 字符。{memory.scanLimits.budgetLimited || memory.scanLimits.sizeLimited ? '已触及扫描预算，部分历史未纳入；不能因此认为没有失败或反例。' : '实际提供的历史仍受每类数量和上下文上限约束。'}</p>}
        {note && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-orange-50/60 p-3 text-xs leading-6 text-slate-700"><strong>AI 对历史证据的判断：</strong>{note}</p>}
        {!memory.items.length && <p className="mt-3 text-sm text-slate-600">本次没有纳入相关历史研究，AI 继续基于当前资料与已提供证据分析。</p>}
        <div className="mt-3 space-y-4">{memory.items.map(item => <article key={researchMemoryReference(item)} className="min-w-0 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h5 className="break-words text-sm font-semibold text-slate-800">{item.title || '已保存的历史研究'}</h5><span className={`rounded-full px-2 py-1 text-xs ${item.hasNegativeEvidence ? 'bg-orange-50 text-orange-700' : 'bg-slate-50 text-slate-600'}`}>{researchMemoryNegativeLabel(item)}</span></div>
            <p className="mt-1 text-xs leading-6 text-slate-500">{({experiment: '本机实验', feedback: '外部反馈 · 声明尚未独立验证', comparison: '直接固定样本对照 · 非平台或全局等价', fixed_validation:'历史固定方案评价 · 已看数据'})[item.kind]} · {quantDate(item.createdAt)}</p>
            <p className="mt-2 text-xs leading-6 text-slate-600">{item.reason.sharedCandidateIds.length ? `共享 ${item.reason.sharedCandidateIds.length} 个候选；` : ''}{item.reason.sharedFamilies.length ? `机制类别：${item.reason.sharedFamilies.join('、')}；` : ''}{item.reason.sharedTags.length ? `共享标签：${item.reason.sharedTags.join('、')}；` : ''}{item.reason.sameMarket ? '标的与周期相同；' : ''}检索排序分 {item.reason.rankScore}。</p>
            <p className="mt-2 break-all font-mono text-[11px] leading-6 text-slate-500">引用：{researchMemoryReference(item)}</p>
            {assessments?.filter(row => row.evidenceRefs.includes(researchMemoryReference(item))).map((row, index) => <p key={index} className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-700"><strong>AI {({apply: '采用为研究依据', reject: '未采用', investigate: '列为待核查'})[row.action]}：</strong>{row.rationale}</p>)}
            {item.kind==='fixed_validation' && <FixedResearchEvidence evidence={item.evidence}/>}
            {item.kind === 'comparison' && <ResearchComparisonEvidence evidence={item.evidence}/>}
            <details className="mt-2"><summary className="cursor-pointer text-xs text-orange-700">核对当时提供给 AI 的证据</summary>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs leading-6 scrollbar-hide">{JSON.stringify(item.evidence, null, 2)}</pre>
                <p className="mt-2 break-all text-[11px] leading-6 text-slate-500">内容指纹：{item.contentHash || '未提供'}</p>
                {!!item.reason.sharedCandidateIds.length && <p className="break-all text-[11px] leading-6 text-slate-500">候选引用：{item.reason.sharedCandidateIds.join('、')}</p>}
            </details>
            {openEntry && <div className="mt-3"><QuantButton onClick={() => openEntry(item.entryId)}>打开原始研究</QuantButton></div>}
        </article>)}</div>
    </details>;
}
