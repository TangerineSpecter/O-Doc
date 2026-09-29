import {useEffect, useState} from 'react';
import {getLifeProfile, getLifeGoals, saveLifeProfile} from '../../api/agentLife';
import type {LifeProfile, LifeGoal} from '../../types/api/agentLife';
import LifeGoalEditor from './LifeGoalEditor';
import {goalStatusLabels} from './lifeLabels';
export default function LifeProfilePanel({actorId}: {actorId: string}) {
    const [profile, setProfile] = useState<LifeProfile | null>(null);
    const [goals, setGoals] = useState<LifeGoal[]>([]);
    const [goalPage, setGoalPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [editing, setEditing] = useState<LifeGoal | 'new' | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController(); setBusy(true); setError(''); setProfile(null);
        Promise.all([getLifeProfile(actorId, controller.signal), getLifeGoals(actorId, controller.signal)])
            .then(([p, g]) => {if (!controller.signal.aborted) {setProfile(p); setGoals(g); setGoalPage(1); setHasMore(g.length === 100);}})
            .catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '生活资料加载失败');})
            .finally(() => {if (!controller.signal.aborted) setBusy(false);});
        return () => controller.abort();
    }, [actorId, revision]);
    const save = async () => {if (!profile) return; setBusy(true); try {await saveLifeProfile(actorId, profile); setError('');} catch(e) {setError(e instanceof Error ? e.message : '保存失败');} finally {setBusy(false);}};
    const loadMore = async () => {setBusy(true); try {const values = await getLifeGoals(actorId, undefined, goalPage + 1); setGoals(current => [...current, ...values]); setGoalPage(current => current + 1); setHasMore(values.length === 100);} catch(e) {setError(e instanceof Error ? e.message : '历史目标加载失败');} finally {setBusy(false);}};
    return <div className="space-y-4">
        {busy && <p className="text-sm text-slate-400">正在处理生活资料…</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}<button type="button" onClick={() => setRevision(v => v + 1)} className="ml-3 underline">重试</button></p>}
        {profile && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="font-semibold text-slate-800">生活偏好与方向</h4>
            <label className="block space-y-2 text-sm"><span>生活偏好</span><textarea rows={3} value={profile.preferences} onChange={e => setProfile({...profile, preferences: e.target.value})} placeholder="例如喜欢旅行、偏好稳健投资、重视农场经营" className="w-full rounded-xl border border-slate-200 p-3"/></label>
            <label className="block space-y-2 text-sm"><span>生活方向</span><textarea rows={3} value={profile.direction} onChange={e => setProfile({...profile, direction: e.target.value})} className="w-full rounded-xl border border-slate-200 p-3"/></label>
            <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-orange-500 px-4 py-2 text-sm text-white disabled:opacity-50">保存生活资料</button>
        </section>}
        {profile && <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between"><h4 className="font-semibold">远期目标</h4><button type="button" onClick={() => setEditing('new')} className="text-sm text-orange-600">新增目标</button></div>
            {!goals.length && <p className="text-sm text-slate-400">暂无目标，居民仍可根据性格和偏好规划。</p>}
            {goals.map(goal => <button key={goal.id} type="button" onClick={() => setEditing(goal)} className="block w-full rounded-xl bg-slate-50 p-4 text-left"><div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-800">{goal.title}</span><span className="text-xs text-slate-500">{goalStatusLabels[goal.status]}</span></div><p className="mt-2 text-sm text-slate-500">{goal.progress || goal.condition.description || '尚无进展记录'}</p></button>)}
        </section>}
        {hasMore && <button type="button" disabled={busy} onClick={() => void loadMore()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 disabled:opacity-50">加载更多历史目标</button>}
        {editing && <LifeGoalEditor actorId={actorId} goal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => {setEditing(null); setRevision(v => v + 1);}}/>}
    </div>;
}
