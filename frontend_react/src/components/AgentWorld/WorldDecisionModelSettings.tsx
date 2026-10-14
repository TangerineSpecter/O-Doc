import Checkbox from '../common/Checkbox';
import {useDecisionConfig} from '../../hooks/useDecisionConfig';
import {useEffect, useState} from 'react';
import {BrainCircuit, Loader2, Save} from 'lucide-react';
import {getProviders} from '../../api/setting';
import {getLifeConfig, saveLifeConfig} from '../../api/agentLife';
import {Select} from '../common/Select';
import {useToast} from '../common/ToastProvider';
import type {LifeConfig} from '../../types/api/agentLife';
import type {AIModel} from '../../types/api/setting';

type ChatModel = AIModel & {providerName: string};

export function WorldDecisionModelSettings() {
    const toast = useToast();
    const decisionConfig = useDecisionConfig();
    const [jevEnabled, setJevEnabled] = useState(false);
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
                setJevEnabled(lifeConfig.settings.jevEnabled ?? false);
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

    const save = async () => {
        if (!config) return;
        setSaving(true);
        setError('');
        try {
            const saved = await saveLifeConfig({...config.settings, decisionModelId: modelId, jevEnabled, jevExcludedScenes: excluded});
            setConfig(saved);
            setModelId(saved.settings.decisionModelId || '');
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
                    <h3 className="text-sm font-bold text-slate-800">统一决策模型</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                        JEV 优先处理有限候选选择；普通决策按任务或世界模型、居民模型、系统默认逐层兜底。正文生成使用任务、居民和系统模型。
                    </p>
                </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold text-slate-700">模型优先级</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">世界决策模型 → 居民模型 → 系统默认对话模型</p>
            </div>

            <div className="mt-5 max-w-2xl space-y-2">
                <label className="block space-y-2 text-sm font-semibold text-slate-700">
                    <span>世界决策模型</span>
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
                            placeholder="选择决策模型"
                            disabled={saving || !config}
                        />
                    )}
                </label>
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <Checkbox checked={jevEnabled} onChange={setJevEnabled} disabled={loading || saving} label="优先使用 JEV 处理有限候选决策"/>
                    <p className="text-xs leading-5 text-slate-500">密钥仅保存在本机，在 AI 模型接入 → 决策模型中配置。未配置或调用失败时自动转普通模型。</p>
                    {decisionConfig.error && <p role="alert" className="text-xs text-red-600">{decisionConfig.error}<button type="button" onClick={() => void decisionConfig.refresh()} className="ml-2 underline">重试</button></p>}
                    {!decisionConfig.loading && !decisionConfig.error && <p className="text-xs text-slate-500">本机 JEV：{decisionConfig.config?.providers.some(provider => provider.id === 'jev' && provider.configured) ? '已配置' : '未配置'}</p>}
                    {jevEnabled && <div className="space-y-2"><p className="text-xs font-semibold text-slate-600">排除场景（勾选后使用普通模型）</p><div className="grid gap-2 sm:grid-cols-2">
                        {Object.entries({market: '市场选择', life_activity: '生活活动选择', social_action: '社交行为选择', travel_destination: '旅行目的地', travel_visit: '旅行游览', travel_event: '旅行遭遇'}).map(([key, label]) => <Checkbox key={key} checked={excluded.includes(key)} disabled={saving} onChange={checked => setExcluded(previous => checked ? [...previous, key] : previous.filter(item => item !== key))} label={label}/>)}
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
