import Checkbox from '../common/Checkbox';
import {useDecisionConfig} from '../../hooks/useDecisionConfig';
import {useEffect, useState} from 'react';
import {BrainCircuit, Loader2, Save} from 'lucide-react';
import {getProviders} from '../../api/setting';
import {getLifeConfig, saveLifeConfig} from '../../api/agentLife';
import {Select} from '../common/Select';
import {useToast} from '../common/ToastProvider';
import type {LifeConfig} from '../../types/api/agentLife';
import type {DecisionFailoverState} from '../../types/api/decision';
import type {AIModel} from '../../types/api/setting';
import {DecisionFailoverEditor} from './DecisionFailoverEditor';
import {DEFAULT_STICKY_TTL_SECONDS, stickyTtlValue} from './decisionFailover';

const decisionSceneLabels = {
    tournament_reward_slot: '武道大会奖励部位',
    fishing_spot: '钓鱼地点选择', fishing_duration: '钓鱼时长选择', fishing_bait: '钓鱼携带鱼饵', fishing_duel: '鱼王猜拳',
    lottery_quantity: '大乐透购票数量',
    lottery_number: '大乐透逐位选号',
    publish_category: '自主发帖分类选择',
    market: '市场选择',
    market_plan: '市场日规划选择',
    market_disposition: '市场处置标记',
    market_equipment: '装备购买判断',
    life_budget: '生活预算选择',
    farm_queue: '农场种植队列规划',
    cooking_recipe: '美食菜谱选择',
    blacksmith_level_band: '打造等级范围',
    blacksmith_slot: '打造装备部位',
    blacksmith_type: '打造装备类型',
    blacksmith_continue: '打造后继续选择',
    blacksmith_goal_count: '打造目标登记数量',
    blacksmith_goal_priority: '打造目标材料争用',
    alchemy_recipe: '炼金配方选择',
    alchemy_quantity: '炼金瓶数选择',
    alchemy_continue: '炼金继续制作',
    cooking_quantity: '美食份数选择',
    cooking_continue: '美食继续制作',
    cooking_ingredient_strategy: '美食用料策略',
    social_action: '社交行为选择',
    post_rating: '帖子评分',
    bounty_accept: '悬赏接单选择',
    travel_destination: '旅行目的地',
    travel_visit: '旅行游览',
    travel_event: '旅行遭遇',
    combat_preparation: '迷宫探索准备',
    combat_listing_price: '探索装备挂牌定价',
};

type ChatModel = AIModel & {providerName: string};

export function WorldDecisionModelSettings() {
    const toast = useToast();
    const decisionConfig = useDecisionConfig();
    const [jevEnabled, setJevEnabled] = useState(false);
    const [order, setOrder] = useState<string[]>([]);
    const [stickyTtl, setStickyTtl] = useState(String(DEFAULT_STICKY_TTL_SECONDS));
    const [failover, setFailover] = useState<DecisionFailoverState | null>(null);
    const [excluded, setExcluded] = useState<string[]>([]);
    const [config, setConfig] = useState<LifeConfig | null>(null);
    const [models, setModels] = useState<ChatModel[]>([]);
    const [modelId, setModelId] = useState('');
    const [missingSavedModel, setMissingSavedModel] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        Promise.all([getLifeConfig(controller.signal), getProviders()])
            .then(([lifeConfig, providers]) => {
                if (!active) return;
                const chatModels = providers.flatMap(provider =>
                    (provider.models || [])
                        .filter(model => model.type === 'chat')
                        .map(model => ({...model, providerName: provider.name})),
                );
                const configuredModelId = lifeConfig.settings.decisionModelId || '';
                const configuredModelExists = chatModels.some(model => model.id === configuredModelId);
                setModels(chatModels);
                setConfig(lifeConfig);
                const storedOrder = (lifeConfig.settings.decisionConnectionIds || []).filter(id => id);
                const fallback = lifeConfig.settings.decisionConnectionId || '';
                setJevEnabled(lifeConfig.settings.jevEnabled ?? false);
                setOrder(storedOrder.length ? storedOrder : (fallback ? [fallback] : []));
                setStickyTtl(stickyTtlValue(lifeConfig.settings.decisionStickyTtlSeconds));
                setFailover(lifeConfig.decisionFailover ?? null);
                setExcluded(lifeConfig.settings.jevExcludedScenes || []);
                setModelId(configuredModelExists ? configuredModelId : '');
                setMissingSavedModel(Boolean(configuredModelId && !configuredModelExists));
            })
            .catch(value => {
                if (active) setError(value instanceof Error ? value.message : '决策模型配置加载失败');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
            controller.abort();
        };
    }, []);

    const decisionConnections = decisionConfig.config?.connections || decisionConfig.config?.providers || [];
    const catalogIds = new Set(decisionConnections.map(connection => connection.id));
    const visibleOrder = decisionConfig.loading ? order : order.filter(id => catalogIds.has(id));
    const firstConnection = decisionConnections.find(connection => connection.id === visibleOrder[0]);

    const save = async () => {
        if (!config) return;
        setSaving(true);
        setError('');
        try {
            const source = decisionConfig.loading ? order : visibleOrder;
            const chain = source.filter((id, index) => id && source.indexOf(id) === index);
            const first = chain[0] || '';
            const saved = await saveLifeConfig({...config.settings, decisionModelId: modelId,
                decisionConnectionId: first, decisionConnectionIds: chain,
                decisionStickyTtlSeconds: Number(stickyTtl), jevEnabled, jevExcludedScenes: excluded});
            const savedOrder = saved.settings.decisionConnectionIds?.length
                ? saved.settings.decisionConnectionIds
                : (saved.settings.decisionConnectionId ? [saved.settings.decisionConnectionId] : []);
            setConfig(saved);
            setModelId(saved.settings.decisionModelId || '');
            setOrder(savedOrder);
            setStickyTtl(stickyTtlValue(saved.settings.decisionStickyTtlSeconds));
            setFailover(saved.decisionFailover ?? null);
            setMissingSavedModel(false);
            toast.success('世界决策模型已保存');
        } catch (value) {
            const message = value instanceof Error ? value.message : '保存世界决策模型失败';
            setError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    const options = [
        {
            value: '',
            label: '跟随居民模型',
            description: '居民未配置模型时，继续使用系统默认对话模型',
        },
        ...models.map(model => ({
            value: model.id,
            label: `${model.providerName} / ${model.displayName || model.name}`,
        })),
    ];
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <BrainCircuit className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-800">统一决策设置</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                        日程安排始终使用普通文本模型，一次规划当天全部行动时段。其他有限候选选择可使用结构化决策连接；正文生成仍使用任务、居民和系统模型。
                    </p>
                </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold text-slate-700">决策优先级</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">支持回退的场景：决策连接顺序 → 普通文本决策模型 → 居民模型 → 系统默认对话模型。发帖分类、大乐透等仅支持决策连接；帖子评分也不改用文本模型，关闭或失败时不提交评论与评分。</p>
            </div>

            <div className="mt-5 max-w-2xl space-y-2">
                <label className="block space-y-2 text-sm font-semibold text-slate-700">
                    <span>普通文本模型（日程规划及决策兜底）</span>
                    {loading ? (
                        <span className="flex min-h-10 items-center gap-2 text-xs font-normal text-slate-400">
                            <Loader2 className="h-4 w-4 animate-spin" />正在加载模型…
                        </span>
                    ) : (
                        <Select
                            menuPortal
                            value={modelId}
                            options={options}
                            onChange={value => {
                                setModelId(value);
                                setMissingSavedModel(false);
                            }}
                            placeholder="选择普通文本模型"
                            disabled={saving || !config}
                        />
                    )}
                </label>
                {decisionConfig.loading ? (
                    <span className="flex min-h-10 items-center gap-2 text-xs font-normal text-slate-400"><Loader2 className="h-4 w-4 animate-spin"/>正在加载连接…</span>
                ) : decisionConfig.error ? (
                    <span className="text-xs font-normal text-red-600">{decisionConfig.error}</span>
                ) : (
                    <DecisionFailoverEditor
                        connections={decisionConnections}
                        order={visibleOrder}
                        ttlSeconds={stickyTtl}
                        failover={failover}
                        disabled={saving || !config}
                        onOrderChange={setOrder}
                        onTtlChange={setStickyTtl}
                    />
                )}
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <Checkbox checked={jevEnabled} onChange={setJevEnabled} disabled={loading || saving} label="启用结构化决策连接处理有限候选选择"/>
                    <p className="text-xs leading-5 text-slate-500">农场种植依次选择组合、是否施肥和补货档位，后续队列由程序推进。连接顺序和沿用时间随 WebDAV 同步；本机正在沿用哪一个不同步。在 AI 模型接入 → 决策模型连接中新增、编辑或测试连接。全部连接失败后的回退或停止方式以各活动流程说明为准。</p>
                    {decisionConfig.error && <p role="alert" className="text-xs text-red-600">{decisionConfig.error}<button type="button" onClick={() => void decisionConfig.refresh()} className="ml-2 underline">重试</button></p>}
                    {!decisionConfig.loading && !decisionConfig.error && <p className="text-xs text-slate-500">{visibleOrder.length === 0 ? '顺序为空，仅决策连接支持的选择无法执行；支持文本回退的场景沿用普通模型。' : `顺序第一位：${firstConnection ? (firstConnection.configured ? '连接信息完整' : '请检查 API Key 和连接同步状态') : '连接已删除或尚未从 WebDAV 同步'}`}</p>}
                    {jevEnabled && <div className="space-y-2"><p className="text-xs font-semibold text-slate-600">排除场景（勾选后按业务规则回退或停止）</p><div className="grid gap-2 sm:grid-cols-2">
                        {Object.entries(decisionSceneLabels).map(([key, label]) => <Checkbox key={key} checked={excluded.includes(key)} disabled={saving} onChange={checked => setExcluded(previous => checked ? [...previous, key] : previous.filter(item => item !== key))} label={label}/>)}
                    </div></div>}
                </div>
                {missingSavedModel && (
                    <p className="text-xs leading-5 text-amber-700">
                        原先配置的模型已不存在或不再是对话模型。当前按居民模型回退；保存后会清除失效选择。
                    </p>
                )}
                {error && <p role="alert" className="text-xs leading-5 text-red-600">{error}</p>}
            </div>

            <div className="mt-5 flex justify-end">
                <button
                    type="button"
                    disabled={loading || saving || !config}
                    onClick={() => void save()}
                    className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? '保存中…' : '保存配置'}
                </button>
            </div>
        </section>
    );
}
