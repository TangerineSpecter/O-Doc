import {useEffect, useState} from 'react';
import {getTheatreParticipantOptions} from '../../api/social';
import {Select} from '../common/Select';
import {Checkbox} from '../common/Checkbox';

export default function ManualTheatreForm({busy, onSubmit}: {
    busy: boolean; onSubmit: (topic: string, participantIds: string[]) => void;
}) {
    const [topic, setTopic] = useState('');
    const [mode, setMode] = useState('automatic');
    const [participants, setParticipants] = useState<{id: string; name: string}[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        if (mode !== 'specified') return;
        let active = true;
        setLoading(true);
        setError('');
        void getTheatreParticipantOptions().then(result => {
            if (!active) return;
            setParticipants(result.participants);
            setSelected(current => current.filter(id => result.participants.some(person => person.id === id)));
        }).catch(reason => {
            if (active) setError(reason instanceof Error ? reason.message : '参与居民加载失败');
        }).finally(() => {if (active) setLoading(false);});
        return () => {active = false;};
    }, [mode, retry]);
    const valid = mode === 'automatic' || (!loading && !error && selected.length >= 2 && selected.length <= 3);
    const submit = (value: string) => {if (valid && !busy) onSubmit(value, mode === 'specified' ? selected : []);};
    return <form className="mb-3 max-h-[45vh] shrink-0 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 scrollbar-hide" onSubmit={event => {event.preventDefault(); if (topic.trim()) submit(topic.trim());}}>
        <label htmlFor="theatre-manual-topic" className="block text-sm font-semibold text-slate-800">指定讨论议题</label>
        <p className="mt-1 text-xs leading-5 text-slate-500">搜索相关资料后邀请居民讨论。最多随机安排2～3轮；一轮无人继续发言时提前结束。</p>
        <div className="mt-3 flex flex-wrap gap-2">
            <input id="theatre-manual-topic" value={topic} onChange={event => setTopic(event.target.value)} maxLength={200} placeholder="例如：人工智能会怎样改变日常生活？" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"/>
            <button type="submit" disabled={busy || !topic.trim() || !valid} className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">搜索并讨论</button>
            <button type="button" disabled={busy || !valid} onClick={() => submit('')} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">随机新闻</button>
        </div>
        <div className="mt-3 space-y-2">
            <span className="block text-xs font-semibold text-slate-700">参与居民</span>
            <Select ariaLabel="讨论参与方式" value={mode} onChange={setMode} menuPortal={true} disabled={busy} options={[{value: 'automatic', label: '自动分配（默认）'}, {value: 'specified', label: '指定居民'}]}/>
            {mode === 'automatic' ? <p className="text-xs text-slate-500">开始时从可用居民中随机分配2～3人。</p> : <>
                <p className="text-xs text-slate-500">选择2～3人，已选{selected.length}人。指定居民忙碌时等待重试，不替换其他人。</p>
                {loading ? <p role="status" className="text-xs text-slate-500">正在加载可选居民…</p> : error ? <p role="alert" className="text-xs text-red-600">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline">重试</button></p> : !participants.length ? <p className="text-xs text-slate-500">暂无已启用社交且配置聊天模型的居民。</p> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {participants.map(person => <Checkbox key={person.id} checked={selected.includes(person.id)} label={person.name} disabled={busy || (!selected.includes(person.id) && selected.length >= 3)} onChange={checked => setSelected(current => checked ? [...current, person.id] : current.filter(id => id !== person.id))} className="rounded-xl border border-slate-200 bg-white px-3 py-2"/>)}
                </div>}
            </>}
        </div>
    </form>;
}
