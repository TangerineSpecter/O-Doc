import MomentsTabs from './MomentsTabs';
import {useState, useEffect} from 'react';
import {MessageCircle, RefreshCw, Settings, PenLine} from 'lucide-react';
import WorldDialog from './WorldDialog';
import MomentComposerDialog from './MomentComposerDialog';
import MomentCard from './MomentCard';
import SocialSettingsDialog from './SocialSettingsDialog';
import {useMoments} from '../../hooks/useMoments';
import {getSocialConfiguration, readSocialNotification} from '../../api/social';
import {Select} from '../common/Select';

export default function MomentsDialog({onClose, initialMomentId}: {onClose: () => void; initialMomentId?: string}) {
    const [filter, setFilter] = useState('all');
    const [actor, setActor] = useState('me');
    const [settings, setSettings] = useState(false);
    const [composing, setComposing] = useState(false);
    const [focused, setFocused] = useState(initialMomentId || '');
    const [residents, setResidents] = useState<{id: string; name: string}[]>([]);
    useEffect(() => {let active = true; void getSocialConfiguration().then(c => {if (active) setResidents(c.agents);}).catch(() => {}); return () => {active = false;};}, []);
    const state = useMoments(filter, actor);
    const people = [...new Map([...residents.map(a => [`agent-id:${a.id}`, a.name] as const), ...state.items.map(m => [m.actorId, m.identity.name] as const)]).entries()];
    return <><WorldDialog title="朋友圈" description="世界里的小事、心情与不同看法。" size="wide" onClose={onClose}>
        <div className="flex h-full min-h-0 flex-col">
        <div className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3">
            <MomentsTabs value={filter} onChange={value => {setFilter(value); setFocused('');}}/>
            <div className="flex items-center gap-3"><button type="button" onClick={() => setComposing(true)} className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600"><PenLine className="h-4 w-4"/>发布</button><button type="button" aria-label="刷新朋友圈" onClick={() => void state.reload()} className="text-slate-400"><RefreshCw className={`h-4 w-4 ${state.loading ? 'animate-spin' : ''}`}/></button><button type="button" onClick={() => setSettings(v => !v)} className="flex items-center gap-1.5 text-xs text-slate-500"><Settings className="h-4 w-4"/>社交设置</button></div>
        </div>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-5 lg:grid-cols-[minmax(0,1fr)_240px] lg:grid-rows-1">
            <main className="min-h-0 min-w-0 space-y-4 overflow-y-auto pb-1 scrollbar-hide">
                {filter === 'person' && <Select value={actor} onChange={setActor} menuPortal options={[{value: 'me', label: '我的朋友圈'}, ...people.map(([id, name]) => ({value: id, label: name || '世界居民'}))]}/>}
                {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-600">{state.error}</p>}
                {!state.loading && !state.error && !state.items.length && <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-400">还没有生活分享，先写下今天的一件小事。</div>}
                {state.loading && !state.items.length && <div role="status" aria-live="polite" className="space-y-4"><span className="sr-only">正在加载动态…</span>{[0, 1].map(i => <div key={i} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5"><div className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 motion-safe:animate-pulse"/><div className="flex-1 space-y-3"><div className="h-4 w-20 rounded bg-slate-100"/><div className="h-3 w-full rounded bg-slate-100"/><div className="h-3 w-4/5 rounded bg-slate-100"/><div className="h-3 w-24 rounded bg-slate-100"/></div></div>)}</div>}
                {!!state.items.length && <div key={filter === 'person' ? `${filter}:${actor}` : filter} className="world-dialog-content-enter space-y-4">{state.items.map(moment => <MomentCard key={moment.id} moment={moment} focused={focused === moment.id} onChanged={() => void state.reload()}/>)}</div>}
                {state.cursor && <button disabled={state.loading} type="button" onClick={() => void state.reload(true)} className="w-full rounded-xl border border-slate-200 bg-white py-3 text-xs text-slate-500">{state.loading ? '加载中…' : '查看更早的动态'}</button>}
            </main>
            <aside className="min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm scrollbar-hide">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><MessageCircle className="h-4 w-4 text-orange-500"/>与我有关{state.notifications.some(n => !n.readAt) && <span className="h-1.5 w-1.5 rounded-full bg-orange-500"/>}</h3>
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto scrollbar-hide">{state.notifications.map(n => <button key={n.id} type="button" onClick={() => {void readSocialNotification(n.id).then(() => state.reload()); if (n.sourceKind === 'moment') {setFilter('related'); setFocused(n.contentId);} else if (n.contentUrl) window.location.assign(n.contentUrl);}} className={`w-full rounded-xl p-3 text-left text-xs ${n.readAt ? 'bg-slate-50 text-slate-500' : 'bg-orange-50 text-slate-700'}`}><strong>{n.identity.name || '参与者'}</strong><span className="mt-1 block">{n.sourceKind === 'moment' ? '回复了朋友圈讨论' : '回复了帖子讨论'}</span></button>)}{!state.notifications.length && <p className="py-4 text-xs text-slate-400">收到评论和回复后，会显示在这里。</p>}</div>
            </aside>
        </div>
        </div>
    </WorldDialog>{composing && <MomentComposerDialog onClose={() => setComposing(false)} onPublished={() => void state.reload()}/>}{settings && <SocialSettingsDialog onClose={() => setSettings(false)} onSaved={() => void state.reload()}/>}</>;
}
