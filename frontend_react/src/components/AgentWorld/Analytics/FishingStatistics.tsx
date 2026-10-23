import {useMemo, useState} from 'react';
import {ArrowDown, ArrowUp, Check, Crown, Fish, Trophy} from 'lucide-react';
import type {FishingAnalyticsResident} from '../../../types/api/residentAnalytics';
import {sortFishingResidents} from '../../../utils/residentAnalytics';
import type {FishingRankingColumn} from '../../../utils/residentAnalytics';
import AgentAvatar from '../AgentAvatar';

function RankBadge({rank}: {rank: number}) {
    const badgeClass =
        rank === 1
            ? 'bg-amber-100 text-amber-700 font-bold ring-1 ring-amber-300/80'
            : rank === 2
              ? 'bg-slate-200 text-slate-700 font-semibold'
              : rank === 3
                ? 'bg-orange-100 text-orange-800 font-semibold'
                : 'text-slate-400 font-normal';

    return (
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${badgeClass}`}>
            {rank}
        </span>
    );
}

function CatchRateBadge({rate}: {rate: number | null}) {
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
            <span className="inline-flex items-center rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 ring-1 ring-cyan-200/70">
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

function FishingSortHeader({
    colKey,
    label,
    tip,
    currentCol,
    descending,
    onSort,
    className = 'px-2.5 py-2',
}: {
    colKey: FishingRankingColumn;
    label: string;
    tip: string;
    currentCol: FishingRankingColumn;
    descending: boolean;
    onSort: (col: FishingRankingColumn) => void;
    className?: string;
}) {
    const isCurrent = currentCol === colKey;
    return (
        <th className={`${className} font-medium ${isCurrent ? 'bg-cyan-50/40' : ''}`}>
            <button
                type="button"
                title={tip}
                onClick={() => onSort(colKey)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 transition-all ${
                    isCurrent
                        ? 'bg-cyan-100 font-bold text-cyan-800 shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-800'
                }`}
            >
                <span>{label}</span>
                {isCurrent &&
                    (descending ? (
                        <ArrowDown className="h-3 w-3 shrink-0 stroke-[2.5]" />
                    ) : (
                        <ArrowUp className="h-3 w-3 shrink-0 stroke-[2.5]" />
                    ))}
            </button>
        </th>
    );
}

export default function FishingStatistics({rows}: {rows: FishingAnalyticsResident[]}) {
    const [column, setColumn] = useState<FishingRankingColumn>('catches');
    const [descending, setDescending] = useState(true);

    const totals = useMemo(
        () =>
            rows.reduce(
                (sum, row) => ({
                    trips: sum.trips + row.trips,
                    casts: sum.casts + row.casts,
                    catches: sum.catches + row.catches,
                    kings: sum.kings + row.kings,
                    experience: sum.experience + row.experience,
                }),
                {trips: 0, casts: 0, catches: 0, kings: 0, experience: 0}
            ),
        [rows]
    );

    const topFisher = useMemo(() => {
        if (!rows.length) return null;
        const sorted = [...rows].sort((a, b) => b.catches - a.catches);
        return sorted[0]?.catches > 0 ? sorted[0] : null;
    }, [rows]);

    const sortedRows = sortFishingResidents(rows, column, descending);

    const metrics = [
        ['出钓', totals.trips, '次'],
        ['抛竿', totals.casts, '竿'],
        ['捕获', totals.catches, '条'],
        ['其中鱼王', totals.kings, '条'],
        ['获得经验', totals.experience, '点'],
    ];

    const handleSort = (newCol: FishingRankingColumn) => {
        if (column === newCol) {
            setDescending(!descending);
        } else {
            setColumn(newCol);
            setDescending(true);
        }
    };

    return (
        <div className="space-y-3.5">
            {/* 顶部指标卡 */}
            <dl className="grid grid-cols-3 gap-3 border-b border-slate-100 pb-3 sm:grid-cols-5">
                {metrics.map(([label, value, unit]) => (
                    <div key={label} className="min-w-0">
                        <dt className="text-[11px] text-slate-500">{label}</dt>
                        <dd className="mt-1 break-all text-lg font-semibold tabular-nums text-slate-800">
                            {value} <span className="text-[10px] font-normal text-slate-400">{unit}</span>
                        </dd>
                    </div>
                ))}
            </dl>

            {!totals.trips && !totals.casts && !totals.catches ? (
                <p className="py-4 text-center text-xs text-slate-400">所选日期内暂无钓鱼记录</p>
            ) : (
                <>
                    {/* 渔况速览条 */}
                    {rows.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-cyan-100/90 bg-gradient-to-r from-cyan-50/60 via-sky-50/40 to-slate-50/40 px-3.5 py-2.5 text-xs text-slate-600">
                            <span className="flex items-center gap-1 font-semibold text-cyan-800">
                                <Fish className="h-3.5 w-3.5 text-cyan-600" />
                                渔况速览
                            </span>
                            <span className="text-slate-300">|</span>
                            <span>
                                累计出钓 <strong className="font-bold tabular-nums text-slate-900">{totals.trips}</strong> 次
                            </span>
                            <span className="text-slate-300">·</span>
                            <span>
                                抛竿 <strong className="font-bold tabular-nums text-slate-900">{totals.casts}</strong> 竿
                            </span>
                            <span className="text-slate-300">·</span>
                            <span>
                                捕获 <strong className="font-bold tabular-nums text-cyan-700">{totals.catches}</strong> 条
                            </span>
                            {totals.kings > 0 && (
                                <>
                                    <span className="text-slate-300">·</span>
                                    <span className="flex items-center gap-1 text-amber-800">
                                        鱼王{' '}
                                        <Crown className="h-3 w-3 fill-amber-500/20 text-amber-600" />
                                        <strong className="font-bold tabular-nums">{totals.kings}</strong> 条
                                    </span>
                                </>
                            )}
                            {topFisher && (
                                <div className="ml-auto hidden items-center gap-1 text-[11px] text-slate-500 sm:flex">
                                    <Trophy className="h-3 w-3 text-amber-500" />
                                    <span>垂钓先锋：</span>
                                    <span className="font-semibold text-slate-800">{topFisher.name}</span>
                                    <span className="rounded bg-cyan-100/80 px-1.5 py-0.5 text-[10px] font-bold text-cyan-800">
                                        {topFisher.catches} 条
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 居民钓鱼排行榜表格 */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-slate-700">居民垂钓战报排行</h4>
                            <span className="text-[11px] text-slate-400">可点击表头进行排序</span>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
                            <div className="overflow-x-auto scrollbar-hide">
                                <table aria-label="居民钓鱼统计" className="w-full min-w-[700px] text-right text-xs tabular-nums">
                                    <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50 text-[11px] font-medium text-slate-500">
                                        <tr>
                                            <th className="w-12 py-2.5 pl-3 pr-2 text-center font-medium">排名</th>
                                            <th className="min-w-36 px-3 py-2.5 text-left font-medium">居民</th>

                                            <FishingSortHeader
                                                colKey="catches"
                                                label="捕获/条"
                                                tip="按累计捕获鱼类数量排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />
                                            <FishingSortHeader
                                                colKey="kings"
                                                label="鱼王/条"
                                                tip="按捕获稀有鱼王数量排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />
                                            <FishingSortHeader
                                                colKey="ordinaryCatchRate"
                                                label="普通鱼捕获率"
                                                tip="按普通鱼咬钩捕获成功率排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />
                                            <FishingSortHeader
                                                colKey="experience"
                                                label="经验/点"
                                                tip="按垂钓获得的角色经验排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />
                                            <FishingSortHeader
                                                colKey="trips"
                                                label="出钓/次"
                                                tip="按实际出发垂钓次数排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />
                                            <FishingSortHeader
                                                colKey="casts"
                                                label="抛竿/竿"
                                                tip="按累计抛竿竿数排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                                className="py-2 pl-2.5 pr-4"
                                            />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {sortedRows.map((row, index) => {
                                            const rank = index + 1;
                                            return (
                                                <tr key={row.id} className="transition-colors hover:bg-cyan-50/20">
                                                    {/* 排名 */}
                                                    <td className="py-3 pl-3 pr-2 text-center">
                                                        <RankBadge rank={rank} />
                                                    </td>

                                                    {/* 居民信息 */}
                                                    <td className="min-w-36 px-3 py-3 text-left">
                                                        <div className="flex items-center gap-2">
                                                            <AgentAvatar name={row.name} avatar={row.avatar} size="xs" />
                                                            <div className="min-w-0 flex items-center gap-1.5">
                                                                <span className="truncate font-semibold text-slate-800">
                                                                    {row.name}
                                                                </span>
                                                                {row.departed && (
                                                                    <span className="shrink-0 rounded bg-slate-100 px-1 py-0.2 text-[9px] text-slate-400">
                                                                        {row.archived ? '已归档' : '历史居民'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* 捕获 */}
                                                    <td className="px-2.5 py-3">
                                                        {row.catches > 0 ? (
                                                            <span
                                                                className={`font-bold tabular-nums ${
                                                                    column === 'catches' ? 'text-cyan-700' : 'text-slate-800'
                                                                }`}
                                                            >
                                                                {row.catches}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">0</span>
                                                        )}
                                                    </td>

                                                    {/* 鱼王 */}
                                                    <td className="px-2.5 py-3">
                                                        {row.kings > 0 ? (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-50 to-yellow-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 shadow-2xs ring-1 ring-amber-300/80">
                                                                <Crown className="h-3 w-3 fill-amber-500/20 text-amber-600" />
                                                                {row.kings} 条
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">—</span>
                                                        )}
                                                    </td>

                                                    {/* 普通鱼捕获率 */}
                                                    <td className="px-2.5 py-3">
                                                        <CatchRateBadge rate={row.ordinaryCatchRate} />
                                                    </td>

                                                    {/* 获得经验 */}
                                                    <td className="px-2.5 py-3">
                                                        {row.experience > 0 ? (
                                                            <span className="inline-flex items-center gap-1 font-semibold text-indigo-600">
                                                                <span className="text-[10px] font-medium text-indigo-400">EXP</span>
                                                                <span>+{row.experience}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">0</span>
                                                        )}
                                                    </td>

                                                    {/* 出钓次数 */}
                                                    <td className="px-2.5 py-3 font-medium text-slate-700">
                                                        {row.trips}
                                                    </td>

                                                    {/* 抛竿数 */}
                                                    <td className="py-3 pl-2.5 pr-4 font-medium text-slate-700">
                                                        {row.casts}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <p className="text-[11px] leading-relaxed text-slate-400">
                出钓按出发时间计次；抛竿、捕获和经验按事件发生时间统计，包含此前出发的出钓。鱼王计入捕获总数；售出不扣减捕获记录。
            </p>
        </div>
    );
}
