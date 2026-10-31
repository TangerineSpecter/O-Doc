import type {QuantReportReading} from '../../../types/api/quantReading';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronUp, Code2, Filter, Sigma, Zap } from 'lucide-react';
import type { QuantFactorRole } from '../../../types/api/quant';
import type { FactorReading } from '../../../utils/quantFactorReading';
import { QuantButton } from '../ui';
import { FactorReadingModal } from './FactorReadingModal';
import {factorName} from '../../../utils/quantFactorName';

interface RolePresentation {
    label: string;
    icon: typeof Sigma;
    theme: {
        iconBg: string;
        iconColor: string;
        iconBorder: string;
        badgeBg: string;
        badgeText: string;
        badgeBorder: string;
        accentBar: string;
    };
}

const rolePresentations: Record<QuantFactorRole, RolePresentation> = {
    factor: {
        label: '计算因子',
        icon: Sigma,
        theme: {
            iconBg: 'bg-gradient-to-br from-orange-50 to-amber-100/70',
            iconColor: 'text-amber-700',
            iconBorder: 'border-orange-200/80',
            badgeBg: 'bg-orange-50',
            badgeText: 'text-orange-700',
            badgeBorder: 'border-orange-200/80',
            accentBar: 'bg-orange-500',
        },
    },
    signal: {
        label: '信号条件',
        icon: Zap,
        theme: {
            iconBg: 'bg-gradient-to-br from-sky-50 to-blue-100/70',
            iconColor: 'text-sky-700',
            iconBorder: 'border-sky-200/80',
            badgeBg: 'bg-sky-50',
            badgeText: 'text-sky-700',
            badgeBorder: 'border-sky-200/80',
            accentBar: 'bg-sky-500',
        },
    },
    filter: {
        label: '过滤条件',
        icon: Filter,
        theme: {
            iconBg: 'bg-gradient-to-br from-emerald-50 to-teal-100/70',
            iconColor: 'text-emerald-700',
            iconBorder: 'border-emerald-200/80',
            badgeBg: 'bg-emerald-50',
            badgeText: 'text-emerald-700',
            badgeBorder: 'border-emerald-200/80',
            accentBar: 'bg-emerald-500',
        },
    },
    risk: {
        label: '风控模块',
        icon: Filter,
        theme: {
            iconBg: 'bg-gradient-to-br from-rose-50 to-red-100/70',
            iconColor: 'text-rose-700',
            iconBorder: 'border-rose-200/80',
            badgeBg: 'bg-rose-50',
            badgeText: 'text-rose-700',
            badgeBorder: 'border-rose-200/80',
            accentBar: 'bg-rose-500',
        },
    },
    execution: {
        label: '执行模块',
        icon: Zap,
        theme: {
            iconBg: 'bg-gradient-to-br from-slate-100 to-slate-200/70',
            iconColor: 'text-slate-700',
            iconBorder: 'border-slate-300/80',
            badgeBg: 'bg-slate-100',
            badgeText: 'text-slate-700',
            badgeBorder: 'border-slate-300/80',
            accentBar: 'bg-slate-500',
        },
    },
    display: {
        label: '显示模块',
        icon: Sigma,
        theme: {
            iconBg: 'bg-gradient-to-br from-violet-50 to-purple-100/70',
            iconColor: 'text-purple-700',
            iconBorder: 'border-purple-200/80',
            badgeBg: 'bg-purple-50',
            badgeText: 'text-purple-700',
            badgeBorder: 'border-purple-200/80',
            accentBar: 'bg-purple-500',
        },
    },
};

export function ExtractedFactors({ report, openFactors, notes = {} }: { report: QuantReportReading; openFactors: () => void; notes?: Record<string, FactorReading> }) {
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
        {factors.length ? <div className="mt-4 space-y-2.5">
            {shown.map((factor, index) => {
                const role = rolePresentations[factor.role] || rolePresentations.factor;
                const Icon = role.icon;
                const name = factorName(report.factorNames?.[index] || factor.name, factor.name);
                return <button
                    type="button"
                    key={`${factor.name}-${index}`}
                    onClick={() => setSelected(index)}
                    title={name.title}
                    className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50/15 hover:shadow-md hover:shadow-orange-500/5 active:translate-y-0 active:scale-[0.995]"
                >
                    {/* 左侧垂直色彩指示条 */}
                    <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${role.theme.accentBar} opacity-60 transition-opacity duration-200 group-hover:opacity-100`} />

                    {/* 图标盒 */}
                    <span className={`ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-2xs transition-transform duration-200 group-hover:scale-105 ${role.theme.iconBg} ${role.theme.iconColor} ${role.theme.iconBorder}`}>
                        <Icon size={17} />
                    </span>

                    {/* 中间信息区 */}
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-bold text-slate-900 transition-colors group-hover:text-orange-600">
                                {name.title}
                            </span>
                        </span>
                        <span className="mt-1 flex min-w-0 items-center gap-1.5">
                            <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${role.theme.badgeBg} ${role.theme.badgeText} ${role.theme.badgeBorder}`}>
                                <span className={`h-1 w-1 rounded-full ${role.theme.accentBar}`} />
                                {role.label}
                            </span>
                            {name.identifier && (
                                <span className="inline-flex min-w-0 items-center gap-1 truncate rounded border border-slate-200/70 bg-slate-50/80 px-1.5 py-0.5 font-mono text-[10.5px] text-slate-500 transition-colors group-hover:border-slate-300 group-hover:bg-white group-hover:text-slate-700">
                                    <Code2 size={10} className="shrink-0 text-slate-400 group-hover:text-slate-500" />
                                    <span className="truncate">{name.identifier}</span>
                                </span>
                            )}
                        </span>
                    </span>

                    {/* 右侧微交互进入按钮 */}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100/80 text-slate-400 transition-all duration-200 group-hover:bg-orange-500 group-hover:text-white group-hover:translate-x-0.5 group-hover:shadow-xs">
                        <ArrowRight size={13} />
                    </span>
                </button>;
            })}
        </div> : <p className="mt-3 text-sm text-slate-500">{report.data.extractionNote || '这份报告没有提取到候选。'}</p>}
        {factors.length > 5 && <button type="button" onClick={() => setExpanded(value => !value)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 transition-colors">
            {expanded ? <>收起 <ChevronUp size={13}/></> : <>查看全部 {factors.length} 个候选 <ChevronDown size={13}/></>}
        </button>}
        {selected !== null && factors[selected] && createPortal(<FactorReadingModal key={selected} factor={factors[selected]} reading={notes[factors[selected].name]} close={() => setSelected(null)}/>, document.body)}
    </section>;
}
