import {useState, useRef, useEffect} from 'react';
import {Compass, MapPin, Coins, ShoppingBag, Sparkles, Quote, AlertCircle, Info, User} from 'lucide-react';
import type {TravelJourney} from '../../types/api/travel';
import {travelStatus, travelPhase} from './travelConstants';

interface TravelHeaderCardProps {
    journey: TravelJourney;
}

export default function TravelHeaderCard({journey}: TravelHeaderCardProps) {
    const [showNote, setShowNote] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showNote) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setShowNote(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showNote]);

    const state = journey.snapshot;
    const isCompleted = journey.status === 'completed';
    const isActive = journey.status === 'active';
    const isPaused = journey.status === 'paused' || journey.status === 'waiting';

    const statusStyle = isCompleted
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : isActive
            ? 'bg-orange-50 text-orange-700 border-orange-200'
            : isPaused
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-slate-100 text-slate-600 border-slate-200';

    const phaseLabel = travelPhase[journey.phase] || (journey.phase.startsWith('visit-') ? '景点游览' : '旅途遭遇');

    return (
        <div className="relative overflow-hidden rounded-2xl border border-orange-100/80 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-white p-5 shadow-xs sm:p-6">
            <Compass className="pointer-events-none absolute -bottom-8 -right-8 h-40 w-40 text-orange-500/5" aria-hidden="true" />
            
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                {/* 目的地与核心状态 */}
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 text-orange-600">
                            <MapPin className="h-5 w-5 shrink-0" />
                            <h2 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                                {state.selected ? `${state.selected.country} · ${state.selected.city}` : '尚未选择目的地'}
                            </h2>
                        </div>
                        {state.selected?.region && (
                            <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs text-slate-500 border border-slate-200/60">
                                {state.selected.region}
                            </span>
                        )}

                        {/* 目的地历史警告与注记说明 i 图标 */}
                        {state.destinationNote && (
                            <div
                                className="relative inline-flex items-center"
                                ref={popoverRef}
                                onMouseEnter={() => setShowNote(true)}
                                onMouseLeave={() => setShowNote(false)}
                            >
                                <button
                                    type="button"
                                    onClick={() => setShowNote(prev => !prev)}
                                    aria-label="查看目的地历史勘误说明"
                                    className="group flex h-5 w-5 items-center justify-center rounded-full bg-amber-50 border border-amber-200/90 text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-colors shadow-2xs cursor-pointer shrink-0"
                                >
                                    <Info className="h-3.5 w-3.5 text-amber-600 group-hover:text-amber-700" />
                                </button>

                                {/* 浮动说明气泡 */}
                                {showNote && (
                                    <div className="absolute left-0 top-full mt-2 z-30 w-72 sm:w-96 rounded-xl border border-amber-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                                        <div className="flex items-start gap-2.5">
                                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 mt-0.5">
                                                <Info className="h-3 w-3" />
                                            </span>
                                            <div className="flex-1">
                                                <p className="text-[11px] font-bold text-amber-900 mb-1">
                                                    目的地历史勘误与注记
                                                </p>
                                                <p className="text-xs leading-relaxed text-slate-600 text-justify">
                                                    {state.destinationNote}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-0.5 font-medium text-slate-600 shadow-2xs">
                            <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>旅者：{state.agentName}</span>
                        </span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-medium ${statusStyle}`}>
                            {travelStatus[journey.status] || journey.status}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-orange-200/60 bg-orange-50/70 px-2.5 py-0.5 font-medium text-orange-700">
                            {phaseLabel}
                        </span>
                    </div>
                </div>

                {/* 费用与预算一体化账单卡片 */}
                {state.selected && (
                    <div className="w-full sm:w-auto sm:min-w-[210px] rounded-xl border border-slate-200/80 bg-white/95 p-3 shadow-2xs backdrop-blur-xs">
                        {/* 顶栏：标签与结算状态 */}
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                                <Coins className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                <span>旅行费用</span>
                            </div>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${
                                journey.departedAt
                                    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                    : 'border-slate-200 bg-slate-100 text-slate-500'
                            }`}>
                                {journey.departedAt ? '已结算' : '尚未扣款'}
                            </span>
                        </div>

                        {/* 主金额展示 */}
                        <div className="mt-1 flex items-baseline gap-1">
                            <span className="text-lg sm:text-xl font-bold font-mono tracking-tight text-slate-800">
                                {state.selected.price}
                            </span>
                            <span className="text-[11px] text-slate-400 font-normal">世界币</span>
                        </div>

                        {/* 购物预算细项 */}
                        {state.selection?.shoppingBudget !== undefined && (
                            <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                                <span className="flex items-center gap-1">
                                    <ShoppingBag className="h-3 w-3 text-slate-400 shrink-0" />
                                    购物预算
                                </span>
                                <span className="font-semibold text-slate-700 font-mono">
                                    {state.selection.shoppingBudget} <span className="text-[10px] font-normal text-slate-400">世界币</span>
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 出行心境与动机 & 旅人心得与感悟（整合在同一个卡片中） */}
            {(state.selection?.reason || state.draft?.reflection) && (
                <div className="mt-4 rounded-xl border border-orange-100/90 bg-white/75 p-3.5 shadow-2xs backdrop-blur-xs space-y-3">
                    {state.selection?.reason && (
                        <div className="flex items-start gap-2.5">
                            <Quote className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-[11px] font-bold text-orange-900 mb-1">出行心境与动机</p>
                                <p className="text-xs leading-relaxed text-slate-600">
                                    {state.selection.reason}
                                </p>
                            </div>
                        </div>
                    )}

                    {state.selection?.reason && state.draft?.reflection && (
                        <div className="border-t border-orange-100/70" />
                    )}

                    {state.draft?.reflection && (
                        <div className="flex items-start gap-2.5">
                            <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-[11px] font-bold text-amber-900 mb-1">旅人心得 · 感悟</p>
                                <p className="text-xs leading-relaxed text-slate-700">
                                    {state.draft.reflection}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 未出行跳过理由 */}
            {state.skipReason && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 text-xs text-slate-600">
                    <AlertCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>{state.skipReason}</span>
                </div>
            )}

        </div>
    );
}
