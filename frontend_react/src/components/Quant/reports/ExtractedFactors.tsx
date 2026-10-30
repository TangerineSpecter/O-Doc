import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronUp, Filter, Sigma, Zap } from 'lucide-react';
import type { QuantFactorRole, QuantReport } from '../../../types/api/quant';
import { conciseFactorSummary, type FactorReading } from '../../../utils/quantFactorReading';
import { factorRoles } from '../factorPresentation';
import { QuantButton } from '../ui';
import { FactorReadingModal } from './FactorReadingModal';

const appearance: Record<QuantFactorRole, { icon: typeof Sigma; color: string }> = {
    factor: {icon: Sigma, color: 'bg-orange-50 text-orange-700'},
    signal: {icon: Zap, color: 'bg-sky-50 text-sky-700'},
    filter: {icon: Filter, color: 'bg-emerald-50 text-emerald-700'},
    risk: {icon: Filter, color: 'bg-rose-50 text-rose-700'},
    execution: {icon: Zap, color: 'bg-slate-100 text-slate-700'},
    display: {icon: Sigma, color: 'bg-slate-100 text-slate-700'},
};

export function ExtractedFactors({ report, openFactors, notes = {} }: { report: QuantReport; openFactors: () => void; notes?: Record<string, FactorReading> }) {
    const [expanded, setExpanded] = useState(false);
    const [selected, setSelected] = useState<number | null>(null);
    if (report.data.extractionVersion !== 1) return null;
    const factors = report.data.factors || [];
    const shown = expanded ? factors : factors.slice(0, 5);
    return <section id={`quant-report-factors-${report.id}`} aria-label="提取的因子与信号" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900">提取的因子与信号 <span className="font-normal text-slate-500">（{factors.length}）</span></h3>
            <QuantButton size="sm" onClick={openFactors}>因子候选库 <ArrowUpRight size={13}/></QuantButton>
        </div>
        {factors.length ? <div className="mt-4 space-y-2">
            {shown.map((factor, index) => {
                const look = appearance[factor.role] || appearance.factor;
                const Icon = look.icon;
                return <button type="button" key={`${factor.name}-${index}`} onClick={() => setSelected(index)}
                    className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-left transition hover:border-orange-200 hover:bg-orange-50/30">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${look.color}`}><Icon size={15}/></span>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2"><span className="min-w-0 break-all text-sm font-semibold text-slate-900">{factor.name}</span><ArrowRight size={14} className="shrink-0 text-slate-400 group-hover:text-orange-600"/></span>
                        <span className="mt-1 block text-xs font-medium text-slate-500">{factorRoles[factor.role] || factor.role}</span>
                        <span className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">{notes[factor.name]?.summary || conciseFactorSummary(factor.summary)}</span>
                    </span>
                </button>;
            })}
        </div> : <p className="mt-3 text-sm text-slate-500">{report.data.extractionNote || '这份报告没有提取到候选。'}</p>}
        {factors.length > 5 && <button type="button" onClick={() => setExpanded(value => !value)}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700">
            {expanded ? <>收起 <ChevronUp size={14}/></> : <>查看全部 {factors.length} 个候选 <ChevronDown size={14}/></>}
        </button>}
        {selected !== null && factors[selected] && createPortal(<FactorReadingModal key={selected} factor={factors[selected]} reading={notes[factors[selected].name]} close={() => setSelected(null)}/>, document.body)}
    </section>;
}
