import React from 'react';
import { Server, Plus, Zap, Edit2, Trash2, Globe, Key, Layers, X, ChevronDown } from 'lucide-react';
import { AIProvider, SystemAIConfig, ModelType, AIModel } from '../../api/setting';

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

    const ModelTypeBadge = ({ type }: { type: ModelType }) => {
        const styles = {
            chat: 'bg-blue-50 text-blue-600 border-blue-100',
            embedding: 'bg-emerald-50 text-emerald-600 border-emerald-100',
            rerank: 'bg-purple-50 text-purple-600 border-purple-100'
        };
        const labels = { chat: '对话', embedding: '向量', rerank: '重排' };
        return (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${styles[type]}`}>
                {labels[type]}
            </span>
        );
    };

    return (
        <div className="space-y-8">
            {/* 1. Global System Defaults */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                        <Zap className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">默认模型配置 (Global Defaults)</h3>
                        <p className="text-xs text-slate-500">为系统的各项能力指定默认使用的 AI 模型</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Chat Model Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            主对话模型 (Chat)
                        </label>
                        <div className="relative">
                            <select
                                className="w-full appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 px-3 py-2 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                                value={systemConfig.defaultChatModelId}
                                onChange={e => setSystemConfig({ ...systemConfig, defaultChatModelId: e.target.value })}
                            >
                                <option value="" disabled>请选择模型...</option>
                                {getModelsByType('chat').map(m => (
                                    <option key={m.uniqueId} value={m.id}>{m.providerName} / {m.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Embedding Model Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            向量模型 (Embedding)
                        </label>
                        <div className="relative">
                            <select
                                className="w-full appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 px-3 py-2 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
                                value={systemConfig.defaultEmbeddingModelId}
                                onChange={e => setSystemConfig({ ...systemConfig, defaultEmbeddingModelId: e.target.value })}
                            >
                                <option value="" disabled>请选择模型...</option>
                                {getModelsByType('embedding').map(m => (
                                    <option key={m.uniqueId} value={m.id}>{m.providerName} / {m.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Rerank Model Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                            重排模型 (Rerank)
                        </label>
                        <div className="relative">
                            <select
                                className="w-full appearance-none bg-slate-50 border border-slate-200 hover:border-slate-300 px-3 py-2 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
                                value={systemConfig.defaultRerankModelId}
                                onChange={e => setSystemConfig({ ...systemConfig, defaultRerankModelId: e.target.value })}
                            >
                                <option value="">如果不选择，则跳过重排步骤</option>
                                {getModelsByType('rerank').map(m => (
                                    <option key={m.uniqueId} value={m.id}>{m.providerName} / {m.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Provider Management */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Server className="w-5 h-5 text-slate-500" />
                        模型服务商 (Model Providers)
                    </h3>
                    <button
                        onClick={() => onOpenProviderModal()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-orange-600 hover:border-orange-200 rounded-lg text-xs font-medium transition-all shadow-sm"
                    >
                        <Plus className="w-3.5 h-3.5" /> 添加服务商
                    </button>
                </div>

                {providers.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
                        暂无配置，请点击右上角添加服务商
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4">
                    {providers.map(provider => (
                        <div key={provider.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group">
                            {/* Provider Header */}
                            <div className="flex items-center justify-between px-5 py-4 bg-slate-50/50 border-b border-slate-100">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-sm font-bold text-lg">
                                        {provider.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-slate-800">{provider.name}</h4>
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded-full border border-slate-200 uppercase tracking-wider">{provider.type}</span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                                            <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {provider.baseUrl}</span>
                                            <span className="flex items-center gap-1"><Key className="w-3 h-3" /> {provider.apiKey ? `${provider.apiKey.substring(0, 6)}...` : '无密钥'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => onOpenProviderModal(provider)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => onDelete({ type: 'provider', providerId: provider.id })} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>

                            {/* Models List */}
                            <div className="px-5 py-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">包含模型 ({provider.models.length})</span>
                                    <button onClick={() => onOpenModelModal(provider.id)} className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 hover:underline">
                                        <Plus className="w-3 h-3" /> 添加模型
                                    </button>
                                </div>

                                {provider.models.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {provider.models.map(model => (
                                            <div key={model.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/30 hover:bg-white hover:border-slate-200 hover:shadow-sm transition-all group/model">
                                                <div className="flex items-center gap-2.5">
                                                    <Layers className="w-4 h-4 text-slate-300" />
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium text-slate-700">{model.name}</span>
                                                        <div className="flex mt-0.5">
                                                            <ModelTypeBadge type={model.type} />
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => onDelete({ type: 'model', providerId: provider.id, modelId: model.id })}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover/model:opacity-100 transition-all"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
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