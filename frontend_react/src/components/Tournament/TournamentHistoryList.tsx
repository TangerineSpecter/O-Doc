import type {SetStateAction} from 'react';
import {AlertCircle, ChevronLeft, ChevronRight, History, Medal, Trophy, Users} from 'lucide-react';
import type {TournamentHistory} from '../../types/api/tournament';
import {statusLabel} from './tournamentLabels';
import {TournamentAvatar} from './TournamentAvatar';

interface TournamentHistoryListProps {
    history: TournamentHistory;
    page: number;
    onPageChange: (updater: SetStateAction<number>) => void;
    onSelectEvent: (id: string) => void;
    residents?: {id: string; name: string; avatar?: string}[];
}

export function TournamentHistoryList({
    history,
    page,
    onPageChange,
    onSelectEvent,
    residents,
}: TournamentHistoryListProps) {
    const totalPages = Math.max(1, Math.ceil(history.total / 20));

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            {/* 列表头部概览 */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600 border border-orange-200/60 shadow-2xs">
                        <History className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">历届武道盛会记录</h3>
                        <p className="text-[11px] text-slate-400">回顾各届周赛对阵、参赛居民与三甲荣耀</p>
                    </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    共收录 {history.total} 届赛事
                </span>
            </div>

            {/* 赛事条目列表 */}
            {!history.items.length ? (
                <div className="py-12 text-center text-sm text-slate-400">还没有结束的大会</div>
            ) : (
                <div className="mt-3 space-y-3">
                    {history.items.map(row => {
                        const names = Object.fromEntries([
                            ...(residents || []).map(r => [r.id, r.name] as const),
                            ...row.roster.map(r => [r.id, r.name] as const),
                        ]);
                        const avatars = Object.fromEntries([
                            ...(residents || []).map(r => [r.id, r.avatar || ''] as const),
                            ...row.roster.map(r => [r.id, r.avatar || ''] as const),
                        ]);

                        const champId = row.result.podium?.['1'];
                        const secondId = row.result.podium?.['2'];
                        const thirdId = row.result.podium?.['3'];
                        const hasPodium = Boolean(champId || secondId || thirdId);

                        return (
                            <div
                                key={row.id}
                                onClick={() => onSelectEvent(row.id)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onSelectEvent(row.id);
                                    }
                                }}
                                className="group relative rounded-xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-2xs transition-all hover:border-orange-300 hover:shadow-md cursor-pointer"
                            >
                                <div className="flex flex-col gap-3">
                                    {/* 顶部标题与状态 */}
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-base font-bold text-slate-900 group-hover:text-orange-600 transition-colors">
                                                {row.week} 周赛
                                            </span>
                                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                                <Users className="h-3 w-3 text-slate-400" />
                                                {row.participantCount} 人参赛
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                                    row.status === 'completed'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                                                        : row.status === 'skipped'
                                                        ? 'bg-slate-100 text-slate-600 border-slate-200/80'
                                                        : 'bg-blue-50 text-blue-700 border-blue-200/80'
                                                }`}
                                            >
                                                {row.status === 'completed' && (
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                )}
                                                {statusLabel[row.status]}
                                            </span>
                                        </div>
                                    </div>

                                    {/* 中间内容区域：完赛荣誉榜 or 未开赛说明 */}
                                    {row.status === 'completed' && hasPodium ? (
                                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-lg bg-slate-50/70 p-2 sm:p-2.5 border border-slate-100">
                                            {champId && (
                                                <div className="flex items-center gap-1.5 rounded-lg border border-amber-200/70 bg-amber-50/80 px-2 py-1 shadow-2xs">
                                                    <Trophy className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                                    <TournamentAvatar
                                                        name={names[champId]}
                                                        avatar={avatars[champId]}
                                                        place={1}
                                                        size="xs"
                                                    />
                                                    <div className="flex items-center gap-1 min-w-0 leading-none">
                                                        <span className="shrink-0 text-[11px] font-bold text-amber-700">冠军</span>
                                                        <span className="truncate max-w-[80px] text-xs font-bold text-amber-950">
                                                            {names[champId] || champId}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {secondId && (
                                                <div className="flex items-center gap-1.5 rounded-lg border border-blue-200/70 bg-blue-50/50 px-2 py-1 shadow-2xs">
                                                    <Medal className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                                    <TournamentAvatar
                                                        name={names[secondId]}
                                                        avatar={avatars[secondId]}
                                                        place={2}
                                                        size="xs"
                                                    />
                                                    <div className="flex items-center gap-1 min-w-0 leading-none">
                                                        <span className="shrink-0 text-[11px] font-bold text-blue-700">亚军</span>
                                                        <span className="truncate max-w-[80px] text-xs font-bold text-slate-800">
                                                            {names[secondId] || secondId}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {thirdId && (
                                                <div className="flex items-center gap-1.5 rounded-lg border border-orange-200/70 bg-orange-50/50 px-2 py-1 shadow-2xs">
                                                    <Medal className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                                                    <TournamentAvatar
                                                        name={names[thirdId]}
                                                        avatar={avatars[thirdId]}
                                                        place={3}
                                                        size="xs"
                                                    />
                                                    <div className="flex items-center gap-1 min-w-0 leading-none">
                                                        <span className="shrink-0 text-[11px] font-bold text-orange-800">季军</span>
                                                        <span className="truncate max-w-[80px] text-xs font-bold text-slate-800">
                                                            {names[thirdId] || thirdId}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : row.status === 'skipped' ? (
                                        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-500">
                                            <AlertCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                            <span>
                                                参赛人数未达 4 人标准，赛事自动取消未开赛，居民精力与准备状态已完整保留。
                                            </span>
                                        </div>
                                    ) : null}

                                    {/* 底部引导栏 */}
                                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                                        <span>
                                            {row.endedAt
                                                ? `完赛于 ${row.endedAt.slice(0, 10)}`
                                                : `创建于 ${row.createdAt.slice(0, 10)}`}
                                        </span>
                                        <span className="inline-flex items-center gap-1 font-semibold text-slate-500 group-hover:text-orange-600 transition-colors">
                                            查看赛程对阵与详情
                                            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 分页控制器 */}
            {history.total > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>
                        第 <strong className="text-slate-800">{page}</strong> 页 · 共{' '}
                        <strong className="text-slate-800">{history.total}</strong> 届赛事
                    </span>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            aria-label="上一页"
                            disabled={page <= 1}
                            onClick={e => {
                                e.stopPropagation();
                                onPageChange(p => p - 1);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-600"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            上一页
                        </button>
                        <span className="px-1 text-slate-400 font-mono">
                            {page} / {totalPages}
                        </span>
                        <button
                            type="button"
                            aria-label="下一页"
                            disabled={page * 20 >= history.total}
                            onClick={e => {
                                e.stopPropagation();
                                onPageChange(p => p + 1);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-600"
                        >
                            下一页
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
