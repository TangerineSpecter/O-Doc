import {useState} from 'react';
import {ArrowLeft, ChevronDown, Gift, RefreshCw} from 'lucide-react';
import {useOpenTaskAllocation} from '../../hooks/useOpenTaskAllocation';
import {useTournament} from '../../hooks/useTournament';
import {DecisionProcessInfo} from '../AgentWorld/DecisionProcessInfo';
import {TournamentRewards} from './TournamentRewards';
import {TournamentReport} from './TournamentReport';
import {TournamentBracket} from './TournamentBracket';
import {TournamentHistoryList} from './TournamentHistoryList';
import {TournamentArtDialog} from './TournamentArtDialog';
import {useTournamentArt} from './useTournamentArt';
import {usePortraitImage} from '../Combat/useLoadoutPortrait';
import WorldDialog from '../AgentWorld/WorldDialog';
import {dateLabel, statusLabel} from './tournamentLabels';
import type {TournamentDetail} from '../../types/api/tournament';

interface TournamentPanelProps {
    residents?: {id: string; name: string; avatar?: string}[];
}

function TournamentCompletedArt({event, onMatch, residents}: {event: TournamentDetail; onMatch: (id: string) => void; residents?: {id: string; name: string; avatar?: string}[]}) {
    const [artOpen, setArtOpen] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const art = useTournamentArt(event.id, '');
    const image = usePortraitImage(art.data?.assetId);
    return <>
        <TournamentBracket event={event} onMatch={onMatch} residents={residents} backgroundImage={image.url} onPreview={image.url ? () => setPreviewOpen(true) : undefined}/>
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div><p className="font-semibold text-slate-800">决战纪念图</p><p className="mt-1 text-xs text-slate-500">{art.error || image.error || (art.data?.assetId ? '已展示在晋级图背景' : art.data ? '为本届决赛留下一张画面' : '正在读取纪念图…')}</p></div>
            <button type="button" onClick={() => setArtOpen(true)} className="shrink-0 rounded-lg border border-orange-200 px-3 py-2 text-sm font-medium text-orange-700">查看与制作</button>
        </section>
        {artOpen && <TournamentArtDialog event={event} onClose={() => {setArtOpen(false); art.reload();}}/>}
        {previewOpen && image.url && <WorldDialog title="决赛纪念图" onClose={() => setPreviewOpen(false)} size="wide" fixedHeight={false}><img src={image.url} alt="本届武道大会决赛纪念图" className="mx-auto block max-h-[75vh] w-auto max-w-full rounded-xl object-contain"/></WorldDialog>}
    </>;
}

function TournamentRewardsCollapsible({
    event,
    residents,
}: {
    event: TournamentDetail;
    residents?: {id: string; name: string; avatar?: string}[];
}) {
    const [open, setOpen] = useState(true);
    const grantedCount = event.rewards.filter(r => r.status === 'granted').length;
    const badgeText = event.status === 'completed' && grantedCount > 0
        ? `3 档奖励已发放 (${grantedCount}/3)`
        : event.status === 'active'
        ? '3 档荣誉奖励竞逐中'
        : event.status === 'skipped'
        ? '未开赛 · 不设奖'
        : '3 档荣誉奖励';

    return (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden transition-all">
            <button
                type="button"
                onClick={() => setOpen(prev => !prev)}
                className="flex w-full items-center justify-between px-4 sm:px-5 py-3.5 text-left transition-colors hover:bg-slate-50/70"
                aria-expanded={open}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60 shadow-2xs">
                        <Gift className="h-4 w-4" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-800">本届奖励与发放详情</span>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {badgeText}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                    <span>{open ? '收起' : '展开详情'}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                </div>
            </button>
            {open && (
                <div className="border-t border-slate-100 p-4 sm:p-5 pt-3">
                    <TournamentRewards event={event} residents={residents} />
                </div>
            )}
        </section>
    );
}

export default function TournamentPanel({residents}: TournamentPanelProps = {}) {
    const state = useTournament();
    const openTasks = useOpenTaskAllocation();
    const event = state.data?.event;

    return (
        <div className="space-y-3">
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
                    <button type="button" onClick={openTasks} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">任务分配</button>
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
                state.historyError ? (
                    <section className="rounded-2xl border border-red-200 bg-red-50/50 p-5 shadow-sm">
                        <p role="alert" className="text-sm text-red-600">{state.historyError}</p>
                    </section>
                ) : !state.history ? (
                    <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                        <p className="text-sm text-slate-400">正在读取历届记录…</p>
                    </section>
                ) : (
                    <TournamentHistoryList
                        history={state.history}
                        page={state.page}
                        onPageChange={state.setPage}
                        onSelectEvent={state.chooseEvent}
                        residents={residents}
                    />
                )
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
                                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
                                    <span className="font-semibold text-slate-800">{event ? `${event.week} 周赛 · ${event.participantCount} 位参赛居民 · ${statusLabel[event.status]}` : '擂台静候开赛'}</span>
                                    <span>{event?.nextRoundAt ? `下一轮 ${dateLabel(event.nextRoundAt)}` : `下次抽签 ${dateLabel(state.data.nextDrawAt)}`} · 北京时间</span>
                                    {!state.data.autoEnabled && <p className="w-full text-amber-700">世界自动运行已关闭，大会暂停执行。</p>}
                                </div>
                                {event && (
                                    <>
                                        {state.matchId && (
                                            <TournamentReport
                                                match={state.match}
                                                error={state.matchError}
                                                onClose={() => state.setMatchId('')}
                                                residents={residents}
                                                roster={event?.roster}
                                            />
                                        )}
                                        {event.status === 'completed' ? <TournamentCompletedArt key={event.id} event={event} onMatch={state.setMatchId} residents={residents}/> : <TournamentBracket event={event} onMatch={state.setMatchId} residents={residents}/>}
                                        <TournamentRewardsCollapsible event={event} residents={residents} />
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
