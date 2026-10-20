import {useState} from 'react';
import WorldDialog from '../WorldDialog';
import {Select} from '../../common/Select';
import {createBounty} from '../../../api/bounty';
import type {BountyOptions} from '../../../types/api/bounty';

export default function BountyCreateDialog({options, onClose, onCreated}: {
    options: BountyOptions | null;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [title, setTitle] = useState('');
    const [objective, setObjective] = useState('');
    const [requirements, setRequirements] = useState('');
    const [collectionId, setCollectionId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [reward, setReward] = useState('50');
    const [agentIds, setAgentIds] = useState<string[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const residents = options?.residents || [];
    const activeCollectionId = collectionId || options?.collections[0]?.id || '';
    const activeCategoryId = categoryId || options?.categories[0]?.id || '';
    const selectedAgents = agentIds ?? residents.map(row => row.id);
    const allSelected = residents.length > 0 && selectedAgents.length === residents.length;

    const toggleAgent = (id: string) => {
        const base = agentIds ?? residents.map(row => row.id);
        setAgentIds(base.includes(id) ? base.filter(value => value !== id) : [...base, id]);
    };

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            await createBounty({
                title: title.trim(), objective: objective.trim(), requirements: requirements.trim(),
                collectionId: activeCollectionId, categoryId: activeCategoryId, reward,
                agentIds: selectedAgents,
            });
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : '悬赏发布失败');
        } finally {
            setBusy(false);
        }
    };

    const valid = Boolean(title.trim() && objective.trim() && activeCollectionId && activeCategoryId
        && Number(reward) > 0 && selectedAgents.length && options?.searchReady);

    return (
        <WorldDialog title="发布悬赏" description="发布 10 分钟后按资金加权抽签，逐个询问居民是否接单。" size="compact" onClose={onClose}>
            <div className="space-y-4 p-1">
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                    悬赏不占用居民日程额度，由居民在后台调研并在指定文集、分类下发帖；交付后由你验收，通过才发放世界币。
                </p>
                {!options?.searchReady && (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                        还没有可用的 Tavily 搜索服务，请先在 MCP 设置中启用后再发布调研类悬赏。
                    </p>
                )}

                <label className="block space-y-2 text-sm">
                    <span className="font-medium text-slate-700">悬赏标题</span>
                    <input value={title} onChange={event => setTitle(event.target.value)} maxLength={200}
                           placeholder="例如：调研 last meeting theory 并写一篇感情分类帖子"
                           className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"/>
                </label>

                <label className="block space-y-2 text-sm">
                    <span className="font-medium text-slate-700">目标（要做什么）</span>
                    <textarea value={objective} onChange={event => setObjective(event.target.value)} rows={3} maxLength={4000}
                              placeholder="写清调研对象、要回答的问题和发帖主题"
                              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"/>
                </label>

                <label className="block space-y-2 text-sm">
                    <span className="font-medium text-slate-700">交付要求（可选）</span>
                    <textarea value={requirements} onChange={event => setRequirements(event.target.value)} rows={2} maxLength={4000}
                              placeholder="例如：正文需包含调研结论、至少一段个人感想，并引用真实来源"
                              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"/>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2 text-sm">
                        <span className="font-medium text-slate-700">发到文集</span>
                        <Select menuPortal value={activeCollectionId}
                                options={(options?.collections || []).map(row => ({value: row.id, label: row.title}))}
                                onChange={setCollectionId} placeholder="选择 Agent 文集"/>
                    </label>
                    <label className="block space-y-2 text-sm">
                        <span className="font-medium text-slate-700">帖子分类</span>
                        <Select menuPortal value={activeCategoryId}
                                options={(options?.categories || []).map(row => ({value: row.id, label: row.name}))}
                                onChange={setCategoryId} placeholder="选择帖子分类"/>
                    </label>
                </div>

                <label className="block space-y-2 text-sm">
                    <span className="font-medium text-slate-700">完成后奖励（世界币）</span>
                    <input type="number" min="0.01" step="0.01" value={reward} onChange={event => setReward(event.target.value)}
                           className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"/>
                </label>

                <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">可领取居民</span>
                        <button type="button"
                                onClick={() => setAgentIds(allSelected ? [] : residents.map(row => row.id))}
                                className="text-[11px] font-medium text-orange-600">
                            {allSelected ? '全不选' : '全选'}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {residents.map(row => {
                            const selected = selectedAgents.includes(row.id);
                            return (
                                <button key={row.id} type="button" onClick={() => toggleAgent(row.id)}
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                            selected ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500'
                                        }`}>
                                    {row.name} · {row.money}
                                </button>
                            );
                        })}
                        {!residents.length && <p className="text-[11px] text-slate-400">当前账号还没有居民</p>}
                    </div>
                    <p className="text-[11px] text-slate-400">资金越少的居民被抽到询问的顺序越靠前；先表示接受的人获得任务。</p>
                </div>

                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={onClose}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600">取消</button>
                    <button type="button" disabled={busy || !valid} onClick={() => void submit()}
                            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50">
                        {busy ? '发布中…' : '发布悬赏'}
                    </button>
                </div>
            </div>
        </WorldDialog>
    );
}
