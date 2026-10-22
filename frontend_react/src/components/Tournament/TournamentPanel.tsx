import {ArrowLeft, ChevronLeft, ChevronRight, Clock3, RefreshCw, Trophy, Users} from 'lucide-react';
import {useTournament} from '../../hooks/useTournament';
import {DecisionProcessInfo} from '../AgentWorld/DecisionProcessInfo';
import {TournamentRewards} from './TournamentRewards';
import {TournamentReport} from './TournamentReport';
import {TournamentBracket} from './TournamentBracket';
import {dateLabel, statusLabel} from './tournamentLabels';

export default function TournamentPanel() {
    const state = useTournament();
    const event = state.data?.event;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1">
                    {(['current', 'history'] as const).map(tab => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => state.setTab(tab)}
                            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                                state.tab === tab
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {tab === 'current' ? '本届大会' : '历届记录'}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    <DecisionProcessInfo kind="tournament"/>
                    <button
                        type="button"
                        onClick={state.reload}
                        aria-label="刷新大会"
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-orange-600"
                    >
                        <RefreshCw className="h-4 w-4"/>
                    </button>
                </div>
            </div>

            {state.tab === 'history' ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    {state.historyError ? (
                        <p role="alert" className="text-sm text-red-600">{state.historyError}</p>
                    ) : !state.history ? (
                        <p className="text-sm text-slate-400">正在读取历届记录…</p>
                    ) : (
                        <>
                            {!state.history.items.length && (
                                <p className="py-8 text-center text-sm text-slate-400">还没有结束的大会</p>
                            )}
                            <div className="divide-y divide-slate-100">
                                {state.history.items.map(row => (
                                    <button
                                        key={row.id}
                                        type="button"
                                        onClick={() => state.chooseEvent(row.id)}
                                        className="flex w-full items-center justify-between gap-3 py-4 text-left transition-colors hover:text-orange-600"
                                    >
                                        <span className="text-sm font-semibold">
                                            {row.week} 周赛{' '}
                                            <span className="ml-2 text-xs font-normal text-slate-400">
                                                {row.participantCount} 人
                                            </span>
                                        </span>
                                        <span className="flex items-center gap-2 text-xs text-slate-500">
                                            {statusLabel[row.status]}
                                            <ChevronRight className="h-4 w-4"/>
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <div className="mt-3 flex items-center justify-end gap-3 text-xs text-slate-500">
                                <button
                                    type="button"
                                    aria-label="上一页"
                                    disabled={state.page <= 1}
                                    onClick={() => state.setPage(p => p - 1)}
                                    className="rounded-lg border border-slate-200 p-1 disabled:opacity-30"
                                >
                                    <ChevronLeft className="h-4 w-4"/>
                                </button>
                                <span>第 {state.page} 页 · 共 {state.history.total} 届</span>
                                <button
                                    type="button"
                                    aria-label="下一页"
                                    disabled={state.page * 20 >= state.history.total}
                                    onClick={() => state.setPage(p => p + 1)}
                                    className="rounded-lg border border-slate-200 p-1 disabled:opacity-30"
                                >
                                    <ChevronRight className="h-4 w-4"/>
                                </button>
                            </div>
                        </>
                    )}
                </section>
            ) : (
                <>
                    {state.eventId && (
                        <button
                            type="button"
                            onClick={() => state.chooseEvent('')}
                            className="inline-flex items-center gap-1 text-xs text-orange-600 transition-colors hover:text-orange-700"
                        >
                            <ArrowLeft className="h-3 w-3"/>
                            返回本届大会
                        </button>
                    )}
                    {state.error && (
                        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{state.error}</p>
                    )}
                    {state.loading && !state.data ? (
                        <p className="py-10 text-center text-sm text-slate-400">正在读取武道大会…</p>
                    ) : (
                        state.data && (
                            <>
                                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="mb-2 text-xs font-semibold tracking-widest text-orange-600">
                                                每周争锋 · 武道大会
                                            </p>
                                            <h2 className="text-xl font-bold text-slate-900">
                                                {event ? `${event.week} 周赛` : '擂台静候开赛'}
                                            </h2>
                                        </div>
                                        <Trophy className="h-10 w-10 shrink-0 text-amber-500"/>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                                        <span className="inline-flex items-center gap-1">
                                            <Users className="h-3.5 w-3.5"/>
                                            {event
                                                ? `${event.participantCount} 位参赛居民 · ${statusLabel[event.status]}`
                                                : '已有战斗档案的居民自动参赛'}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <Clock3 className="h-3.5 w-3.5"/>
                                            {event?.nextRoundAt
                                                ? `下一轮 ${dateLabel(event.nextRoundAt)}`
                                                : `下次抽签 ${dateLabel(state.data.nextDrawAt)}`}{' '}
                                            · 北京时间
                                        </span>
                                    </div>
                                    {!state.data.autoEnabled && (
                                        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                                            世界自动运行已关闭，大会暂停执行。开启后补完已创建赛事的到期轮次。
                                        </p>
                                    )}
                                    <p className="mt-3 text-xs leading-5 text-slate-400">
                                        周日 14:00 抽签，周一至周六每天 14:00 一轮。参赛人数超过 64 人时当天进行资格附加赛；奇数轮空，比赛不消耗探索资源。
                                    </p>
                                </section>
                                {event && (
                                    <>
                                        <TournamentRewards event={event}/>
                                        {state.matchId && (
                                            <TournamentReport
                                                match={state.match}
                                                error={state.matchError}
                                                onClose={() => state.setMatchId('')}
                                            />
                                        )}
                                        <TournamentBracket event={event} onMatch={state.setMatchId}/>
                                    </>
                                )}
                            </>
                        )
                    )}
                </>
            )}
        </div>
    );
}
