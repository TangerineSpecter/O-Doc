import { useState, useMemo } from 'react';
import { useToast } from '../components/common/ToastProvider';
import { AIProvider, AIModel, SystemAIConfig, WebDavConfig, MOCK_PROVIDERS, ModelType } from '../api/setting';

export const useSettings = () => {
    const toast = useToast();
    const [isSaving, setIsSaving] = useState(false);

    // --- State ---
    const [providers, setProviders] = useState<AIProvider[]>(MOCK_PROVIDERS);
    const [systemConfig, setSystemConfig] = useState<SystemAIConfig>({
        defaultChatModelId: 'm_gpt4o',
        defaultEmbeddingModelId: 'm_emb3',
        defaultRerankModelId: 'm_bge'
    });
    const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>({
        enabled: false, url: '', username: '', password: '', interval: 30
    });

    // --- Helpers ---
    const allModels = useMemo(() => {
        return providers.flatMap(p => p.models.map(m => ({
            ...m,
            providerName: p.name,
            uniqueId: m.id // 实际项目建议用 `${p.id}:${m.id}`
        })));
    }, [providers]);

    const getModelsByType = (type: ModelType) => allModels.filter(m => m.type === type);

    // --- Actions ---
    const handleSave = () => {
        setIsSaving(true);
        // 模拟 API 调用
        setTimeout(() => {
            setIsSaving(false);
            toast.success('系统设置已保存');
        }, 800);
    };

    const handleSaveProvider = (provider: Partial<AIProvider>, isEdit: boolean) => {
        if (isEdit && provider.id) {
            setProviders(prev => prev.map(p => p.id === provider.id ? { ...p, ...provider } as AIProvider : p));
            toast.success('服务商已更新');
        } else {
            const newProvider: AIProvider = {
                id: `p_${Date.now()}`,
                models: [],
                ...provider as any
            };
            setProviders([...providers, newProvider]);
            toast.success('服务商已添加');
        }
    };

    const handleSaveModel = (providerId: string, model: { name: string, type: ModelType }) => {
        const newModel: AIModel = {
            id: `m_${Date.now()}`,
            name: model.name,
            type: model.type
        };
        setProviders(prev => prev.map(p => {
            if (p.id === providerId) {
                return { ...p, models: [...p.models, newModel] };
            }
            return p;
        }));
        toast.success('模型已添加');
    };

    const handleDelete = (target: { type: 'provider' | 'model', providerId: string, modelId?: string }) => {
        if (target.type === 'provider') {
            setProviders(prev => prev.filter(p => p.id !== target.providerId));
        } else if (target.type === 'model' && target.modelId) {
            setProviders(prev => prev.map(p => {
                if (p.id === target.providerId) {
                    return { ...p, models: p.models.filter(m => m.id !== target.modelId) };
                }
                return p;
            }));
        }
        toast.success('删除成功');
    };

    return {
        // Data
        providers,
        systemConfig,
        webDavConfig,
        isSaving,
        allModels,
        
        // Setters (用于表单绑定)
        setSystemConfig,
        setWebDavConfig,

        // Actions
        getModelsByType,
        handleSave,
        handleSaveProvider,
        handleSaveModel,
        handleDelete
    };
};