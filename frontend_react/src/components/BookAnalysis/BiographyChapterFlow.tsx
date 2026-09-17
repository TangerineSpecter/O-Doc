import {useState} from 'react';
import {ArrowRight, BookOpen, ChevronDown, ChevronUp} from 'lucide-react';
import type {BiographyFlowStep, SourceEvidence} from '../../types/bookAnalysis';
import {visibleFlowIndexes} from '../../utils/biographyFlow';

interface Props {steps: BiographyFlowStep[]; legacySummary?: string; onRead: (source: SourceEvidence) => void}

const styles: Record<BiographyFlowStep['kind'], {label: string; marker: string; card: string}> = {
    background: {label: '外部背景', marker: 'bg-slate-500', card: 'border-slate-200 bg-slate-50/70'},
    experience: {label: '亲身经历', marker: 'bg-orange-500', card: 'border-orange-200 bg-orange-50/50'},
    impact: {label: '产生影响', marker: 'bg-lime-600', card: 'border-lime-200 bg-lime-50/60'},
    decision: {label: '作出选择', marker: 'bg-orange-600', card: 'border-orange-300 bg-orange-50/70'},
};

export default function BiographyChapterFlow({steps, legacySummary, onRead}: Props) {
    const [showAll, setShowAll] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const visible = visibleFlowIndexes(steps.length, showAll);
    const selected = selectedIndex === null ? null : steps[selectedIndex];

    return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="本章脉络">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[10px] font-semibold tracking-[.18em] text-orange-600">CHAPTER THREAD</p><h3 className="mt-1 text-base font-semibold text-slate-800">本章脉络</h3></div>
            <span className="text-xs text-slate-400">按原文叙述 · 箭头不代表推定因果</span>
        </div>
        {steps.length ? <>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2" role="list">
                {visible.map((index, visibleIndex) => {
                    const step = steps[index];
                    const omitted = visibleIndex > 0 ? index - visible[visibleIndex - 1] - 1 : 0;
                    return <div key={`${step.kind}:${step.title}:${index}`} className="flex shrink-0 items-center gap-2" role="listitem">
                        {omitted > 0 ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">略 {omitted} 步</span> : visibleIndex > 0 && <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true"/>}
                        <button type="button" aria-expanded={selectedIndex === index} onClick={() => setSelectedIndex(selectedIndex === index ? null : index)}
                            className={`w-44 rounded-xl border px-3 py-3 text-left transition-colors hover:border-orange-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${styles[step.kind].card} ${selectedIndex === index ? 'ring-2 ring-orange-300' : ''}`}>
                            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><span className={`h-1.5 w-1.5 rounded-full ${styles[step.kind].marker}`}/>{styles[step.kind].label}<span className="ml-auto font-mono text-slate-400">{String(index + 1).padStart(2, '0')}</span></span>
                            <span className="mt-2 block line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-800">{step.title}</span>
                        </button>
                    </div>;
                })}
            </div>
            {steps.length > 6 && <button type="button" onClick={() => {setShowAll(value => !value); setSelectedIndex(null);}} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline">{showAll ? '收起后续步骤' : `展开全部 ${steps.length} 步`}{showAll ? <ChevronUp className="h-3.5 w-3.5"/> : <ChevronDown className="h-3.5 w-3.5"/>}</button>}
            {selected && <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold text-orange-700">{styles[selected.kind].label}</span><span className="text-sm font-semibold text-slate-800">{selected.title}</span></div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{selected.detail}</p>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                    <button type="button" onClick={() => onRead(selected.evidence)} className="inline-flex items-center gap-1 text-xs text-orange-700 hover:underline"><BookOpen className="h-3.5 w-3.5"/>核对这一步的原文</button>
                    {selected.impactEvidence && <button type="button" onClick={() => onRead(selected.impactEvidence!)} className="inline-flex items-center gap-1 text-xs text-lime-700 hover:underline"><BookOpen className="h-3.5 w-3.5"/>核对与传主的影响关系</button>}
                </div>
            </div>}
        </> : <div className="mt-3 text-xs leading-5 text-slate-500">{legacySummary ? '此版本只有文字摘要；重新分析后会提取有原文依据的流程卡片。' : '本章暂无可核对的脉络步骤。'}
            {legacySummary && <details className="mt-2"><summary className="cursor-pointer text-orange-700">查看旧版文字摘要</summary><p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-slate-600">{legacySummary}</p></details>}
        </div>}
    </section>;
}
