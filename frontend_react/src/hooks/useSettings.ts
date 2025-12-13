import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../components/common/ToastProvider';
import { 
    AIProvider, SystemAIConfig, WebDavConfig, ModelType,
    getProviders, saveProvider, deleteProvider, saveModel, deleteModel,
    getSystemAIConfig, saveSystemAIConfig
} from '../api/setting';

export const useSettings = () => {
    const toast = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // --- State ---
    const [providers, setProviders] = useState<AIProvider[]>([]);
    const [systemConfig, setSystemConfig] = useState<SystemAIConfig>({
        defaultChatModelId: '',
        defaultEmbeddingModelId: '',
        defaultRerankModelId: ''
    });
    
    // WebDav 配置暂时略过，逻辑类似
    const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>({
        enabled: false, url: '', username: '', password: '', interval: 30
    });

    // --- 初始化加载 ---
    const loadSettings = async () => {
        setIsLoading(true);
        try {
            const [providersRes, configRes] = await Promise.all([
                getProviders(),
                getSystemAIConfig()
            ]);
            setProviders(providersRes.data);
            setSystemConfig(configRes.data);
        } catch (error) {
            console.error("加载设置失败", error);
            toast.error("加载设置失败");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    // --- Helpers ---
    const allModels = useMemo(() => {
        return providers.flatMap(p => p.models.map(m => ({
            ...m,
            providerName: p.name,
            uniqueId: m.id 
        })));
    }, [providers]);

    const getModelsByType = (type: ModelType) => allModels.filter(m => m.type === type);

    // --- Actions ---

    // 1. 保存系统默认配置 (下拉框选择后自动保存或手动保存)
    const handleSaveSystemConfig = async (newConfig: SystemAIConfig) => {
        // 先乐观更新 UI
        setSystemConfig(newConfig); 
        try {
            await saveSystemAIConfig(newConfig);
            // toast.success('默认模型配置已更新'); // 可选：太频繁可以不提示
        } catch (error) {
            toast.error('保存配置失败');
            // 回滚（如果需要严格一致性，这里应该重新 fetch）
        }
    };

    // 2. 保存 Provider (新增/编辑)
    const handleSaveProvider = async (providerData: Partial<AIProvider>, isEdit: boolean) => {
        setIsSaving(true);
        try {
            const res = await saveProvider(providerData);
            if (isEdit) {
                setProviders(prev => prev.map(p => p.id === res.data.id ? { ...p, ...res.data, models: p.models } : p));
                toast.success('服务商已更新');
            } else {
                // 新增时，models 肯定是空的
                setProviders(prev => [{ ...res.data, models: [] }, ...prev]);
                toast.success('服务商已添加');
            }
            return true; // 返回成功标志
        } catch (error) {
            toast.error('保存服务商失败');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    // 3. 添加模型
    const handleSaveModel = async (providerId: string, modelData: { name: string, type: ModelType }) => {
        try {
            const res = await saveModel({ provider: providerId, ...modelData });
            setProviders(prev => prev.map(p => {
                if (p.id === providerId) {
                    return { ...p, models: [...p.models, res.data] };
                }
                return p;
            }));
            toast.success('模型已添加');
            return true;
        } catch (error) {
            toast.error('添加模型失败');
            return false;
        }
    };

    // 4. 删除 (Provider 或 Model)
    const handleDelete = async (target: { type: 'provider' | 'model', providerId: string, modelId?: string }) => {
        if (!confirm('确定要删除吗？此操作不可恢复。')) return;

        try {
            if (target.type === 'provider') {
                await deleteProvider(target.providerId);
                setProviders(prev => prev.filter(p => p.id !== target.providerId));
                toast.success('服务商已删除');
            } else if (target.type === 'model' && target.modelId) {
                await deleteModel(target.modelId);
                setProviders(prev => prev.map(p => {
                    if (p.id === target.providerId) {
                        return { ...p, models: p.models.filter(m => m.id !== target.modelId) };
                    }
                    return p;
                }));
                toast.success('模型已删除');
            }
        } catch (error) {
            toast.error('删除失败');
        }
    };

    return {
        providers,
        systemConfig,
        webDavConfig,
        isSaving,
        isLoading,
        allModels,
        
        // 修改这里：setSystemConfig 现在直接调用带保存逻辑的函数
        setSystemConfig: handleSaveSystemConfig, 
        setWebDavConfig,

        getModelsByType,
        handleSaveProvider,
        handleSaveModel,
        handleDelete,
        // 重新加载
        refresh: loadSettings 
    };
};