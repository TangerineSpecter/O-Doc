import {useEffect, useState} from 'react';
import type {AgentConfig} from '../../types/api/setting';
import {getLifeConfig, runLifeActivity} from '../../api/agentLife';
import {getWorldCategories} from '../../api/agentWorld';
import type {WorldCategory} from '../../types/api/agentWorld';
import {Select} from '../common/Select';
import {useToast} from '../common/ToastProvider';
import WorldDialog from '../AgentWorld/WorldDialog';

export default function LifeManualRunDialog({taskId, agents, publishCategoryIds, onClose}: {
    taskId: string;
    agents: AgentConfig[];
    publishCategoryIds?: string[];
    onClose: () => void;
}) {
    const toast = useToast();
    const [eligible, setEligible] = useState<AgentConfig[]>([]);
    const [actorId, setActorId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [publishCategories, setPublishCategories] = useState<WorldCategory[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(false);
    const [categoriesError, setCategoriesError] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const publishCategoryIdsKey = publishCategoryIds?.join('\u0000') ?? '';
    const isPublishTask = publishCategoryIds !== undefined;

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        getLifeConfig(controller.signal).then(config => {
            if (!controller.signal.aborted) {
                setEligible(agents.filter(agent =>
                    (config.activeAgentIds || config.settings.agentIds).includes(agent.id)
                    && !config.pausedAgents.includes(agent.id)));
            }
        }).catch(error => {
            if (!controller.signal.aborted) setError(error.message || '居民加载失败');
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [agents]);

    useEffect(() => {
        if (!isPublishTask) return;
        let live = true;
        setCategoriesLoading(true);
        setCategoriesError('');
        getWorldCategories().then(categories => {
            if (!live) return;
            const allowedIds = new Set(publishCategoryIdsKey ? publishCategoryIdsKey.split('\u0000') : []);
            const byId = new Map(categories.map(category => [category.id, category]));
            setPublishCategories([...allowedIds]
                .map(id => byId.get(id))
                .filter((category): category is WorldCategory => Boolean(category?.enabled && category.workflowKind !== 'travel')));
        }).catch(error => {
            if (live) setCategoriesError(error instanceof Error ? error.message : '分类加载失败');
        }).finally(() => {
            if (live) setCategoriesLoading(false);
        });
        return () => {live = false;};
    }, [isPublishTask, publishCategoryIdsKey]);

    const run = async () => {
        if (loading || submitting || !eligible.some(agent => agent.id === actorId)) return;
        setSubmitting(true);
        setError('');
        try {
            await runLifeActivity(taskId, actorId, categoryId || undefined);
            const name = eligible.find(agent => agent.id === actorId)?.name || '居民';
            toast.success(`${name}的活动已启动，可在每日活动查看进展`);
            onClose();
        } catch (error) {
            setError(error instanceof Error ? error.message : '启动失败');
        } finally {
            setSubmitting(false);
        }
    };

    return <WorldDialog title="手动执行活动" onClose={onClose}>
        <div className="space-y-4 p-6">
            <p className="text-sm text-slate-500">{isPublishTask ? '指定执行居民；可指定本次发帖分类，留空时由 Agent 自主判断。' : '指定执行居民，仍读取其生活目标与后续资金预留。'}</p>
            <Select menuPortal value={actorId} placeholder="选择居民"
                options={eligible.map(agent => ({value: agent.id, label: agent.name}))}
                onChange={value => {if (!submitting) setActorId(value);}}/>
            {isPublishTask && <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">发帖分类（可选）</label>
                <Select menuPortal value={categoryId} placeholder="由 Agent 自主判断"
                    emptyMessage="任务暂未配置可用分类"
                    options={publishCategories.map(category => ({value: category.id, label: category.name}))}
                    onChange={value => {if (!submitting) setCategoryId(value);}}/>
                {categoriesLoading && <p className="text-xs text-slate-500">正在加载任务分类…</p>}
                {categoriesError && <p role="status" className="text-xs text-amber-700">分类加载失败；仍可由 Agent 自主判断。{categoriesError}</p>}
            </div>}
            {!loading && !eligible.length && <p className="text-sm text-slate-500">暂无可执行居民，请先在统一生活设置中配置。</p>}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="button" disabled={loading || submitting || !eligible.some(agent => agent.id === actorId)}
                aria-busy={submitting} onClick={() => void run()}
                className="rounded-xl bg-orange-500 px-4 py-2 text-sm text-white disabled:opacity-50">
                {loading ? '加载中…' : submitting ? '正在提交…' : '开始执行'}
            </button>
        </div>
    </WorldDialog>;
}
