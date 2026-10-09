import MomentsTabs from './MomentsTabs';
import {useState, useEffect} from 'react';
import {Bell, RefreshCw, Settings, PenLine} from 'lucide-react';
import WorldDialog from './WorldDialog';
import MomentComposerDialog from './MomentComposerDialog';
import MomentCard from './MomentCard';
import SocialSettingsDialog from './SocialSettingsDialog';
import MomentsInboxDialog from './MomentsInboxDialog';
import {useMoments} from '../../hooks/useMoments';
import {getSocialConfiguration, readSocialNotification} from '../../api/social';
import type {SocialNotification} from '../../types/api/social';
import {Select} from '../common/Select';

export default function MomentsDialog({onClose, initialMomentId}: {onClose: () => void; initialMomentId?: string}) {
    const [filter, setFilter] = useState('all');
    const [actor, setActor] = useState('me');
    const [settings, setSettings] = useState(false);
    const [composing, setComposing] = useState(false);
    const [inboxOpen, setInboxOpen] = useState(false);
    const [focused, setFocused] = useState(initialMomentId || '');
    const [residents, setResidents] = useState<{id: string; name: string}[]>([]);
    useEffect(() => {let active = true; void getSocialConfiguration().then(c => {if (active) setResidents(c.agents);}).catch(() => {}); return () => {active = false;};}, []);
    const state = useMoments(filter, actor);
    const people = [...new Map([...residents.map(a => [`agent-id:${a.id}`, a.name] as const), ...state.items.map(m => [m.actorId, m.identity.name] as const)]).entries()];
    const unreadCount = state.notifications.filter(n => !n.readAt).length;

    const handleSelectNotification = (n: SocialNotification) => {
        void readSocialNotification(n.id).then(() => state.reload());
        setInboxOpen(false);
        if (n.sourceKind === 'moment') {
            setFilter('related');
            setFocused(n.contentId);
        } else if (n.contentUrl) {
            window.location.assign(n.contentUrl);
        }
    };

    return <>
        <WorldDialog title="朋友圈" description="世界里的小事、心情与不同看法。" size="wide" onClose={onClose}>
            <div className="flex h-full min-h-0 flex-col">
                <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
                    <MomentsTabs value={filter} onChange={value => {setFilter(value); setFocused('');}}/>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <button
                            type="button"
                            onClick={() => setComposing(true)}
                            className="inline-flex items-center shrink-0 gap-1.5 whitespace-nowrap rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600 active:scale-95 transition-all"
                        >
                            <PenLine className="h-4 w-4 shrink-0"/>
                            发布
                        </button>
                        <button
                            type="button"
                            onClick={() => setInboxOpen(true)}
                            className="relative inline-flex items-center shrink-0 gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all"
                            title="互动消息"
                        >
                            <Bell className="h-3.5 w-3.5 shrink-0 text-slate-500"/>
                            <span>消息</span>
                            {unreadCount > 0 && (
                                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white leading-none">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            aria-label="刷新朋友圈"
                            onClick={() => void state.reload()}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:scale-95 transition-colors"
                        >
                            <RefreshCw className={`h-4 w-4 ${state.loading ? 'animate-spin' : ''}`}/>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSettings(v => !v)}
                            className="inline-flex items-center shrink-0 gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                        >
                            <Settings className="h-4 w-4 shrink-0"/>
                            <span className="hidden sm:inline">社交设置</span>
                        </button>
                    </div>
                </div>

                <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-2 scrollbar-hide">
                    <div className="mx-auto max-w-3xl space-y-4">
                        {unreadCount > 0 && (
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-orange-200/80 bg-orange-50/80 px-4 py-2.5 text-xs text-orange-950 shadow-2xs">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <span className="relative flex h-2 w-2 shrink-0">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                                    </span>
                                    <p className="truncate">
                                        收到 <strong className="font-semibold text-orange-600">{unreadCount}</strong> 条新的互动回复
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setInboxOpen(true)}
                                    className="shrink-0 whitespace-nowrap rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-orange-600 active:scale-95 transition-all"
                                >
                                    查看消息
                                </button>
                            </div>
                        )}

                        {filter === 'person' && (
                            <Select
                                value={actor}
                                onChange={setActor}
                                menuPortal
                                options={[
                                    {value: 'me', label: '我的朋友圈'},
                                    ...people.map(([id, name]) => ({value: id, label: name || '世界居民'})),
                                ]}
                            />
                        )}

                        {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-600">{state.error}</p>}
                        {!state.loading && !state.error && !state.items.length && (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
                                还没有生活分享，先写下今天的一件小事。
                            </div>
                        )}
                        {state.loading && !state.items.length && (
                            <div role="status" aria-live="polite" className="space-y-4">
                                <span className="sr-only">正在加载动态…</span>
                                {[0, 1].map(i => (
                                    <div key={i} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                                        <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 motion-safe:animate-pulse"/>
                                        <div className="flex-1 space-y-3">
                                            <div className="h-4 w-20 rounded bg-slate-100"/>
                                            <div className="h-3 w-full rounded bg-slate-100"/>
                                            <div className="h-3 w-4/5 rounded bg-slate-100"/>
                                            <div className="h-3 w-24 rounded bg-slate-100"/>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {!!state.items.length && (
                            <div
                                key={filter === 'person' ? `${filter}:${actor}` : filter}
                                className="world-dialog-content-enter space-y-4"
                            >
                                {state.items.map(moment => (
                                    <MomentCard
                                        key={moment.id}
                                        moment={moment}
                                        focused={focused === moment.id}
                                        onChanged={() => void state.reload()}
                                    />
                                ))}
                            </div>
                        )}
                        {state.cursor && (
                            <button
                                disabled={state.loading}
                                type="button"
                                onClick={() => void state.reload(true)}
                                className="w-full rounded-xl border border-slate-200 bg-white py-3 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                            >
                                {state.loading ? '加载中…' : '查看更早的动态'}
                            </button>
                        )}
                    </div>
                </main>
            </div>
        </WorldDialog>
        {composing && <MomentComposerDialog onClose={() => setComposing(false)} onPublished={() => void state.reload()}/>}
        {settings && <SocialSettingsDialog onClose={() => setSettings(false)} onSaved={() => void state.reload()}/>}
        {inboxOpen && (
            <MomentsInboxDialog
                notifications={state.notifications}
                onClose={() => setInboxOpen(false)}
                onSelectNotification={handleSelectNotification}
            />
        )}
    </>;
}
