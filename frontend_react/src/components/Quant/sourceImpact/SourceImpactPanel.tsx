import {useState} from 'react';
import {GitCompareArrows, Sparkles} from 'lucide-react';
import type {QuantEntryDetail, QuantReport, QuantSource} from '../../../types/api/quant';
import type {QuantSourceImpactPreview} from '../../../types/api/quantSourceImpact';
import {useQuantSourceImpact} from '../../../hooks/useQuantSourceImpact';
import {readSourceImpact, staticSourceReports} from '../../../utils/quantSourceImpact';
import {quantDate} from '../../../utils/quant';
import {Select} from '../../common/Select';
import {cardClass, QuantButton} from '../ui';
import {SourceImpactDiff} from './SourceImpactDiff';
import {SourceImpactDependencies} from './SourceImpactDependencies';

const relationships = {same_source: '同一来源快照', same_material: '同一材料的不同快照', different_material: '不同材料，由你明确选作对照'};
const statuses = {identical: '未发现来源字段变化', changed: '观察到来源变化', limited: '部分线索受限'};

function ImpactResult({value}: {value: QuantSourceImpactPreview}) {
    const {baseline, target, impact} = value;
    return <div className="space-y-4">
        {value.local_demo && <p role="status" className="rounded-xl bg-orange-50 p-4 text-sm leading-7 text-orange-800">本地人工样例：未执行真实结构解析或 AI 分析。以下结构与影响标签仅用于验证界面。</p>}
        <div className="rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600"><h4 className="font-semibold text-slate-800">{statuses[impact.status]} · {relationships[value.relationship]}</h4><p className="mt-2">{impact.changed_fields.length ? `变化字段：${impact.changed_fields.join('、')}` : '两份来源字段相同。'}{impact.source_context_changed ? ' 来源分析上下文发生变化。' : ''}</p><p className="mt-2 text-xs">这是原文与语法的只读预览；原引文仍在或未观测到线索，都不能视为未受影响或允许复用旧阶段。</p></div>
        <details className="rounded-xl border border-slate-200 p-4 text-xs text-slate-500"><summary className="cursor-pointer font-medium">本次对照的快照、材料与报告出处</summary>
            <div className="mt-3 grid gap-4 break-all leading-6 sm:grid-cols-2"><div><h4 className="mb-2 font-semibold text-slate-700">基准报告使用的来源</h4><p>报告：{baseline.report_id}<br/>报告指纹：{baseline.report_hash}<br/>来源：{baseline.source_id}<br/>来源指纹：{baseline.source_hash}<br/>材料：{baseline.material_id}<br/>语言：{baseline.language}<br/>快照时间：{quantDate(baseline.created_at)}</p></div><div><h4 className="mb-2 font-semibold text-slate-700">所选目标来源</h4><p>来源：{target.source_id}<br/>来源指纹：{target.source_hash}<br/>材料：{target.material_id}<br/>语言：{target.language}<br/>快照时间：{quantDate(target.created_at)}</p></div></div>
        </details>
        <SourceImpactDiff code={impact.code} oldLanguage={baseline.language} newLanguage={target.language}/>
        <SourceImpactDependencies impact={impact}/>
        <div className="rounded-xl bg-slate-50 p-4 text-xs leading-7 text-slate-600">{impact.recommendation.reasons.map((text, index) => <p key={index}>{text}</p>)}{impact.limitations.map((text, index) => <p key={`limit-${index}`}>{text}</p>)}</div>
        <details className="text-xs text-slate-500"><summary className="cursor-pointer">查看本次只读预览原始数据</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 leading-6 scrollbar-hide">{JSON.stringify(value, null, 2)}</pre></details>
    </div>;
}

export function SourceImpactPanel({entry, collection, source, currentReport, analyze, incremental, analyzeDisabledReason}: {
    entry: QuantEntryDetail; collection: string; source?: QuantSource; currentReport?: QuantReport;
    analyze: () => void; incremental: (baselineRunId: string) => void; analyzeDisabledReason: string;
}) {
    const reports = staticSourceReports(entry);
    const [baselineSelection, setBaselineSelection] = useState('');
    const baseline = reports.find(report => report.id === baselineSelection) || (!baselineSelection ? reports.find(report => report.id === currentReport?.id) : undefined);
    const state = useQuantSourceImpact(collection, entry.id, source?.id || '', baseline?.id || '');
    let value: QuantSourceImpactPreview | undefined, decodingError = '';
    if (state.json && source && baseline) try {value = readSourceImpact(state.json, {sourceId: source.id, reportId: baseline.id, baselineSourceId: baseline.sourceId});} catch (cause) {decodingError = cause instanceof Error ? cause.message : '源码影响预览无法读取';}
    const error = state.error || decodingError;
    const baselineRun = entry.runs.find(row => row.id === baseline?.runId && row.kind === 'analyze' && row.status === 'completed' && [1, 2, 3].includes(row.workflow?.version || 0));
    const canIncremental = value?.relationship === 'same_material' && !!baselineRun;
    return <section className={`${cardClass} space-y-4`} aria-label="源码变更影响预览">
        <div><h3 className="font-semibold text-slate-900">源码变更影响</h3><p className="mt-2 text-sm leading-7 text-slate-500">用上方所选来源，与一份明确的历史静态报告核对原文、参数引文和候选依赖。预览不调用模型，也不改写历史报告。</p></div>
        {!source ? <p className="text-sm leading-7 text-slate-500">保存来源快照后可开始对照。</p> : !reports.length ? <p className="text-sm leading-7 text-slate-500">尚无可作基准的静态报告。先生成第一份研究报告，后续保存新快照即可比较。</p> : <>
            <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 space-y-2 text-sm text-slate-600"><span className="block">基准静态报告</span><Select value={baseline?.id || ''} onChange={setBaselineSelection} placeholder="选择同一研究条目的静态报告" options={reports.map(report => ({value: report.id, label: `${report.schemaVersion === 1 ? '历史代码解释 · ' : ''}${report.data.title || '静态报告'} · ${quantDate(report.createdAt)}`}))}/></label><QuantButton disabled={!baseline || state.loading} onClick={state.preview}><GitCompareArrows size={15}/>{state.loading ? '读取预览中…' : state.started ? '重新预览' : '预览源码变更影响'}</QuantButton></div>
            <p className="break-words text-xs leading-6 text-slate-500">目标来源：{source.payload.title || source.payload.language || source.id} · {quantDate(source.createdAt)}。更换目标或基准后需要重新预览。</p>
            {baseline?.schemaVersion === 1 && <p className="text-xs leading-6 text-slate-500">基准是历史代码解释；未提供的结构化参数、候选将保持为空。</p>}
            {state.loading && <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">正在读取所选两份快照的差异与保守依赖线索…</p>}
            {error && <div role="alert" className="rounded-xl bg-orange-50 p-4 text-sm leading-7 text-orange-800"><p>{error}</p><p className="mt-1 text-xs">可以重新预览；原报告和来源快照仍保留。</p></div>}
            {value && <ImpactResult value={value}/>}
            {canIncremental && <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4 text-sm leading-7 text-slate-600">
                <h4 className="font-semibold text-slate-900">用 AI 继续研究这个新版本</h4>
                <p className="mt-2">逐字片段、声明配置、模型配置和分析要求一致时，可沿用局部 AI 解读；变化片段重新解读。整份源码的参数、全局依赖、评分和实验方案仍重新核对。</p>
                <p className="mt-2 text-xs">本次最多 7 次模型调用、14 分钟，沿用基准任务的分析要求。片段解读最多 48 段、4 万字符，范围以进度与阶段依据为准。{baselineRun.workflow?.version !== 3 ? ' 此基准尚无片段解读，本次先建立解读，后续新版本才可复用。' : ''}</p>
                <div className="mt-3"><QuantButton primary disabled={!!analyzeDisabledReason} onClick={() => incremental(baselineRun.id)}><Sparkles size={15}/>用此基准开展增量研究</QuantButton></div>
            </div>}
            {value && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="min-w-0 flex-1 text-xs leading-6 text-slate-500">{analyzeDisabledReason || '使用上方选择的模型，从资料归一化开始生成独立新报告，并重新核对全部原文依据。'}</p><QuantButton primary disabled={!!analyzeDisabledReason} onClick={analyze}><Sparkles size={15}/>完整分析所选来源</QuantButton></div>}
        </>}
    </section>;
}
