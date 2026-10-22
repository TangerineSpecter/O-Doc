import {useMemo, useRef, useState} from 'react';
import {
    Award,
    CalendarDays,
    ChevronDown,
    ChevronRight,
    Crown,
    GitBranch,
    Medal,
    Sparkles,
    Swords,
    Trophy,
} from 'lucide-react';
import type {TournamentDetail, TournamentMatch, TournamentRound} from '../../types/api/tournament';
import {dateLabel, reasonLabel} from './tournamentLabels';

interface TournamentBracketProps {
    event: TournamentDetail;
    onMatch: (id: string) => void;
}

// 阶段名称格式化
function getRoundTitle(round: TournamentRound): string {
    if (round.phase === 'preliminary') return '资格预选附加赛';
    if (round.phase === 'final') return '巅峰总决赛';
    if (round.entrantCount <= 4) return '半决赛';
    if (round.entrantCount <= 8) return '1/4 决赛 (8强)';
    if (round.entrantCount <= 16) return '16 强赛';
    if (round.entrantCount <= 32) return '32 强赛';
    if (round.entrantCount <= 64) return '64 强赛';
    return `${round.entrantCount} 强淘汰赛`;
}

// 单场比赛对阵卡片（世界杯对阵树槽位风格）
function MatchCard({
    match,
    names,
    hoveredActorId,
    onHoverActor,
    onMatch,
    isFinal = false,
}: {
    match: TournamentMatch;
    names: Record<string, string>;
    hoveredActorId: string | null;
    onHoverActor: (id: string | null) => void;
    onMatch: (id: string) => void;
    isFinal?: boolean;
}) {
    const isBye = !match.rightId;
    const winnerId = match.result?.winnerId;
    const isDone = match.status === 'done';

    const leftIsWinner = isDone && winnerId === match.leftId;
    const rightIsWinner = isDone && winnerId === match.rightId;
    const leftIsHovered = hoveredActorId && match.leftId === hoveredActorId;
    const rightIsHovered = hoveredActorId && match.rightId === hoveredActorId;
    const matchHighlighted = leftIsHovered || rightIsHovered;

    return (
        <div
            className={`group relative rounded-xl border transition-all duration-200 ${
                match.kind === 'bronze'
                    ? 'border-amber-200/90 bg-gradient-to-b from-amber-50/40 to-white shadow-2xs'
                    : isFinal
                      ? 'border-orange-300 bg-gradient-to-b from-orange-50/50 to-white shadow-sm ring-1 ring-orange-200'
                      : 'border-slate-200/90 bg-white shadow-2xs hover:border-orange-300 hover:shadow-sm'
            } ${matchHighlighted ? 'ring-2 ring-orange-400 ring-offset-1' : ''}`}
        >
            {/* 顶栏微标 */}
            <div className="flex items-center justify-between border-b border-slate-100/80 px-2.5 py-1 text-[11px]">
                <span className="flex items-center gap-1 font-mono font-medium text-slate-400">
                    {match.kind === 'bronze' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                            <Medal className="h-3 w-3 text-amber-600"/>季军争夺战
                        </span>
                    ) : isFinal ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-orange-600">
                            <Crown className="h-3 w-3 text-amber-500"/>冠亚军决战
                        </span>
                    ) : (
                        `#${match.number}`
                    )}
                </span>
                <span className="text-[10px] text-slate-400">
                    {isDone ? reasonLabel[match.result?.reason || ''] || '已完赛' : '等待开赛'}
                </span>
            </div>

            {/* 对战双方 */}
            <div className="divide-y divide-slate-100/70 p-1.5 text-xs">
                {/* 选手 1 */}
                <div
                    onMouseEnter={() => onHoverActor(match.leftId)}
                    onMouseLeave={() => onHoverActor(null)}
                    className={`flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors cursor-pointer ${
                        leftIsWinner
                            ? 'bg-orange-50/80 font-bold text-orange-950'
                            : 'text-slate-700 hover:bg-slate-50'
                    } ${leftIsHovered ? 'bg-orange-100/90 font-bold text-orange-900' : ''}`}
                >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                        {leftIsWinner && <Crown className="h-3 w-3 shrink-0 text-amber-500"/>}
                        <span className="truncate">{names[match.leftId] || match.leftId}</span>
                    </span>
                    {leftIsWinner && (
                        <span className="shrink-0 rounded bg-orange-200/70 px-1 py-0.2 text-[9px] font-bold text-orange-800">
                            胜出
                        </span>
                    )}
                </div>

                {/* 选手 2 */}
                <div
                    onMouseEnter={() => match.rightId && onHoverActor(match.rightId)}
                    onMouseLeave={() => onHoverActor(null)}
                    className={`flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors ${
                        isBye
                            ? 'text-slate-400 italic'
                            : rightIsWinner
                              ? 'bg-orange-50/80 font-bold text-orange-950'
                              : 'text-slate-700 hover:bg-slate-50 cursor-pointer'
                    } ${rightIsHovered ? 'bg-orange-100/90 font-bold text-orange-900' : ''}`}
                >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                        {rightIsWinner && <Crown className="h-3 w-3 shrink-0 text-amber-500"/>}
                        <span className="truncate">{isBye ? '（轮空）' : names[match.rightId] || match.rightId}</span>
                    </span>
                    {isBye ? (
                        <span className="shrink-0 text-[10px] text-slate-400">直接晋级</span>
                    ) : rightIsWinner ? (
                        <span className="shrink-0 rounded bg-orange-200/70 px-1 py-0.2 text-[9px] font-bold text-orange-800">
                            胜出
                        </span>
                    ) : null}
                </div>
            </div>

            {/* 战报按钮 */}
            {isDone && !isBye && (
                <button
                    type="button"
                    onClick={() => onMatch(match.id)}
                    className="flex w-full items-center justify-center gap-1 border-t border-slate-100 bg-slate-50/60 py-1.5 text-[11px] font-medium text-orange-600 transition-colors hover:bg-orange-50 hover:text-orange-700"
                >
                    <Swords className="h-3 w-3"/>
                    <span>查看战报</span>
                </button>
            )}
        </div>
    );
}

// 超额轮次（预选附加赛）收纳折叠展示区
function PrelimSection({
    prelimRound,
    advancesToMain,
    names,
    hoveredActorId,
    onHoverActor,
    onMatch,
}: {
    prelimRound: TournamentRound;
    advancesToMain: boolean;
    names: Record<string, string>;
    hoveredActorId: string | null;
    onHoverActor: (id: string | null) => void;
    onMatch: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const matchCount = prelimRound.matches.length;

    return (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/30 p-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <Swords className="h-5 w-5"/>
                    </span>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900">资格附加预选赛 · 第 {prelimRound.number} 轮</h3>
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                                超额收纳轮 · {prelimRound.entrantCount} 人入围
                            </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                            报名参赛居民超出 64 人主赛签位上限，周日进行附加预选赛。本轮 {matchCount} 组对阵，胜者{advancesToMain ? '晋级正赛' : '进入下一轮预选赛'}。
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => setExpanded(prev => !prev)}
                    className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-2xs transition-colors hover:bg-amber-50"
                >
                    <span>{expanded ? '收起预选赛对阵' : `展开预选对阵 (${matchCount} 场)`}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}/>
                </button>
            </div>

            {expanded && (
                <div className="mt-4 border-t border-amber-200/60 pt-4">
                    <div className="mb-2.5 flex items-center justify-between text-xs text-slate-500">
                        <span>{dateLabel(prelimRound.scheduledAt)} · {prelimRound.status === 'done' ? '全部完成' : '比赛中'}</span>
                        <span className="text-[11px] text-amber-700">点击战报可查看逐回合对决记录</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 max-h-[460px] overflow-y-auto scrollbar-hide pr-1">
                        {prelimRound.matches.map(m => (
                            <MatchCard
                                key={m.id}
                                match={m}
                                names={names}
                                hoveredActorId={hoveredActorId}
                                onHoverActor={onHoverActor}
                                onMatch={onMatch}
                            />
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

// 荣耀领奖展台（决赛旁边呈现）
function ChampionHonorPodium({
    event,
    names,
    hoveredActorId,
    onHoverActor,
}: {
    event: TournamentDetail;
    names: Record<string, string>;
    hoveredActorId: string | null;
    onHoverActor: (id: string | null) => void;
}) {
    const champId = event.result?.podium?.['1'];
    const runnerId = event.result?.podium?.['2'];
    const bronzeId = event.result?.podium?.['3'];

    const champReward = event.rewards.find(r => r.place === 1);

    return (
        <div className="flex w-64 shrink-0 flex-col justify-center rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/60 via-white to-amber-50/40 p-4 shadow-sm">
            <div className="text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 shadow-inner">
                    <Trophy className="h-7 w-7 text-amber-500"/>
                </span>
                <p className="mt-2 text-xs font-semibold tracking-wider text-amber-700 uppercase">
                    CHAMPION · 本届冠军
                </p>
                <div
                    onMouseEnter={() => champId && onHoverActor(champId)}
                    onMouseLeave={() => onHoverActor(null)}
                    className={`mt-1 truncate text-lg font-black text-slate-900 transition-colors ${
                        champId && hoveredActorId === champId ? 'text-orange-600' : ''
                    }`}
                >
                    {champId ? names[champId] || champId : '等待决出'}
                </div>
                {champReward?.result?.item && (
                    <div className="mt-2 rounded-xl border border-amber-200/70 bg-white/90 p-2 text-xs shadow-2xs">
                        <span className="font-bold text-amber-700">{champReward.result.item.name}</span>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                            Lv.{champReward.result.item.level} 金装 · 属性卓越
                        </p>
                    </div>
                )}
            </div>

            <div className="mt-5 space-y-2 border-t border-amber-200/50 pt-3 text-xs">
                <div
                    onMouseEnter={() => runnerId && onHoverActor(runnerId)}
                    onMouseLeave={() => onHoverActor(null)}
                    className={`flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-1.5 border border-slate-100 ${
                        runnerId && hoveredActorId === runnerId ? 'border-orange-300 bg-orange-50/60' : ''
                    }`}
                >
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                        <Medal className="h-3.5 w-3.5 text-blue-500"/>
                        <span>亚军</span>
                    </span>
                    <span className="font-bold text-slate-800 truncate">
                        {runnerId ? names[runnerId] || runnerId : '—'}
                    </span>
                </div>

                <div
                    onMouseEnter={() => bronzeId && onHoverActor(bronzeId)}
                    onMouseLeave={() => onHoverActor(null)}
                    className={`flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-1.5 border border-slate-100 ${
                        bronzeId && hoveredActorId === bronzeId ? 'border-orange-300 bg-orange-50/60' : ''
                    }`}
                >
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                        <Award className="h-3.5 w-3.5 text-orange-600"/>
                        <span>季军</span>
                    </span>
                    <span className="font-bold text-slate-800 truncate">
                        {bronzeId ? names[bronzeId] || bronzeId : '—'}
                    </span>
                </div>
            </div>
        </div>
    );
}

// 主淘汰晋级树视图
export function TournamentBracket({event, onMatch}: TournamentBracketProps) {
    const [viewMode, setViewMode] = useState<'bracket' | 'list'>('bracket');
    const [hoveredActorId, setHoveredActorId] = useState<string | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const names = useMemo(() => {
        return Object.fromEntries(event.roster.map(r => [r.id, r.name]));
    }, [event.roster]);

    // 区分预选附加赛和正赛主签表
    const prelimRounds = useMemo(() => {
        return event.rounds.filter(r => r.phase === 'preliminary');
    }, [event.rounds]);

    const mainRounds = useMemo(() => {
        return event.rounds.filter(r => r.phase !== 'preliminary');
    }, [event.rounds]);

    // 平滑横向定位到某一轮
    const scrollToRound = (index: number) => {
        if (!scrollContainerRef.current) return;
        const column = scrollContainerRef.current.querySelector(`[data-round-index="${index}"]`);
        if (column) {
            column.scrollIntoView({behavior: 'smooth', inline: 'center', block: 'nearest'});
        }
    };

    return (
        <div className="space-y-4">
            {/* 顶栏操作区：视图切换 + 轮次快速跳转 Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
                {/* 快速定位锚点 */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="mr-1 inline-flex items-center gap-1 font-semibold text-slate-500">
                        <GitBranch className="h-3.5 w-3.5 text-orange-500"/>
                        轮次导航:
                    </span>
                    {mainRounds.map((r, idx) => (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => scrollToRound(idx)}
                            className="rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 py-1 text-slate-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                        >
                            {getRoundTitle(r)}
                        </button>
                    ))}
                </div>

                {/* 视图模式切换 */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
                        <button
                            type="button"
                            onClick={() => setViewMode('bracket')}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                                viewMode === 'bracket'
                                    ? 'bg-white text-orange-600 shadow-2xs'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Trophy className="h-3.5 w-3.5"/>
                            世界杯对阵树
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                                viewMode === 'list'
                                    ? 'bg-white text-orange-600 shadow-2xs'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <CalendarDays className="h-3.5 w-3.5"/>
                            每日轮次表
                        </button>
                    </div>
                </div>
            </div>

            {/* 选手轨迹高亮提示 */}
            <div className="flex items-center justify-between rounded-xl bg-orange-50/60 px-3.5 py-2 text-xs text-orange-900 border border-orange-100">
                <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-orange-500 shrink-0"/>
                    <span>鼠标悬停在任意选手名字上，将点亮该选手在所有轮次的晋级轨迹！点击战报可查看详细战况。</span>
                </span>
                <span className="shrink-0 text-slate-500 text-[11px]">
                    共 {event.participantCount} 位居民参赛
                </span>
            </div>

            {/* 超额轮次收纳展示区：连续预选时逐轮保留对阵与战报入口 */}
            {prelimRounds.map((round, index) => (
                <PrelimSection
                    key={round.id}
                    prelimRound={round}
                    advancesToMain={index === prelimRounds.length - 1}
                    names={names}
                    hoveredActorId={hoveredActorId}
                    onHoverActor={setHoveredActorId}
                    onMatch={onMatch}
                />
            ))}

            {/* 主赛圈对阵展示 */}
            {viewMode === 'bracket' ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-orange-500"/>
                            <h3 className="font-bold text-slate-900">正赛巅峰淘汰树</h3>
                            <span className="text-xs text-slate-400">
                                {mainRounds[0]
                                    ? `正赛 ${mainRounds[0].entrantCount} 人，逐轮决出冠军`
                                    : event.status === 'skipped' ? '本届未开赛' : '正赛尚未开始'}
                            </span>
                        </div>
                        <span className="text-xs text-slate-400">可左右横向拖动或滑动查看全局</span>
                    </div>

                    {/* 横向滚动淘汰赛树 */}
                    <div
                        ref={scrollContainerRef}
                        className="flex gap-6 overflow-x-auto pb-4 pt-1 scrollbar-hide select-none"
                    >
                        {mainRounds.map((round, rIndex) => {
                            const isLastRound = rIndex === mainRounds.length - 1;
                            const title = getRoundTitle(round);

                            return (
                                <div
                                    key={round.id}
                                    data-round-index={rIndex}
                                    className="flex w-64 shrink-0 flex-col"
                                >
                                    {/* 轮次列头 */}
                                    <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <Swords className="h-3.5 w-3.5 text-orange-500"/>
                                            <span className="text-xs font-bold text-slate-800">{title}</span>
                                        </div>
                                        <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-slate-400">
                                            <span>{round.matches.length} 场对决</span>
                                            <span>·</span>
                                            <span>{dateLabel(round.scheduledAt)}</span>
                                        </div>
                                    </div>

                                    {/* 对战卡片列：自适应垂直间距 */}
                                    <div className="flex flex-1 flex-col justify-around gap-4 py-2">
                                        {round.matches.map(m => (
                                            <MatchCard
                                                key={m.id}
                                                match={m}
                                                names={names}
                                                hoveredActorId={hoveredActorId}
                                                onHoverActor={setHoveredActorId}
                                                onMatch={onMatch}
                                                isFinal={isLastRound && m.kind === 'main'}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        {/* 荣誉冠军展台（接在决赛右侧） */}
                        <div className="flex shrink-0 items-center">
                            <ChevronRight className="h-6 w-6 text-slate-300 mr-2"/>
                            <ChampionHonorPodium
                                event={event}
                                names={names}
                                hoveredActorId={hoveredActorId}
                                onHoverActor={setHoveredActorId}
                            />
                        </div>
                    </div>
                </section>
            ) : (
                /* 传统每日轮次表清单 */
                <div className="space-y-4">
                    {event.rounds.map(round => (
                        <section key={round.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                    <Swords className="h-4 w-4 text-orange-500"/>
                                    {getRoundTitle(round)}
                                    <span className="text-xs font-normal text-slate-400">第 {round.number} 轮</span>
                                </h3>
                                <span className="text-xs text-slate-500">
                                    {dateLabel(round.scheduledAt)} · {round.status === 'done' ? '已完成' : '等待开赛'}
                                </span>
                            </div>
                            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                                {round.matches.map(match => (
                                    <MatchCard
                                        key={match.id}
                                        match={match}
                                        names={names}
                                        hoveredActorId={hoveredActorId}
                                        onHoverActor={setHoveredActorId}
                                        onMatch={onMatch}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
