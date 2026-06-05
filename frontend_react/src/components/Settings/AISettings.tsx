import {useState} from 'react';
import {CheckCircle2, Edit2, Eye, Globe, Key, Layers, Loader2, Plus, Server, Trash2, Wifi, X, XCircle, Zap} from 'lucide-react';
import {AIModel, AIModelConnectionResult, AIProvider, ModelType, SystemAIConfig, testAIModelConnection} from '@/api/setting';
import {SettingsSelect, SettingsSelectOption} from './SettingsSelect';
import {useToast} from '../common/ToastProvider';

import deepseekLogo from '@/assets/models/deepseek.svg'
import qwenLogo from '@/assets/models/qwen.png'
import ollamaLogo from '@/assets/models/ollama.svg'
import openaiLogo from '@/assets/models/openai.svg'
import doubaoLogo from '@/assets/models/doubao.svg'
import siliconFlowLogo from '@/assets/models/siliconFlow.svg'
import xiaomiLogo from '@/assets/models/xiaomi.png'
import minimaxLogo from '@/assets/models/minimax.jpg'


// --- Logo Component ---
const ProviderLogo = ({type, name}: { type: string, name: string }) => {

    // 2. 样式配置表
    // 策略：使用图片的厂商 -> 用白底 (bg-white) 或透明底
    //       使用 SVG/文字的厂商 -> 用品牌色底 (bg-[color])
    const brandStyles: Record<string, string> = {
        // --- 纯色背景类 (SVG / Text) ---
        'OpenAi': 'bg-white text-white',         // OpenAI 绿
        'Ollama': 'bg-white text-white',             // Ollama 黑
        'Google AI': 'bg-white border border-slate-200 text-slate-700', // Google 通常是彩色的，这里用白底
        'custom': 'bg-slate-500 text-white',         // 自定义 灰
        // --- 图片类 (Image) ---
        // 关键点：这里把背景色去掉了，改为 bg-white，并加了浅边框以防图片也是白底导致看不清边界
        'SiliconFlow': 'bg-white border border-slate-200 p-1',
        'DeepSeek': 'bg-white border border-slate-200',
        'Qwen': 'bg-white border border-slate-200',
        'Xiaomi': 'bg-white border border-slate-200',
        'Doubao': 'bg-white border border-slate-200',
        'MiniMax': 'bg-white border border-slate-200',
    };

    // 3. 图标渲染逻辑
    const renderIcon = () => {
        switch (type) {
            case 'OpenAi':
                return <img src={openaiLogo} alt="OpenAI" className="w-full h-full object-contain"/>;
            case 'Ollama':
                return <img src={ollamaLogo} alt="Ollama" className="w-full h-full object-contain"/>;
            case 'Google AI':
                return <img src={deepseekLogo} alt="DeepSeek" className="w-full h-full object-contain"/>;

            // --- 图片渲染区域 ---
            case 'DeepSeek':
                return <img src={deepseekLogo} alt="DeepSeek"
                            className="w-full h-full p-0.5 object-contain translate-x-[2px] translate-y-[2px] p-0.5"/>;
            case 'Xiaomi':
                return <img src={xiaomiLogo} alt="Xiaomi" className="w-full h-full object-contain p-0.01"/>;
            case 'Qwen':
                return <img src={qwenLogo} alt="Qwen" className="w-full h-full object-contain p-0.5"/>;
            case 'Doubao':
                return <img src={doubaoLogo} alt="Doubao" className="w-full h-full object-cover"/>;
            case 'SiliconFlow':
                return <img src={siliconFlowLogo} alt="SiliconFlowLogo" className="w-full h-full object-contain"/>;
            case 'MiniMax':
                return <img src={minimaxLogo} alt="MiniMax" className="w-full h-full object-contain"/>;

            default:
                // 默认兜底：首字母
                return <span className="font-bold text-sm">{name.charAt(0).toUpperCase()}</span>;
        }
    };

    const style = brandStyles[type] || brandStyles['custom'];

    return (
        // 添加 overflow-hidden 确保图片圆角跟随容器
        <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0 overflow-hidden ${style}`}>
            {renderIcon()}
        </div>
    );
};

// --- Main Component ---

interface AISettingsProps {
    providers: AIProvider[];
    systemConfig: SystemAIConfig;
    setSystemConfig: (config: SystemAIConfig) => void;
    getModelsByType: (type: ModelType) => (AIModel & { providerName: string, uniqueId: string })[];
    onOpenProviderModal: (provider?: AIProvider) => void;
    onOpenModelModal: (providerId: string) => void;
    onDelete: (target: { type: 'provider' | 'model', providerId: string, modelId?: string }) => void;
}

export const AISettings = ({
                               providers,
                               systemConfig,
                               setSystemConfig,
                               getModelsByType,
                               onOpenProviderModal,
                               onOpenModelModal,
                               onDelete
                           }: AISettingsProps) => {
    const toast = useToast();
    const [testingModelIds, setTestingModelIds] = useState<Record<string, boolean>>({});
    const [connectionResults, setConnectionResults] = useState<Record<string, AIModelConnectionResult | {
        ok: false;
        detail: string;
        elapsedMs?: number;
    }>>({});

    const buildModelOptions = (type: ModelType): SettingsSelectOption<string>[] => {
        return getModelsByType(type).map(model => ({
            value: model.id,
            label: `${model.providerName} / ${model.name}`,
            description: model.name,
        }));
    };

    const ModelTypeBadge = ({type}: { type: ModelType }) => {
        const styles = {
            chat: 'bg-blue-50 text-blue-600 border-blue-100',
            image: 'bg-cyan-50 text-cyan-600 border-cyan-100',
            embedding: 'bg-emerald-50 text-emerald-600 border-emerald-100',
            rerank: 'bg-purple-50 text-purple-600 border-purple-100'
        };
        const labels = {chat: '对话', image: '图像识别', embedding: '向量', rerank: '重排'};
        return (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${styles[type]}`}>
                {labels[type]}
            </span>
        );
    };

    const handleTestModelConnection = async (model: AIModel) => {
        if (testingModelIds[model.id]) return;

        setTestingModelIds(prev => ({...prev, [model.id]: true}));
        try {
            const result = await testAIModelConnection(model.id);
            setConnectionResults(prev => ({...prev, [model.id]: result}));
            toast.success(`${model.name} 连通性正常`);
        } catch (error: any) {
            const detail = error?.message || '连通性检测失败';
            setConnectionResults(prev => ({...prev, [model.id]: {ok: false, detail}}));
            toast.error(`${model.name} 检测失败：${detail}`);
        } finally {
            setTestingModelIds(prev => ({...prev, [model.id]: false}));
        }
    };

    return (
        <div className="space-y-8">
            {/* 1. Global System Defaults */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                        <Zap className="w-5 h-5"/>
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">默认模型配置 (Global Defaults)</h3>
                        <p className="text-xs text-slate-500">为系统的各项能力指定默认使用的 AI 模型</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Chat Model Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            主对话模型 (Chat)
                        </label>
                        <div className="relative">
                            <SettingsSelect
                                value={systemConfig.defaultChatModelId}
                                options={buildModelOptions('chat')}
                                onChange={value => setSystemConfig({...systemConfig, defaultChatModelId: value})}
                                placeholder="请选择模型..."
                                emptyMessage="暂无对话模型，请先在下方服务商中添加 chat 模型"
                                accentClassName="bg-blue-50 text-blue-700"
                                buttonClassName="bg-slate-50 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                        </div>
                    </div>

                    {/* Embedding Model Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            向量模型 (Embedding)
                        </label>
                        <div className="relative">
                            <SettingsSelect
                                value={systemConfig.defaultEmbeddingModelId}
                                options={buildModelOptions('embedding')}
                                onChange={value => setSystemConfig({
                                    ...systemConfig,
                                    defaultEmbeddingModelId: value
                                })}
                                placeholder="请选择模型..."
                                emptyMessage="暂无向量模型，请先在下方服务商中添加 embedding 模型"
                                accentClassName="bg-emerald-50 text-emerald-700"
                                buttonClassName="bg-slate-50 focus:ring-emerald-500/20 focus:border-emerald-500"
                            />
                        </div>
                    </div>

                    {/* Rerank Model Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                            重排模型 (Rerank)
                        </label>
                        <div className="relative">
                            <SettingsSelect
                                value={systemConfig.defaultRerankModelId}
                                options={[{value: '', label: '跳过重排步骤'}, ...buildModelOptions('rerank')]}
                                onChange={value => setSystemConfig({...systemConfig, defaultRerankModelId: value})}
                                placeholder="跳过重排步骤"
                                accentClassName="bg-purple-50 text-purple-700"
                                buttonClassName="bg-slate-50 focus:ring-purple-500/20 focus:border-purple-500"
                            />
                        </div>
                    </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-slate-100">
                        {/* Simple Chat Model Selector */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                简易模型 (Simple)
                                <span className="text-[10px] font-medium text-slate-400">可选</span>
                            </label>
                            <div className="relative">
                                <SettingsSelect
                                    value={systemConfig.simpleChatModelId}
                                    options={buildModelOptions('chat')}
                                    onChange={value => setSystemConfig({...systemConfig, simpleChatModelId: value})}
                                    placeholder="未配置时使用主对话模型"
                                    emptyMessage="暂无对话模型，请先在下方服务商中添加 chat 模型"
                                    accentClassName="bg-orange-50 text-orange-700"
                                    buttonClassName="bg-slate-50 focus:ring-orange-500/20 focus:border-orange-500"
                                />
                            </div>
                            <p className="text-[10px] text-slate-400">用于标题、文章标签、图片标签推荐，并固定关闭思考模式</p>
                        </div>

                        {/* Image Model Selector */}
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                                图像模型 (Image)
                                <span className="text-[10px] font-medium text-slate-400">可选</span>
                            </label>
                            <div className="relative">
                                <SettingsSelect
                                    value={systemConfig.defaultImageModelId}
                                    options={buildModelOptions('image')}
                                    onChange={value => setSystemConfig({...systemConfig, defaultImageModelId: value})}
                                    placeholder="未配置"
                                    emptyMessage="暂无图像识别模型，请先在下方服务商中添加 image 模型"
                                    accentClassName="bg-cyan-50 text-cyan-700"
                                    buttonClassName="bg-slate-50 focus:ring-cyan-500/20 focus:border-cyan-500"
                                />
                            </div>
                            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Eye className="w-3 h-3"/> 用于图片内容理解、视觉识别等能力
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Provider Management */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Server className="w-5 h-5 text-slate-500"/>
                        模型服务商 (Model Providers)
                    </h3>
                    <button
                        onClick={() => onOpenProviderModal()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-orange-600 hover:border-orange-200 rounded-lg text-xs font-medium transition-all shadow-sm"
                    >
                        <Plus className="w-3.5 h-3.5"/> 添加服务商
                    </button>
                </div>

                {providers.length === 0 && (
                    <div
                        className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
                        暂无配置，请点击右上角添加服务商
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4">
                    {providers.map(provider => (
                        <div key={provider.id}
                             className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group hover:border-orange-200 transition-colors">
                            {/* Provider Header */}
                            <div
                                className="flex items-center justify-between px-5 py-4 bg-slate-50/50 border-b border-slate-100 group-hover:bg-orange-50/30 transition-colors">
                                <div className="flex items-center gap-4">
                                    {/* Logo 展示 */}
                                    <ProviderLogo type={provider.type} name={provider.name}/>

                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-slate-800">{provider.name}</h4>
                                            <span
                                                className="px-2 py-0.5 bg-white text-slate-500 text-[10px] rounded-full border border-slate-200 uppercase tracking-wider font-mono shadow-sm">
                                                {provider.type}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-400">
                                            <span className="flex items-center gap-1" title={provider.baseUrl}><Globe
                                                className="w-3 h-3"/> {provider.baseUrl.length > 30 ? provider.baseUrl.substring(0, 30) + '...' : provider.baseUrl}</span>
                                            <span className="flex items-center gap-1"><Key
                                                className="w-3 h-3"/> {provider.apiKey ? `${provider.apiKey.substring(0, 6)}...` : '无密钥'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div
                                    className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => onOpenProviderModal(provider)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                        <Edit2 className="w-4 h-4"/></button>
                                    <button onClick={() => onDelete({type: 'provider', providerId: provider.id})}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                        <Trash2 className="w-4 h-4"/></button>
                                </div>
                            </div>

                            {/* Models List */}
                            <div className="px-5 py-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span
                                        className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <Layers className="w-3.5 h-3.5"/>
                                        包含模型 ({provider.models.length})
                                    </span>
                                    <button onClick={() => onOpenModelModal(provider.id)}
                                            className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 hover:underline">
                                        <Plus className="w-3 h-3"/> 添加模型
                                    </button>
                                </div>

                                {provider.models.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {provider.models.map(model => {
                                            const result = connectionResults[model.id];
                                            const isTesting = !!testingModelIds[model.id];

                                            return (
                                                <div key={model.id}
                                                     className="flex items-start justify-between gap-2 p-3 rounded-xl border border-slate-100 bg-slate-50/30 hover:bg-white hover:border-orange-200 hover:shadow-sm transition-all group/model">
                                                    <div className="flex items-start gap-2.5 min-w-0">
                                                        <div
                                                            className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover/model:bg-orange-400 transition-colors shrink-0 mt-2"></div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span
                                                                className="text-sm font-medium text-slate-700 truncate">{model.name}</span>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <ModelTypeBadge type={model.type}/>
                                                                {result && (
                                                                    <span
                                                                        className={`inline-flex items-center gap-1 text-[10px] font-medium ${result.ok ? 'text-emerald-600' : 'text-rose-600'}`}
                                                                        title={result.detail || (result.elapsedMs ? `${result.elapsedMs}ms` : '')}
                                                                    >
                                                                        {result.ok ? <CheckCircle2 className="w-3 h-3"/> :
                                                                            <XCircle className="w-3 h-3"/>}
                                                                        {result.ok ? `${result.elapsedMs}ms` : '失败'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTestModelConnection(model)}
                                                            disabled={isTesting}
                                                            title="测试模型连通性"
                                                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md disabled:cursor-wait disabled:opacity-70 transition-colors"
                                                        >
                                                            {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> :
                                                                <Wifi className="w-3.5 h-3.5"/>}
                                                        </button>
                                                        <button
                                                            onClick={() => onDelete({
                                                                type: 'model',
                                                                providerId: provider.id,
                                                                modelId: model.id
                                                            })}
                                                            title="删除模型"
                                                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover/model:opacity-100 transition-all"
                                                        >
                                                            <X className="w-3.5 h-3.5"/>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-400 italic py-2">暂无模型，请点击上方添加</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
