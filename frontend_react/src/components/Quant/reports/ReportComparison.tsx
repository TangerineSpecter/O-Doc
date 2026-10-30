import {useState} from 'react';
import type {QuantAIRun, QuantReport} from '../../../types/api/quant';
import {comparisonReports, compareReportRecords, defaultReportBaseline, isStaticReport} from '../../../utils/quantReportDiff';
import {quantDate} from '../../../utils/quant';
import {Select} from '../../common/Select';
import {cardClass} from '../ui';
import {ReportRecordDiff} from './ReportRecordDiff';
import {ReportTextDiff} from './ReportTextDiff';

function ComparisonBody({baseline, report, runs}: {baseline: QuantReport; report: QuantReport; runs: QuantAIRun[]}) {
    const [mode, setMode] = useState<'original' | 'saved'>('original');
    const diff = compareReportRecords(baseline, report);
    const baselineModel = runs.find(run => run.id === baseline.runId)?.modelName || '未提供';
    const currentModel = runs.find(run => run.id === report.runId)?.modelName || '未提供';
    return <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
        <div className="grid gap-3 text-xs leading-6 text-slate-500 sm:grid-cols-2"><div><h4 className="font-semibold text-slate-700">基准报告</h4><p>{baseline.data.title || '历史报告'} · {quantDate(baseline.createdAt)}</p><p className="break-words">模型：{baselineModel}</p><p className="break-all">来源快照：{baseline.sourceId}</p></div><div><h4 className="font-semibold text-slate-700">当前所选报告</h4><p>{report.data.title || '历史报告'} · {quantDate(report.createdAt)}</p><p className="break-words">模型：{currentModel}</p><p className="break-all">来源快照：{report.sourceId}</p></div></div>
        <p className="rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">{diff.sameSource ? '两份报告使用同一个来源快照，判断变化仍需核对模型和依据。' : '两份报告使用不同来源快照，差异可能来自材料变化。'} 本页按原始记录对照，不调用模型，不自动改变评分、候选或证据等级。</p>
        <ReportRecordDiff diff={diff}/>
        <div className="border-t border-slate-100 pt-5">
            <div role="group" aria-label="正文对照口径" className="mb-3 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{([{value: 'original', label: 'AI 原稿正文'}, {value: 'saved', label: '已保存的修订正文'}] as const).map(option => <button key={option.value} type="button" aria-pressed={mode === option.value} onClick={() => setMode(option.value)}
                className={`rounded-lg px-3 py-2 text-xs font-medium ${mode === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{option.label}</button>)}</div>
            <p className="mb-3 text-xs leading-6 text-slate-500">{mode === 'original' ? '逐行比较不可变 AI 原稿，人工编辑不混入这份对照。' : '逐行比较两份报告目前已保存的正文；没有人工修订的一侧仍显示原稿。尚未保存的编辑不在此对照中。'} 上方评分、参数、候选和问题清单始终来自 AI 原稿。</p>
            {mode === 'saved' && <p className="mb-3 text-xs text-slate-500">基准：{baseline.currentRevisionId ? '已有人工修订' : '尚无人工修订'}；所选：{report.currentRevisionId ? '已有人工修订' : '尚无人工修订'}。</p>}
            <ReportTextDiff before={mode === 'original' ? baseline.originalMarkdown : baseline.markdown} after={mode === 'original' ? report.originalMarkdown : report.markdown}/>
        </div>
    </div>;
}

export function ReportComparison({reports, report, runs = [], inModal = false}: {reports: QuantReport[]; report: QuantReport; runs?: QuantAIRun[]; inModal?: boolean}) {
    const [open, setOpen] = useState(false);
    const [baselineId, setBaselineId] = useState(() => defaultReportBaseline(reports, report)?.id || '');
    const options = comparisonReports(reports, report);
    const baseline = options.find(row => row.id === baselineId) || defaultReportBaseline(reports, report);
    if (!isStaticReport(report) || !baseline) return null;
    return <details className={cardClass} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">报告对照 · 查看判断、参数和正文变化</summary>
        {open && <><p className="mt-3 text-xs leading-6 text-slate-500">默认选择相邻的可用报告，可更换基准；对照方向为基准 → 所选报告。评分规则、未知项与人工修订分别处理，文本变化不证明研究更可靠。</p>
            <label className="mt-4 block space-y-2 text-sm text-slate-600"><span className="block">对照基准报告</span><Select menuPortal={inModal} value={baseline.id} onChange={setBaselineId} options={options.map(row => ({value: row.id, label: `${row.data.title || '历史报告'} · ${quantDate(row.createdAt)} · ${row.id.slice(-6)}`}))}/></label>
            <ComparisonBody key={baseline.id} baseline={baseline} report={report} runs={runs}/>
        </>}
    </details>;
}
