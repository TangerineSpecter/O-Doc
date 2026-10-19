import {Clock3, FlaskConical, Sparkles, Swords, Zap} from 'lucide-react';
import type {CombatSnapshot} from '../../types/api/combat';
import {statusLabels} from './presentation';

const clock = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function getStatusTheme(status: string) {
    switch (status) {
        case 'active':
        case 'battle':
        case 'searching':
            return {
                bg: 'bg-emerald-50',
                text: 'text-emerald-700',
                dot: 'bg-emerald-500 animate-pulse',
            };
        case 'fallen':
            return {
                bg: 'bg-rose-50',
                text: 'text-rose-700',
                dot: 'bg-rose-500',
            };
        case 'completed':
            return {
                bg: 'bg-emerald-50',
                text: 'text-emerald-700',
                dot: 'bg-emerald-500',
            };
        case 'recalled':
            return {
                bg: 'bg-sky-50',
                text: 'text-sky-700',
                dot: 'bg-sky-500',
            };
        case 'paused':
            return {
                bg: 'bg-amber-50',
                text: 'text-amber-700',
                dot: 'bg-amber-500',
            };
        case 'preparing':
            return {
                bg: 'bg-indigo-50',
                text: 'text-indigo-700',
                dot: 'bg-indigo-500',
            };
        default:
            return {
                bg: 'bg-slate-100',
                text: 'text-slate-600',
                dot: 'bg-slate-400',
            };
    }
}

export default function CombatObservationSummary({
    snapshot,
    busy,
    onCommand,
}: {
    snapshot: CombatSnapshot;
    busy?: boolean;
    onCommand?: (operation: 'recall' | 'resume') => void;
}) {
    const result = snapshot.result;
    const used = Object.values(result.potionsUsed || {}).reduce((sum, value) => sum + value, 0);
    const carried = Object.values(snapshot.potions).reduce((sum, value) => sum + value, 0);
    const elixirRows = snapshot.elixirs || [];
    const elixirLeft = elixirRows.reduce((sum, row) => sum + (row.remaining || 0), 0);
    const elixirUsed = Object.values(result.elixirsUsed || {}).reduce((sum, value) => sum + value, 0);
    const active = ['preparing', 'active', 'paused'].includes(snapshot.status);
    const statusTheme = getStatusTheme(snapshot.status);

    const stageLabel=snapshot.stage==='promotion'&&!snapshot.promotionBusy?'转职选择待重试':statusLabels[snapshot.stage]||snapshot.stage;
    const statusText = `${statusLabels[snapshot.status] || snapshot.status} · ${stageLabel}`;

    return (
        <div
            aria-label="探索摘要"
            className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px]"
        >
            {/* 状态徽标 */}
            <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTheme.bg} ${statusTheme.text}`}
            >
                <span className={`h-1.5 w-1.5 rounded-full ${statusTheme.dot}`} />
                {statusText}
            </span>

            {/* 时长胶囊：清爽天蓝极简风格 */}
            <div
                className="flex items-center gap-1.5 rounded-full bg-sky-50/90 px-2.5 py-0.5 text-sky-700"
                title="有效战斗时长 / 计划时长"
            >
                <Clock3 className="h-3 w-3 shrink-0 text-sky-500" />
                <span className="font-mono text-xs font-bold tabular-nums">
                    {clock(snapshot.elapsedSeconds)}
                </span>
                <span className="text-[10px] text-sky-400">/</span>
                <span className="font-mono text-[11px] text-sky-600/70 tabular-nums">
                    {clock(snapshot.durationSeconds)}
                </span>
            </div>

            {/* 体力指标 */}
            <div
                className="flex items-center gap-1 rounded-full bg-slate-100/70 px-2 py-0.5 text-slate-500"
                title="消耗体力"
            >
                <Zap className="h-3 w-3 shrink-0 text-amber-500" />
                <span>体力</span>
                <span className="font-mono font-bold text-slate-800 tabular-nums">
                    {result.energy ?? 0}
                </span>
            </div>

            {/* 经验指标 */}
            <div
                className="flex items-center gap-1 rounded-full bg-slate-100/70 px-2 py-0.5 text-slate-500"
                title="累计获得经验"
            >
                <Sparkles className="h-3 w-3 shrink-0 text-amber-500" />
                <span>经验</span>
                <span
                    className={`font-mono font-bold tabular-nums ${
                        (result.experience ?? 0) > 0 ? 'text-amber-700' : 'text-slate-700'
                    }`}
                >
                    +{result.experience ?? 0}
                </span>
            </div>

            {/* 击败指标 */}
            <div
                className="flex items-center gap-1 rounded-full bg-slate-100/70 px-2 py-0.5 text-slate-500"
                title="已确认击败魔物数"
            >
                <Swords className="h-3 w-3 shrink-0 text-emerald-500" />
                <span>击败</span>
                <span
                    className={`font-mono font-bold tabular-nums ${
                        (result.kills ?? 0) > 0 ? 'text-emerald-700' : 'text-slate-700'
                    }`}
                >
                    {result.kills ?? 0}
                </span>
            </div>

            {/* 药剂消耗指标 */}
            <div
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100/70 px-2 py-0.5 text-slate-500"
                title="药剂：已消耗数量与本次探索剩余数量"
            >
                <FlaskConical className="h-3 w-3 shrink-0 text-indigo-400" />
                <span>药剂</span>
                <span className="font-mono font-bold text-slate-800 tabular-nums">已消耗 {used} 瓶</span>
                <span aria-hidden="true" className="text-[10px] text-slate-400">·</span>
                <span className="font-mono text-slate-600 tabular-nums">剩余 {carried} 瓶</span>
            </div>

            {(elixirRows.length > 0 || elixirUsed > 0) && (
                <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-violet-50/80 px-2 py-0.5 text-violet-600"
                    title="炼金药水：已消耗与本次探索剩余数量">
                    <Sparkles className="h-3 w-3 shrink-0 text-violet-400" />
                    <span>炼金</span>
                    <span className="font-mono font-bold tabular-nums">已用 {elixirUsed} 瓶</span>
                    <span aria-hidden="true" className="text-[10px] text-violet-300">·</span>
                    <span className="font-mono tabular-nums">剩余 {elixirLeft} 瓶</span>
                </div>
            )}

            {/* 快捷操作按钮 */}
            {snapshot.canControl && active && onCommand && (
                <div className="ml-auto flex items-center gap-1.5 pl-2">
                    {snapshot.status === 'paused' && !['promotion','promotion_failed'].includes(snapshot.stage) && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => onCommand('resume')}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-40"
                        >
                            继续探索
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => onCommand('recall')}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-2xs transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 active:scale-95 disabled:opacity-40"
                    >
                        提前召回
                    </button>
                </div>
            )}
        </div>
    );
}
