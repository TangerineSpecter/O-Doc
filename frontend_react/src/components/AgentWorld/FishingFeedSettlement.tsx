import {useState} from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Compass,
    Fish,
    Waves,
} from 'lucide-react';
import {FishPortrait} from '../Fishing/FishPortrait';
import type {ParsedFishingSettlement} from './fishingSettlement';
import {formatFishingReason} from './fishingSettlement';

interface FishingFeedSettlementProps {
    parsed: ParsedFishingSettlement;
    status: string;
}

export function FishingFeedSettlement({parsed, status}: FishingFeedSettlementProps) {
    const [showRaw, setShowRaw] = useState(false);

    const isPaused = parsed.isPaused || status === 'paused';
    const isRunning = status === 'running';
    const bannerReason = formatFishingReason(parsed.reason, isPaused, parsed.totalCatches);

    return (
        <section aria-label="垂钓出钓总结" className="mt-2.5 space-y-2.5">
            {/* 状态与收竿横幅 */}
            <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${
                    isPaused
                        ? 'border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-orange-50/30 to-white'
                        : isRunning
                        ? 'border-sky-200/80 bg-gradient-to-r from-sky-50/90 via-teal-50/30 to-white'
                        : 'border-teal-200/80 bg-gradient-to-r from-teal-50/90 via-sky-50/30 to-white'
                }`}
            >
                <div
                    className={`flex items-center gap-1.5 font-medium ${
                        isPaused ? 'text-amber-800' : isRunning ? 'text-sky-800' : 'text-teal-800'
                    }`}
                >
                    {isPaused ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    ) : isRunning ? (
                        <Waves className="h-3.5 w-3.5 shrink-0 text-sky-600 animate-pulse" />
                    ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                    )}
                    <span>{bannerReason}</span>
                </div>

                <span
                    className={`inline-flex shrink-0 items-center rounded-md border bg-white/95 px-2 py-0.5 font-mono text-[10px] font-bold shadow-2xs ${
                        isPaused
                            ? 'border-amber-200/70 text-amber-700'
                            : isRunning
                            ? 'border-sky-200/70 text-sky-700'
                            : 'border-teal-200/70 text-teal-700'
                    }`}
                >
                    {isPaused ? '出钓已暂停' : isRunning ? '正在垂钓中' : '出钓归来'}
                </span>
            </div>

            {/* 核心指标 2 宫格 */}
            <div className="grid grid-cols-2 gap-2">
                {/* 抛竿次数 */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2 sm:p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Compass className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                        <span>出钓抛竿</span>
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-slate-800 sm:text-lg">
                        {parsed.casts ?? 0} <span className="font-sans text-xs font-normal text-slate-500">次</span>
                    </div>
                </div>

                {/* 获得鱼获 */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2 sm:p-2.5">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Fish className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                        <span>捕获鱼获</span>
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-teal-700 sm:text-lg">
                        {parsed.totalCatches} <span className="font-sans text-xs font-normal text-slate-500">条</span>
                        {parsed.catches.length > 1 && (
                            <span className="ml-1.5 font-sans text-xs font-normal text-slate-400">
                                ({parsed.catches.length} 种)
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* 鱼获收获清单 */}
            {parsed.catches.length > 0 ? (
                <div className="rounded-xl border border-teal-100/80 bg-teal-50/30 p-2.5">
                    <div className="mb-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                            <Fish className="h-3.5 w-3.5 text-teal-600" />
                            <span>鱼获收获清单</span>
                            <span className="rounded-full bg-teal-100/80 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-teal-700">
                                {parsed.catches.length} 种
                            </span>
                        </div>
                        <div className="text-[11px] font-medium text-slate-400">
                            共 <span className="font-bold text-teal-700 font-mono">{parsed.totalCatches}</span> 条
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {parsed.catches.map(item => (
                            <div
                                key={item.name}
                                className="flex max-w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-1.5 pl-2 shadow-2xs transition-all hover:border-teal-200"
                            >
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-50/80 border border-teal-100/60">
                                    {item.artId ? (
                                        <FishPortrait
                                            fishId={item.artId}
                                            name={item.name}
                                            decorative
                                            className="h-5 w-5"
                                        />
                                    ) : (
                                        <Fish className="h-3.5 w-3.5 text-teal-500" />
                                    )}
                                </div>
                                <span className="min-w-0 truncate text-xs font-semibold text-slate-800" title={item.name}>
                                    {item.name}
                                </span>
                                <span className="shrink-0 rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-xs font-bold text-teal-700 border border-teal-100/60">
                                    ×{item.quantity}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-3 text-xs text-slate-400">
                    <Fish className="h-3.5 w-3.5 opacity-40" />
                    <span>本次出钓暂无鱼获，继续积累垂钓经验</span>
                </div>
            )}

            {/* 可选的原始记录折叠查看 */}
            <div className="pt-0.5">
                <button
                    type="button"
                    onClick={() => setShowRaw(!showRaw)}
                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <span>{showRaw ? '收起完整记录' : '查看完整记录'}</span>
                    {showRaw ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {showRaw && (
                    <p className="mt-1.5 rounded-lg bg-slate-50 p-2 text-xs leading-relaxed text-slate-500 break-words border border-slate-200/60">
                        {parsed.raw}
                    </p>
                )}
            </div>
        </section>
    );
}
