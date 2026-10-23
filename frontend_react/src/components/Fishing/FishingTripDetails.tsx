import {useMemo, useState} from 'react';
import {
    ArrowLeft,
    Check,
    Clock,
    Compass,
    Crown,
    Fish,
    MapPin,
    Package,
    TrendingUp,
    Waves,
} from 'lucide-react';
import type {FishingDetail} from '../../types/api/fishing';
import {BaitPortrait} from './BaitPortrait';
import {FishPortrait} from './FishPortrait';
import {fishArtIdForName} from './fishVisuals';
import {fishingSpotLabels, fishingTime} from './presentation';

const moves: Record<string, string> = {rock: '锤子 ✊', scissors: '剪刀 ✌️', paper: '布 ✋'};
const outcomes: Record<string, string> = {
    empty: '鱼群游过，并未咬钩',
    junk: '起竿沉重，钓到了水底杂物',
    fish: '浮漂轻颤，鱼儿咬钩',
    escaped: '水花四溅，鱼儿挣脱了鱼钩',
    king: '水底掀起暗涌，遇见了专属鱼王！',
};

const statusBadges: Record<string, {label: string; color: string}> = {
    preparing: {label: '岸边准备', color: 'border-amber-200 bg-amber-50 text-amber-700'},
    active: {label: '正在垂钓', color: 'border-teal-200 bg-teal-50 text-teal-700'},
    duel: {label: '鱼王拉锯', color: 'border-amber-300 bg-amber-100 text-amber-800'},
    paused: {label: '等待重试', color: 'border-rose-200 bg-rose-50 text-rose-700'},
    completed: {label: '已返程手札', color: 'border-slate-200 bg-slate-100 text-slate-600'},
    cancelled: {label: '已提前返回', color: 'border-slate-200 bg-slate-100 text-slate-500'},
};

export function FishingTripDetails({
    trip,
    loading,
    onBack,
    onPage,
}: {
    trip: FishingDetail;
    loading: boolean;
    onBack: () => void;
    onPage: (page: number) => void;
}) {
    const [filter, setFilter] = useState<'all' | 'catch' | 'duel'>('all');

    const totalCaught = trip.catches.reduce((count, item) => count + item.quantity, 0);
    const catchRate = trip.casts > 0 ? ((totalCaught / trip.casts) * 100).toFixed(1) : '0.0';
    const hasDuel = trip.duel !== null || trip.events.some(e => e.kind.startsWith('duel'));
    const statusMeta = statusBadges[trip.status] || {label: '出钓手札', color: 'border-slate-200 bg-slate-100 text-slate-600'};

    const filteredEvents = useMemo(() => {
        if (filter === 'catch') {
            return trip.events.filter(e => Boolean(e.data.catch));
        }
        if (filter === 'duel') {
            return trip.events.filter(e => e.kind.startsWith('duel'));
        }
        return trip.events;
    }, [trip.events, filter]);

    const catchEventCount = useMemo(() => trip.events.filter(e => Boolean(e.data.catch)).length, [trip.events]);
    const duelEventCount = useMemo(() => trip.events.filter(e => e.kind.startsWith('duel')).length, [trip.events]);

    return (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* 顶部手札头部 */}
            <div className="fishing-atlas-header shrink-0 border-b border-slate-200/80 p-3.5 sm:px-5 sm:py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onBack}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-teal-300 hover:bg-teal-50/80 hover:text-teal-800 active:scale-95"
                        >
                            <ArrowLeft className="h-3.5 w-3.5 text-teal-700" />
                            <span>返回出钓手札</span>
                        </button>
                        <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusMeta.color}`}>
                                {trip.status === 'duel' && <Crown className="h-3 w-3 text-amber-500" />}
                                {statusMeta.label}
                            </span>
                            <span className="hidden text-xs text-slate-300 sm:inline">|</span>
                            <span className="hidden items-center gap-1 text-xs text-slate-500 sm:inline-flex">
                                <MapPin className="h-3.5 w-3.5 text-teal-600" />
                                {fishingSpotLabels[trip.plan.spot || ''] || '未知钓点'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span>出发：{fishingTime(trip.departedAt || trip.createdAt)}</span>
                        {trip.endedAt && <span>· 返程：{fishingTime(trip.endedAt)}</span>}
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                        <h3 className="text-base font-extrabold text-slate-800 sm:text-lg">
                            {trip.actorName} · 出钓见闻录
                        </h3>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                            {fishingSpotLabels[trip.plan.spot || ''] || '水边'} · 计划 {trip.plan.minutes || 30} 分钟 · 每一竿与水流咬钩的细节，都留在这页手札中
                        </p>
                    </div>
                    {trip.reason && (
                        <span className="rounded-lg bg-teal-50/80 px-2.5 py-1 text-[10px] font-medium text-teal-800">
                            返程说明：{trip.reason}
                        </span>
                    )}
                </div>
            </div>

            {/* 主体响应式双栏布局 */}
            <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-slate-100 overflow-hidden lg:grid-cols-12 lg:divide-y-0 lg:divide-x">
                {/* 左栏（4列）：战绩概览 & 渔获展台 & 携带物资 */}
                <aside className="space-y-4 overflow-y-auto bg-slate-50/40 p-4 scrollbar-hide lg:col-span-5 xl:col-span-4">
                    {/* 关键战绩指标卡 */}
                    <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                        <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2">
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                <TrendingUp className="h-3.5 w-3.5 text-teal-600" />
                                <span>出钓战报</span>
                            </h4>
                            <span className="text-[10px] text-slate-400">本次出钓总览</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <div className="rounded-lg border border-slate-100 bg-[#f9faf7] p-2.5">
                                <span className="text-[10px] text-slate-400">累计抛竿</span>
                                <div className="mt-1 flex items-baseline gap-1">
                                    <span className="font-mono text-lg font-bold text-slate-800">{trip.casts}</span>
                                    <span className="text-[10px] text-slate-400">次</span>
                                </div>
                            </div>
                            <div className="rounded-lg border border-teal-100/70 bg-teal-50/40 p-2.5">
                                <span className="text-[10px] text-teal-700/80">本次渔获</span>
                                <div className="mt-1 flex items-baseline gap-1">
                                    <span className="font-mono text-lg font-bold text-teal-800">{totalCaught}</span>
                                    <span className="text-[10px] text-teal-600">条</span>
                                </div>
                            </div>
                            <div className="rounded-lg border border-amber-100/70 bg-amber-50/40 p-2.5">
                                <span className="text-[10px] text-amber-700/80">获得经验</span>
                                <div className="mt-1 flex items-baseline gap-1">
                                    <span className="font-mono text-lg font-bold text-amber-700">+{trip.experience}</span>
                                    <span className="text-[10px] text-amber-600">EXP</span>
                                </div>
                            </div>
                            <div className="rounded-lg border border-slate-100 bg-[#f9faf7] p-2.5">
                                <span className="text-[10px] text-slate-400">成功起鱼率</span>
                                <div className="mt-1 flex items-baseline gap-1">
                                    <span className="font-mono text-lg font-bold text-slate-800">{catchRate}</span>
                                    <span className="text-[10px] text-slate-400">%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 渔获标本展示台 */}
                    <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                        <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2">
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                <Fish className="h-3.5 w-3.5 text-teal-600" />
                                <span>收获渔获标本</span>
                            </h4>
                            <span className="font-mono text-[10px] text-teal-700">{trip.catches.length} 种鱼品</span>
                        </div>
                        {trip.catches.length > 0 ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                                {trip.catches.map(c => {
                                    const artId = fishArtIdForName(c.name);
                                    const isKing = (artId && trip.rules.fish[artId]?.king) || false;
                                    return (
                                        <div
                                            key={c.name}
                                            className={`flex items-center gap-2.5 rounded-lg border p-2 ${
                                                isKing
                                                    ? 'border-amber-200 bg-amber-50/60'
                                                    : 'border-slate-100 bg-[#fcfdfa]'
                                            }`}
                                        >
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-teal-100/60 bg-white">
                                                {artId ? (
                                                    <FishPortrait fishId={artId} name={c.name} decorative className="h-10 w-10" />
                                                ) : (
                                                    <Fish className="h-5 w-5 text-teal-600" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="truncate text-xs font-bold text-slate-800">{c.name}</span>
                                                    {isKing && (
                                                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.2 text-[9px] font-bold text-amber-800">
                                                            <Crown className="h-2.5 w-2.5" />鱼王
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-0.5 text-[10px] text-slate-400">
                                                    已入背包 · 数量 <strong className="font-bold text-teal-800">×{c.quantity}</strong>
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center">
                                <Fish className="mx-auto h-6 w-6 text-slate-300" />
                                <p className="mt-1.5 text-xs text-slate-400">本次出钓水波平静，未收获成鱼</p>
                            </div>
                        )}
                    </div>

                    {/* 出钓携带与物资手札 */}
                    <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                        <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2">
                            <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                <Package className="h-3.5 w-3.5 text-teal-600" />
                                <span>携带物资与鱼饵</span>
                            </h4>
                            <span className="text-[10px] text-slate-400">
                                {trip.endedAt ? '出钓消耗记录' : '当前随身携带'}
                            </span>
                        </div>
                        {trip.carried.length > 0 ? (
                            <div className="space-y-1.5">
                                {trip.carried.map((bait, idx) => (
                                    <div
                                        key={`${bait.sku}-${idx}`}
                                        className="flex items-center justify-between rounded-lg border border-slate-100 bg-[#fbfcf9] px-2.5 py-1.5 text-xs"
                                    >
                                        <div className="flex items-center gap-2">
                                            <BaitPortrait baitId={bait.sku} className="h-5 w-5" />
                                            <span className="font-medium text-slate-700">{bait.name}</span>
                                        </div>
                                        <span className="font-mono text-[11px] font-semibold text-teal-800">
                                            {trip.endedAt ? '记录份数' : '携带'} {bait.quantity} 份
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="py-3 text-center text-xs text-slate-400">未携带特定鱼饵或已全部消耗</p>
                        )}
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                            <span>配备：{trip.rules.rod.name}</span>
                            <span>单竿耗体：{trip.rules.energyCost} 点</span>
                        </div>
                    </div>
                </aside>

                {/* 右栏（8列）：逐竿见闻时间轴 */}
                <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white lg:col-span-7 xl:col-span-8">
                    {/* 时间轴工具栏与过滤器 */}
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 sm:px-5">
                        <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-800">逐竿见闻流</h4>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
                                {trip.eventTotal} 记
                            </span>
                        </div>

                        {/* 筛选分段器 */}
                        <div className="inline-flex rounded-full bg-slate-100 p-0.5 text-[10px]">
                            <button
                                type="button"
                                onClick={() => setFilter('all')}
                                className={`rounded-full px-2.5 py-1 font-medium transition-all ${
                                    filter === 'all'
                                        ? 'bg-white font-bold text-teal-800 shadow-2xs'
                                        : 'text-slate-500 hover:text-teal-700'
                                }`}
                            >
                                全部记录 ({trip.eventTotal})
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilter('catch')}
                                className={`rounded-full px-2.5 py-1 font-medium transition-all ${
                                    filter === 'catch'
                                        ? 'bg-white font-bold text-teal-800 shadow-2xs'
                                        : 'text-slate-500 hover:text-teal-700'
                                }`}
                            >
                                🎣 本页起鱼 ({catchEventCount})
                            </button>
                            {hasDuel && (
                                <button
                                    type="button"
                                    onClick={() => setFilter('duel')}
                                    className={`rounded-full px-2.5 py-1 font-medium transition-all ${
                                        filter === 'duel'
                                            ? 'bg-white font-bold text-amber-800 shadow-2xs'
                                            : 'text-slate-500 hover:text-amber-700'
                                    }`}
                                >
                                    👑 本页对决 ({duelEventCount})
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 时间轴流水列表 */}
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-hide sm:p-5">
                        {filteredEvents.length > 0 ? (
                            <ol className="relative space-y-3.5 before:absolute before:bottom-3 before:left-3.5 before:top-3 before:w-0.5 before:bg-slate-100 sm:space-y-4 sm:before:left-4">
                                {filteredEvents.map(event => {
                                    const d = event.data;
                                    const catchItem = d.catch;
                                    const isDuel = event.kind.startsWith('duel');
                                    const isCast = event.kind === 'cast';
                                    const isChoice = event.kind === 'choice';
                                    const isDepart = event.kind === 'depart';

                                    const isCatchSuccess = Boolean(catchItem);
                                    const isKingCatch = catchItem?.king || false;

                                    return (
                                        <li key={event.id} className="relative flex items-start gap-3 pl-0 sm:gap-4">
                                            {/* 时间轴节点标记圆圈 */}
                                            <div
                                                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-2xs sm:h-8 sm:w-8 ${
                                                    isKingCatch || isDuel
                                                        ? 'border-amber-300 bg-amber-50 text-amber-600'
                                                        : isCatchSuccess
                                                          ? 'border-teal-300 bg-teal-50 text-teal-600'
                                                          : isChoice || isDepart
                                                            ? 'border-sky-200 bg-sky-50 text-sky-600'
                                                            : 'border-slate-200 bg-white text-slate-400'
                                                }`}
                                            >
                                                {isKingCatch ? (
                                                    <Crown className="h-3.5 w-3.5 text-amber-500" />
                                                ) : isCatchSuccess ? (
                                                    <Fish className="h-3.5 w-3.5 text-teal-600" />
                                                ) : isDuel ? (
                                                    <Crown className="h-3.5 w-3.5 text-amber-500" />
                                                ) : isChoice ? (
                                                    <Check className="h-3.5 w-3.5 text-sky-600" />
                                                ) : isDepart ? (
                                                    <Compass className="h-3.5 w-3.5 text-sky-600" />
                                                ) : (
                                                    <Waves className="h-3.5 w-3.5 text-slate-400" />
                                                )}
                                            </div>

                                            {/* 事件卡片主体 */}
                                            <div
                                                className={`flex-1 rounded-xl border p-3 shadow-2xs transition-all ${
                                                    isKingCatch
                                                        ? 'border-amber-200 bg-gradient-to-r from-amber-50/80 to-white'
                                                        : isCatchSuccess
                                                          ? 'border-teal-200/90 bg-gradient-to-r from-teal-50/50 to-white'
                                                          : isDuel
                                                            ? 'border-amber-200/80 bg-amber-50/40'
                                                            : 'border-slate-200/80 bg-white'
                                                }`}
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                                                                isKingCatch
                                                                    ? 'bg-amber-100 text-amber-800'
                                                                    : isCatchSuccess
                                                                      ? 'bg-teal-100 text-teal-800'
                                                                      : isDuel
                                                                        ? 'bg-amber-100/70 text-amber-700'
                                                                        : 'bg-slate-100 text-slate-600'
                                                            }`}
                                                        >
                                                            {isKingCatch
                                                                ? '捕获鱼王'
                                                                : isCatchSuccess
                                                                  ? '起鱼成功'
                                                                  : isDuel
                                                                    ? '鱼王对决'
                                                                    : isCast
                                                                      ? '水岸抛竿'
                                                                      : isChoice
                                                                        ? '行程决策'
                                                                        : isDepart
                                                                          ? '出发启程'
                                                                          : '出钓见闻'}
                                                        </span>
                                                        <span className="font-mono text-[10px] text-slate-400">
                                                            {fishingTime(event.createdAt)}
                                                        </span>
                                                    </div>

                                                    {catchItem && (
                                                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700">
                                                            +{catchItem.experience} EXP
                                                        </span>
                                                    )}
                                                </div>

                                                {/* 具体事件详情呈现 */}
                                                <div className="mt-2 text-xs leading-relaxed text-slate-700">
                                                    {catchItem ? (
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-teal-100 bg-white">
                                                                <FishPortrait
                                                                    fishId={catchItem.fishId}
                                                                    name={catchItem.name}
                                                                    decorative
                                                                    className="h-10 w-10"
                                                                />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="font-bold text-teal-950">
                                                                    钓获 <strong className="text-teal-800">{catchItem.name}</strong>
                                                                    <span className="ml-2 rounded bg-teal-100/60 px-1.5 py-0.2 font-mono text-[10px] text-teal-800">
                                                                        {catchItem.weight} kg
                                                                    </span>
                                                                </p>
                                                                <p className="mt-0.5 text-[10px] text-slate-400">
                                                                    使用鱼饵：{trip.rules.baits[d.bait || '']?.name || '普通鱼饵'}
                                                                    {d.probability !== undefined && (
                                                                        <span className="ml-2">
                                                                            估算捕获率：{(d.probability * 100).toFixed(1)}%
                                                                        </span>
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ) : event.kind === 'duel_round' ? (
                                                        <div>
                                                            <p className="font-bold text-amber-900">
                                                                {moves[d.player || ''] || d.player} 对决 {moves[d.king || ''] || d.king} ·{' '}
                                                                <span
                                                                    className={
                                                                        d.result === 'win'
                                                                            ? 'text-teal-700 font-bold'
                                                                            : d.result === 'loss'
                                                                              ? 'text-rose-600 font-bold'
                                                                              : 'text-amber-700'
                                                                    }
                                                                >
                                                                    {d.result === 'draw' ? '平局' : d.result === 'win' ? '本局获胜' : '本局落败'}
                                                                </span>
                                                            </p>
                                                            <p className="mt-1 font-mono text-[10px] text-slate-500">
                                                                比分统计：胜 {d.wins ?? 0} 局 · 负 {d.losses ?? 0} 局（三胜捕获，三败逃脱）
                                                            </p>
                                                        </div>
                                                    ) : event.kind === 'duel_end' ? (
                                                        <p className="font-medium text-amber-800">
                                                            鱼王掀起水浪，累计三败逃离了该钓点。
                                                        </p>
                                                    ) : isCast ? (
                                                        <div>
                                                            <p className="font-medium text-slate-800">
                                                                消耗 {trip.rules.baits[d.bait || '']?.name || '鱼饵'} 抛竿，
                                                                {d.outcome?.name || outcomes[d.outcome?.kind || ''] || '等待浮漂动作'}
                                                            </p>
                                                            {d.probability !== undefined && (
                                                                <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                                                                    本次咬钩捕获概率计算值：{(d.probability * 100).toFixed(1)}%
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : isChoice ? (
                                                        <p className="text-slate-600">
                                                            {d.key === 'spot' && `选定垂钓钓点：${trip.rules.spots[d.value || '']?.name || d.value}`}
                                                            {d.key === 'minutes' && `计划本次垂钓时长：${d.value} 分钟`}
                                                            {d.key === 'bait' && (d.value === 'stop' ? '鱼饵准备选择结束' : `选定携带鱼饵：${trip.rules.baits[d.value || '']?.name || d.value}`)}
                                                            {!['spot', 'minutes', 'bait'].includes(d.key || '') && `${d.key}: ${d.value}`}
                                                        </p>
                                                    ) : isDepart ? (
                                                        <p className="font-medium text-sky-800">
                                                            携带备用鱼饵与钓竿出发，来到水岸等待鱼群。
                                                        </p>
                                                    ) : (
                                                        <p className="text-slate-600">{d.reason || '返程结算完成'}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : (
                            <div className="py-12 text-center text-xs text-slate-400">
                                {filter === 'all'
                                    ? '正在准备出发，尚无出钓记录'
                                    : '当前筛选下暂无对应事件'}
                            </div>
                        )}
                    </div>

                    {/* 底部分页控制器 */}
                    {(trip.eventTotal > 30 || trip.eventPage > 1) && (
                        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-[10px] text-slate-500">
                            <button
                                type="button"
                                disabled={loading || trip.eventPage <= 1}
                                onClick={() => onPage(trip.eventPage - 1)}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium transition-colors hover:bg-slate-50 disabled:opacity-30"
                            >
                                上一页
                            </button>
                            <span className="font-mono">
                                第 {trip.eventPage} 页 · 共 {Math.max(1, Math.ceil(trip.eventTotal / 30))} 页
                            </span>
                            <button
                                type="button"
                                disabled={loading || trip.eventPage * 30 >= trip.eventTotal}
                                onClick={() => onPage(trip.eventPage + 1)}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium transition-colors hover:bg-slate-50 disabled:opacity-30"
                            >
                                下一页
                            </button>
                        </div>
                    )}
                </main>
            </div>
        </section>
    );
}
