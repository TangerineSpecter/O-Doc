import {useMemo} from 'react';
import {compareReportText} from '../../../utils/quantReportDiff';

export function ReportTextDiff({before, after}: {before: string; after: string}) {
    const diff = useMemo(() => compareReportText(before, after), [before, after]);
    return <section className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-800">正文逐行对照</h4>
        <p className="text-xs leading-6 text-slate-500">基准 {diff.beforeLines} 行 → 所选报告 {diff.afterLines} 行。按原文逐行匹配，忽略换行格式；不判断公式等价或结论正误。</p>
        {diff.status === 'identical' ? <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">两份正文逐行内容相同。</p>
            : diff.status === 'limited' ? <p role="status" className="rounded-lg bg-orange-50 p-3 text-sm leading-6 text-orange-800">正文超过本地逐行对照上限，未计算完整差异。请分别阅读两份报告；不能据此判断没有变化。</p>
                : <><p className="text-xs text-slate-600">新增 {diff.additions} 行，删除 {diff.deletions} 行，共 {diff.totalHunks} 处。左侧行号属于基准，右侧行号属于所选报告。</p>
                    <div className="max-h-[32rem] space-y-4 overflow-y-auto scrollbar-hide">{diff.hunks.map((hunk, index) => <div key={index} className="overflow-hidden rounded-lg border border-slate-200">
                        <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">变更 {index + 1}</p>
                        {hunk.map((line, i) => <div key={i} className={`grid grid-cols-[2rem_2rem_1rem_minmax(0,1fr)] gap-1 px-2 py-1 text-xs leading-6 sm:grid-cols-[3rem_3rem_1rem_minmax(0,1fr)] ${line.kind === 'added' ? 'bg-emerald-50 text-emerald-900' : line.kind === 'removed' ? 'bg-red-50 text-red-900' : 'text-slate-600'}`}>
                            <span className="select-none text-right tabular-nums text-slate-400">{line.beforeLine ?? ''}</span><span className="select-none text-right tabular-nums text-slate-400">{line.afterLine ?? ''}</span>
                            <span aria-label={line.kind === 'added' ? '新增' : line.kind === 'removed' ? '删除' : '上下文'}>{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</span>
                            <span className="min-w-0 whitespace-pre-wrap break-words font-mono [overflow-wrap:anywhere]">{line.text || ' '}</span>
                        </div>)}
                    </div>)}</div>
                    {diff.omittedHunks > 0 && <p role="status" className="text-xs leading-6 text-orange-800">另有 {diff.omittedHunks} 处变更未展开，当前展示不覆盖全部变化。</p>}
                </>}
    </section>;
}
