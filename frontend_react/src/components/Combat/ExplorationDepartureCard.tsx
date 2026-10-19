import type {CombatProfile} from '../../types/api/combat';
import type {useCombatActions} from '../../hooks/useCombatActions';
import {DecisionProcessInfo} from '../AgentWorld/DecisionProcessInfo';
import {Compass, Flame, History, Sparkles} from 'lucide-react';

export interface ExplorationDepartureCardProps {
    profile: CombatProfile;
    actions: ReturnType<typeof useCombatActions>;
    onOpenHistory?: () => void;
    historyCount?: number;
    onStartPreparation: () => void;
    className?: string;
}

export default function ExplorationDepartureCard({
    profile,
    actions,
    onOpenHistory,
    historyCount = 0,
    onStartPreparation,
    className = '',
}: ExplorationDepartureCardProps) {
    return (
        <section
            className={`shrink-0 rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/40 via-white to-amber-50/30 px-3.5 py-2.5 shadow-2xs ${className}`}
        >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                        <Compass className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1">
                            <h3 className="text-sm font-bold text-slate-800">探索出发</h3>
                            <DecisionProcessInfo kind="exploration" />
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                            配置迷宫目的地、探索时长与战术风格
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {onOpenHistory && (
                        <button
                            type="button"
                            onClick={onOpenHistory}
                            title="点击查看历史历练战报"
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-orange-200/80 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:bg-orange-50/70 hover:text-orange-600 active:scale-95"
                        >
                            <History className="h-3.5 w-3.5 text-orange-500" />
                            <span>探索历史</span>
                            {historyCount > 0 && (
                                <span className="rounded-full bg-orange-100 px-1.5 py-0.2 text-[10px] font-bold text-orange-700">
                                    {historyCount}
                                </span>
                            )}
                        </button>
                    )}

                    {profile.activeExplorationId ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700">
                            <Flame className="h-3.5 w-3.5" />
                            {profile.promotionOptions.length > 0 ? '等待转职' : '探索进行中'}
                        </span>
                    ) : profile.promotionOptions.length > 0 ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                            <Sparkles className="h-3.5 w-3.5" />
                            待转职
                        </span>
                    ) : (
                        <button
                            type="button"
                            disabled={actions.busy}
                            onClick={onStartPreparation}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Compass className="h-3.5 w-3.5" />
                            出发
                        </button>
                    )}
                </div>
            </div>
            {profile.restUntil && !profile.activeExplorationId && (
                <p className="mt-2 rounded-xl border border-amber-200/70 bg-amber-50/80 px-2.5 py-1.5 text-xs text-amber-800">
                    居民正在休息，仍可查看配置；休息结束前无法出发。
                </p>
            )}
        </section>
    );
}
