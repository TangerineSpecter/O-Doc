import {useState} from 'react';
import {ArrowDown, ArrowUp, Check, Crown, Sparkles, Ticket, Trophy} from 'lucide-react';
import type {ResidentAnalytics} from '../../../types/api/residentAnalytics';
import {analyticsMoney, sortLotteryResidents} from '../../../utils/residentAnalytics';
import type {LotteryRankingColumn} from '../../../utils/residentAnalytics';
import AgentAvatar from '../AgentAvatar';

const rate = (value: number | null) => (value === null ? '—' : `${value}%`);

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

function WinRateBadge({rateValue}: {rateValue: number | null}) {
    if (rateValue === null) {
        return <span className="font-normal text-slate-300">—</span>;
    }
    if (rateValue >= 100) {
        return (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200/70">
                <Check className="h-3 w-3 stroke-[2.5]" />
                100%
            </span>
        );
    }
    if (rateValue >= 75) {
        return (
            <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 ring-1 ring-teal-200/70">
                {rateValue}%
            </span>
        );
    }
    if (rateValue >= 50) {
        return (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/70">
                {rateValue}%
            </span>
        );
    }
    if (rateValue > 0) {
        return (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {rateValue}%
            </span>
        );
    }
    return <span className="text-slate-400">0%</span>;
}

function SortHeader({
    colKey,
    label,
    tip,
    currentCol,
    descending,
    onSort,
    className = 'px-2 py-2',
}: {
    colKey: LotteryRankingColumn;
    label: string;
    tip: string;
    currentCol: LotteryRankingColumn;
    descending: boolean;
    onSort: (col: LotteryRankingColumn) => void;
    className?: string;
}) {
    const isCurrent = currentCol === colKey;
    return (
        <th className={`${className} font-medium ${isCurrent ? 'bg-orange-50/40' : ''}`}>
            <button
                type="button"
                title={tip}
                onClick={() => onSort(colKey)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 transition-all ${
                    isCurrent
                        ? 'bg-orange-100 font-bold text-orange-800 shadow-2xs'
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

export default function LotteryStatistics({data}: {data: ResidentAnalytics['lotteryStatistics'] | undefined}) {
    const [column, setColumn] = useState<LotteryRankingColumn>('net');
    const [descending, setDescending] = useState(true);

    if (!data) return <p className="py-4 text-center text-xs text-slate-400">暂无大乐透统计数据</p>;
    const {overview: total, residents} = data;

    const activity = [
        ['购买次数', `${total.purchases} 次`],
        ['购买彩票', `${total.tickets} 张`],
        ['参与期数', `${total.rounds} 期`],
        ['已开奖票', `${total.settledTickets} 张`],
        ['待开奖票', `${total.pendingTickets} 张`],
        ['中奖票率', rate(total.winRate)],
    ];
    const finance = [
        ['实际购票支出', total.expense],
        ['实际到账奖金', total.prizes],
        ['区间净收支', total.net],
        ['最高单笔奖金', total.maxPrize],
    ];

    const tiers = [
        {
            key: 'first',
            label: '一等奖',
            icon: Trophy,
            badgeClass: 'bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-800 ring-1 ring-amber-300/80 font-bold shadow-2xs',
            iconColor: 'text-amber-600 fill-amber-500/20',
            tickets: total.firstTickets,
            awards: total.firstAwards,
            prize: total.firstPrize,
        },
        {
            key: 'second',
            label: '二等奖',
            icon: Sparkles,
            badgeClass: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/70 font-semibold',
            iconColor: 'text-indigo-500',
            tickets: total.secondTickets,
            awards: total.secondAwards,
            prize: total.secondPrize,
        },
        {
            key: 'third',
            label: '三等奖',
            icon: Ticket,
            badgeClass: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200/70 font-semibold',
            iconColor: 'text-orange-500',
            tickets: total.thirdTickets,
            awards: total.thirdAwards,
            prize: total.thirdPrize,
        },
    ] as const;

    const active = total.tickets > 0 || total.expense !== '0.00' || total.prizes !== '0.00';
    const sortedResidents = sortLotteryResidents(residents, column, descending);

    const handleSort = (newCol: LotteryRankingColumn) => {
        if (column === newCol) {
            setDescending(!descending);
        } else {
            setColumn(newCol);
            setDescending(true);
        }
    };

    return (
        <div className="space-y-4">
            {/* 顶部活动概览 */}
            <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {activity.map(([label, value]) => (
                    <div key={label} className="min-w-0">
                        <dt className="text-[11px] text-slate-500">{label}</dt>
                        <dd className="mt-1 break-all text-base font-semibold tabular-nums text-slate-800">{value}</dd>
                    </div>
                ))}
            </dl>
            <p className="text-[11px] leading-relaxed text-slate-500">
                中奖 {total.winningTickets} 张，未中奖 {total.unwonTickets} 张，中奖期数 {total.winningRounds} 期。购票结果按购票日期筛选，读取截至查询时的开奖结果；中奖票率仅以已开奖票为分母。
            </p>
            {total.unknownTickets > 0 && (
                <p className="text-xs text-amber-700">另有 {total.unknownTickets} 张历史票缺少开奖结果，未计入中奖率。</p>
            )}

            {/* 资金概览 */}
            <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4">
                {finance.map(([label, value]) => (
                    <div key={label} className="min-w-0">
                        <dt className="text-[11px] text-slate-500">{label}</dt>
                        <dd className="mt-1 break-all text-base font-semibold tabular-nums text-slate-800">
                            {analyticsMoney(value)}
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="text-[11px] leading-relaxed text-slate-400">
                资金按实际入账日期统计，包含此前购票在本区间到账的奖金；本区间购票在之后到账的奖金不计。净收支＝到账奖金－购票支出。
            </p>

            {!active ? (
                <p className="py-4 text-center text-xs text-slate-400">所选日期内暂无大乐透购票或收支记录</p>
            ) : (
                <div className="space-y-4 pt-1">
                    {/* 奖档统计表格 */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-slate-700">奖档发奖统计</h4>
                            <span className="text-[11px] text-slate-400">共 3 个奖档</span>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
                            <div className="overflow-x-auto scrollbar-hide">
                                <table aria-label="大乐透奖档统计" className="w-full min-w-[500px] text-right text-xs tabular-nums">
                                    <thead className="border-b border-slate-200/80 bg-slate-50 text-[11px] font-medium text-slate-500">
                                        <tr>
                                            <th className="py-2.5 pl-4 pr-3 text-left font-medium">奖档</th>
                                            <th className="px-3 py-2.5 font-medium">购买批次中奖票</th>
                                            <th className="px-3 py-2.5 font-medium">区间发奖笔数</th>
                                            <th className="py-2.5 pl-3 pr-4 font-medium">区间到账奖金</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {tiers.map(tier => {
                                            const Icon = tier.icon;
                                            return (
                                                <tr key={tier.key} className="transition-colors hover:bg-slate-50/70">
                                                    <td className="py-3 pl-4 pr-3 text-left">
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs ${tier.badgeClass}`}
                                                        >
                                                            <Icon className={`h-3.5 w-3.5 shrink-0 ${tier.iconColor}`} />
                                                            {tier.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {tier.tickets > 0 ? (
                                                            <span className="font-bold text-slate-800">
                                                                {tier.tickets}{' '}
                                                                <span className="text-[10px] font-normal text-slate-400">张</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">0</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {tier.awards > 0 ? (
                                                            <span className="font-semibold text-slate-700">
                                                                {tier.awards}{' '}
                                                                <span className="text-[10px] font-normal text-slate-400">笔</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">0</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 pl-3 pr-4">
                                                        {tier.prize !== '0.00' ? (
                                                            <span
                                                                className={`font-bold tabular-nums ${
                                                                    tier.key === 'first' ? 'text-amber-600' : 'text-slate-800'
                                                                }`}
                                                            >
                                                                {analyticsMoney(tier.prize)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">¥0.00</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                            每张中奖票独立计数；同一居民每期二、三等奖各最多发一笔，奖金不按中奖票数重复累乘。最高单笔奖金指一笔奖档入账。
                        </p>
                    </div>

                    {/* 居民统计表格 */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-slate-700">居民彩票与收支排行</h4>
                            <span className="text-[11px] text-slate-400">可点击表头进行排序</span>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
                            <div className="overflow-x-auto scrollbar-hide">
                                <table aria-label="大乐透居民统计" className="w-full min-w-[960px] text-right text-xs tabular-nums">
                                    <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50 text-[11px] font-medium text-slate-500">
                                        <tr>
                                            <th className="w-12 py-2.5 pl-3 pr-2 text-center font-medium">排名</th>
                                            <th className="min-w-36 px-3 py-2.5 text-left font-medium">居民</th>

                                            <SortHeader
                                                colKey="tickets"
                                                label="购票/张"
                                                tip="按购票张数排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />
                                            <SortHeader
                                                colKey="pendingTickets"
                                                label="待开/张"
                                                tip="按待开奖张数排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />
                                            <SortHeader
                                                colKey="winningTickets"
                                                label="中奖/张"
                                                tip="按中奖票数排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />
                                            <SortHeader
                                                colKey="winRate"
                                                label="中奖票率"
                                                tip="按已开奖票中奖率排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />
                                            <SortHeader
                                                colKey="firstTickets"
                                                label="一等奖/张"
                                                tip="按一等奖张数排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />

                                            <th className="px-2.5 py-2 font-medium">二等奖/张</th>
                                            <th className="px-2.5 py-2 font-medium">三等奖/张</th>

                                            <SortHeader
                                                colKey="expense"
                                                label="支出"
                                                tip="按购票支出排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />
                                            <SortHeader
                                                colKey="prizes"
                                                label="奖金"
                                                tip="按到账奖金排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                            />
                                            <SortHeader
                                                colKey="net"
                                                label="净收支"
                                                tip="按区间净收支排序"
                                                currentCol={column}
                                                descending={descending}
                                                onSort={handleSort}
                                                className="py-2 pl-2 pr-3.5"
                                            />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {sortedResidents.map((row, index) => {
                                            const rank = index + 1;
                                            const netStr = String(row.net);
                                            const isNetNegative = netStr.startsWith('-');
                                            const isNetZero = netStr === '0' || netStr === '0.00';

                                            return (
                                                <tr key={row.id} className="transition-colors hover:bg-orange-50/20">
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

                                                    {/* 购票 */}
                                                    <td className="px-2 py-3 font-semibold text-slate-800">
                                                        {row.tickets}
                                                    </td>

                                                    {/* 待开 */}
                                                    <td className="px-2 py-3">
                                                        {row.pendingTickets > 0 ? (
                                                            <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200/70">
                                                                {row.pendingTickets}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">0</span>
                                                        )}
                                                    </td>

                                                    {/* 中奖 */}
                                                    <td className="px-2 py-3">
                                                        {row.winningTickets > 0 ? (
                                                            <span className="font-bold text-slate-800">
                                                                {row.winningTickets}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">0</span>
                                                        )}
                                                    </td>

                                                    {/* 中奖票率 */}
                                                    <td className="px-2 py-3">
                                                        <WinRateBadge rateValue={row.winRate} />
                                                    </td>

                                                    {/* 一等奖 */}
                                                    <td className="px-2 py-3">
                                                        {row.firstTickets > 0 ? (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-50 to-yellow-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 shadow-2xs ring-1 ring-amber-300/80">
                                                                <Crown className="h-3 w-3 fill-amber-500/20 text-amber-600" />
                                                                {row.firstTickets}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">—</span>
                                                        )}
                                                    </td>

                                                    {/* 二等奖 */}
                                                    <td className="px-2.5 py-3">
                                                        {row.secondTickets > 0 ? (
                                                            <span className="font-semibold text-indigo-700">
                                                                {row.secondTickets}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">—</span>
                                                        )}
                                                    </td>

                                                    {/* 三等奖 */}
                                                    <td className="px-2.5 py-3">
                                                        {row.thirdTickets > 0 ? (
                                                            <span className="font-medium text-orange-700">
                                                                {row.thirdTickets}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">—</span>
                                                        )}
                                                    </td>

                                                    {/* 支出 */}
                                                    <td className="px-2 py-3 text-slate-600">
                                                        {analyticsMoney(row.expense)}
                                                    </td>

                                                    {/* 奖金 */}
                                                    <td className="px-2 py-3">
                                                        {row.prizes !== '0.00' ? (
                                                            <span className="font-bold text-amber-600">
                                                                {analyticsMoney(row.prizes)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300">¥0.00</span>
                                                        )}
                                                    </td>

                                                    {/* 净收支 */}
                                                    <td className="py-3 pl-2 pr-3.5">
                                                        {isNetZero ? (
                                                            <span className="font-normal text-slate-400">¥0.00</span>
                                                        ) : isNetNegative ? (
                                                            <span className="font-semibold text-rose-600">
                                                                {analyticsMoney(netStr)}
                                                            </span>
                                                        ) : (
                                                            <span className="font-bold text-emerald-600">
                                                                +{analyticsMoney(netStr)}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
