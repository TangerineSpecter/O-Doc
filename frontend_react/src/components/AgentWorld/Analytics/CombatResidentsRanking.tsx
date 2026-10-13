import {useState, useMemo} from 'react';
import {
    ArrowDown,
    ArrowUp,
    ChevronRight,
    Swords,
    Crown,
    Compass,
    Target,
    Clock,
    Sparkles,
    Check,
    Flame,
    Trophy,
    ShieldAlert,
} from 'lucide-react';
import type {CombatAnalyticsResident} from '../../../types/api/residentAnalytics';
import {combatDuration, sortCombatResidents} from '../../../utils/combatAnalytics';
import type {CombatRankingColumn} from '../../../utils/combatAnalytics';
import AgentAvatar from '../AgentAvatar';
import {ProfessionBadge} from '../ProfessionBadge';
import ResidentCombatCard from './ResidentCombatCard';

interface ColumnDef {
    key: CombatRankingColumn;
    label: string;
    icon: typeof Swords;
    tip: string;
}

const columns: ColumnDef[] = [
    {key: 'kills', label: '击败魔物', icon: Swords, tip: '累计成功击败的魔物总只数'},
    {key: 'bossKills', label: '首领', icon: Crown, tip: '击破的地牢领主/首领魔物数量'},
    {key: 'explorations', label: '探索次数', icon: Compass, tip: '实际出发的战斗探索总场次'},
    {key: 'successRate', label: '成功率', icon: Target, tip: '按计划完成结算的探索占比'},
    {key: 'elapsedSeconds', label: '探索时长', icon: Clock, tip: '实际在战斗与探索中推进的累计时长'},
    {key: 'experience', label: '经验', icon: Sparkles, tip: '探索战斗累计获取的角色经验 EXP'},
];

function RankBadge({rank}: {rank: number}) {
    const rankBadge =
        rank === 1
            ? 'bg-amber-100 text-amber-700 font-bold'
            : rank === 2
              ? 'bg-slate-200 text-slate-700 font-semibold'
              : rank === 3
                ? 'bg-orange-100 text-orange-800 font-semibold'
                : 'text-slate-400 font-normal';

    return (
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${rankBadge}`}>
            {rank}
        </span>
    );
}

function SuccessRateBadge({rate}: {rate: number | null}) {
    if (rate === null) {
        return <span className="font-normal text-slate-300">—</span>;
    }
    if (rate >= 100) {
        return (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200/70">
                <Check className="h-3 w-3 stroke-[2.5]" />
                100%
            </span>
        );
    }
    if (rate >= 75) {
        return (
            <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 ring-1 ring-teal-200/70">
                {rate}%
            </span>
        );
    }
    if (rate >= 50) {
        return (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/70">
                {rate}%
            </span>
        );
    }
    return (
        <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200/70">
            {rate}%
        </span>
    );
}

function BossKillsBadge({kills}: {kills: number}) {
    if (!kills) {
        return <span className="font-normal text-slate-300">—</span>;
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-50 to-yellow-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 shadow-2xs ring-1 ring-amber-300/80">
            <Crown className="h-3 w-3 fill-amber-500/20 text-amber-600" />
            {kills} 只
        </span>
    );
}

function ExperienceBadge({exp}: {exp: number}) {
    if (!exp) {
        return <span className="font-normal text-slate-300">0</span>;
    }
    return (
        <span className="inline-flex items-center gap-1 font-semibold text-indigo-600">
            <span className="text-[10px] font-medium text-indigo-400">EXP</span>
            <span>+{exp}</span>
        </span>
    );
}

function KillsBadge({kills, isCurrentSort}: {kills: number; isCurrentSort: boolean}) {
    if (!kills) {
        return <span className="font-normal text-slate-300">0</span>;
    }
    return (
        <span
            className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${
                isCurrentSort ? 'text-sm text-orange-600' : 'text-slate-800'
            }`}
        >
            {kills}
            <span className="text-[10px] font-normal text-slate-400">只</span>
        </span>
    );
}

export default function CombatResidentsRanking({
    rows,
    startDate,
    endDate,
}: {
    rows: CombatAnalyticsResident[];
    startDate: string;
    endDate: string;
}) {
    const [column, setColumn] = useState<CombatRankingColumn>('kills');
    const [descending, setDescending] = useState(true);
    const [selectedId, setSelectedId] = useState('');

    const selected = rows.find(row => row.id === selectedId);
    const ranked = sortCombatResidents(rows, column, descending);

    // 统计全局概要
    const totalKills = useMemo(() => rows.reduce((s, r) => s + (r.kills || 0), 0), [rows]);
    const totalBossKills = useMemo(() => rows.reduce((s, r) => s + (r.bossKills || 0), 0), [rows]);
    const activeExplorers = useMemo(() => rows.filter(r => r.explorations > 0).length, [rows]);
    const topKiller = useMemo(() => {
        if (!rows.length) return null;
        const sorted = [...rows].sort((a, b) => (b.kills || 0) - (a.kills || 0));
        return sorted[0]?.kills > 0 ? sorted[0] : null;
    }, [rows]);

    return (
        <>
            {/* 顶部公会战报速览条 */}
            {rows.length > 0 && (
                <div className="mb-3.5 flex flex-wrap items-center gap-2 rounded-xl border border-orange-100/90 bg-gradient-to-r from-orange-50/60 via-amber-50/40 to-slate-50/40 px-3.5 py-2.5 text-xs">
                    <span className="flex items-center gap-1 font-semibold text-orange-700">
                        <Flame className="h-3.5 w-3.5 text-orange-500" />
                        战况速览
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="flex items-center gap-1 text-slate-600">
                        累计讨伐
                        <strong className="font-bold tabular-nums text-slate-900">{totalKills}</strong>
                        只魔物
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="flex items-center gap-1 text-slate-600">
                        首领击破
                        <strong className="font-bold tabular-nums text-amber-700">{totalBossKills}</strong>
                        只
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="flex items-center gap-1 text-slate-600">
                        参战居民
                        <strong className="font-bold tabular-nums text-slate-900">{activeExplorers}</strong>
                        / {rows.length} 位
                    </span>
                    {topKiller && (
                        <div className="ml-auto hidden items-center gap-1 text-[11px] text-slate-500 sm:flex">
                            <Trophy className="h-3 w-3 text-amber-500" />
                            <span>讨伐先锋：</span>
                            <span className="font-semibold text-slate-800">{topKiller.name}</span>
                            <span className="rounded bg-orange-100/80 px-1 py-0.2 text-[10px] font-bold text-orange-700">
                                {topKiller.kills} 只
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* 排行榜表格容器 */}
            <div className="scrollbar-hide max-h-[460px] overflow-auto rounded-xl border border-slate-200/80 bg-white shadow-2xs">
                <table className="w-full min-w-[760px] text-xs">
                    <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 text-slate-500 backdrop-blur-xs">
                        <tr>
                            <th className="w-14 py-3 pl-3 pr-2 text-center font-medium">排名</th>
                            <th className="sticky left-0 z-20 min-w-40 bg-slate-50/95 px-3 py-3 text-left font-medium backdrop-blur-xs">
                                居民
                            </th>
                            <th className="min-w-24 px-3 py-3 text-left font-medium text-slate-500">
                                战斗职业
                            </th>
                            {columns.map(item => {
                                const isCurrent = column === item.key;
                                const Icon = item.icon;
                                return (
                                    <th
                                        key={item.key}
                                        aria-sort={
                                            isCurrent ? (descending ? 'descending' : 'ascending') : 'none'
                                        }
                                        className={`px-3 py-2.5 text-right font-medium transition-colors ${
                                            isCurrent ? 'bg-orange-50/30' : ''
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            title={item.tip}
                                            onClick={() => {
                                                if (isCurrent) {
                                                    setDescending(!descending);
                                                } else {
                                                    setColumn(item.key);
                                                    setDescending(true);
                                                }
                                            }}
                                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 transition-all focus-visible:ring-2 focus-visible:ring-orange-300 ${
                                                isCurrent
                                                    ? 'bg-orange-100 font-bold text-orange-800 shadow-2xs'
                                                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-800'
                                            }`}
                                        >
                                            <Icon
                                                className={`h-3 w-3 shrink-0 ${
                                                    isCurrent ? 'text-orange-600' : 'text-slate-400'
                                                }`}
                                            />
                                            <span>{item.label}</span>
                                            {isCurrent &&
                                                (descending ? (
                                                    <ArrowDown className="h-3 w-3 shrink-0 stroke-[2.5]" />
                                                ) : (
                                                    <ArrowUp className="h-3 w-3 shrink-0 stroke-[2.5]" />
                                                ))}
                                        </button>
                                    </th>
                                );
                            })}
                            <th className="w-16 py-3 pl-2 pr-3 text-right font-medium text-slate-400">
                                操作
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/90">
                        {ranked.map((row, index) => {
                            const rank = index + 1;

                            return (
                                <tr
                                    key={row.id}
                                    onClick={() => setSelectedId(row.id)}
                                    className="group cursor-pointer transition-colors hover:bg-orange-50/20"
                                >
                                    {/* 排名 */}
                                    <td className="py-3 pl-3 pr-2 text-center">
                                        <RankBadge rank={rank} />
                                    </td>

                                    {/* 居民信息 */}
                                    <td className="sticky left-0 z-10 bg-white/95 px-3 py-3 backdrop-blur-xs transition-colors group-hover:bg-white">
                                        <div className="flex items-center gap-2.5">
                                            <AgentAvatar name={row.name} avatar={row.avatar} size="xs" />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="truncate font-bold text-slate-800 transition-colors group-hover:text-orange-600">
                                                        {row.name}
                                                    </p>
                                                    {row.departed && (
                                                        <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-400">
                                                            {row.archived ? '已归档' : '历史居民'}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-0.5 text-[10px] text-slate-400">
                                                    {row.ongoing > 0 ? (
                                                        <span className="font-medium text-amber-600">
                                                            {row.ongoing} 次未结算
                                                        </span>
                                                    ) : row.explorations > 0 ? (
                                                        <span>已完成 {row.completed} 次</span>
                                                    ) : (
                                                        <span className="text-slate-300">暂无探索</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </td>

                                    {/* 战斗职业 */}
                                    <td className="whitespace-nowrap px-3 py-3 text-left">
                                        <ProfessionBadge
                                            professionName={row.jobName}
                                            size="xs"
                                            variant="indigo"
                                            showEmpty
                                            emptyText="未就职"
                                            icon={Swords}
                                        />
                                    </td>

                                    {/* 各数据指标 */}
                                    {columns.map(item => {
                                        const isCurrent = column === item.key;
                                        return (
                                            <td
                                                key={item.key}
                                                className={`whitespace-nowrap px-3 py-3 text-right tabular-nums transition-colors ${
                                                    isCurrent ? 'bg-orange-50/15' : ''
                                                }`}
                                            >
                                                {item.key === 'kills' ? (
                                                    <KillsBadge kills={row.kills} isCurrentSort={isCurrent} />
                                                ) : item.key === 'bossKills' ? (
                                                    <BossKillsBadge kills={row.bossKills} />
                                                ) : item.key === 'explorations' ? (
                                                    <span
                                                        className={`font-semibold ${
                                                            row.explorations ? 'text-slate-800' : 'text-slate-300'
                                                        }`}
                                                    >
                                                        {row.explorations || 0}
                                                    </span>
                                                ) : item.key === 'successRate' ? (
                                                    <SuccessRateBadge rate={row.successRate} />
                                                ) : item.key === 'elapsedSeconds' ? (
                                                    <span
                                                        className={`font-medium ${
                                                            row.elapsedSeconds ? 'text-slate-600' : 'text-slate-300'
                                                        }`}
                                                    >
                                                        {combatDuration(row.elapsedSeconds)}
                                                    </span>
                                                ) : item.key === 'experience' ? (
                                                    <ExperienceBadge exp={row.experience} />
                                                ) : (
                                                    row[item.key]
                                                )}
                                            </td>
                                        );
                                    })}

                                    {/* 操作引导 */}
                                    <td className="py-3 pl-2 pr-3 text-right">
                                        <button
                                            type="button"
                                            aria-label={`查看${row.name}战斗经历`}
                                            className="inline-flex items-center gap-0.5 rounded-md p-1 text-slate-400 transition-all group-hover:translate-x-0.5 group-hover:text-orange-500"
                                        >
                                            <span className="hidden text-[10px] font-medium sm:inline">
                                                详情
                                            </span>
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {!rows.length && (
                    <div className="py-12 text-center text-xs text-slate-400">
                        <ShieldAlert className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                        <p>统计区间内暂无居民战斗经历数据</p>
                    </div>
                )}
            </div>

            <p className="mt-2.5 text-[11px] leading-5 text-slate-400">
                默认按击败魔物、首领、经验依次排序。仅统计区间内实际出发的探索及其最新成果；未结算不进入成功率分母。点击整行任意位置查看完整战斗经历档案。
            </p>

            {selected && (
                <ResidentCombatCard
                    key={`${selected.id}:${startDate}:${endDate}`}
                    resident={selected}
                    startDate={startDate}
                    endDate={endDate}
                    onClose={() => setSelectedId('')}
                />
            )}
        </>
    );
}

