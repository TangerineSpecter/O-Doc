import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useToast} from '../components/common/ToastProvider';
import {
    AgentConfig,
    AgentRunRecordConfig,
    AgentTaskConfig,
    AIProvider,
    deleteAgent,
    deleteAgentTask,
    deleteMCPServer,
    deleteSkill,
    deleteModel,
    deleteProvider,
    getAgents,
    getAgentRunRecords,
    getAgentTasks,
    getMCPServers,
    getSkills,
    getProviders,
    getSystemAIConfig,
    getWebDavConfig,
    getWebDavStatus,
    ModelType,
    saveModel,
    saveAgent,
    saveAgentTask,
    saveMCPServer,
    saveSkill,
    saveProvider,
    saveSystemAIConfig,
    scanMCPServers,
    refreshMCPServerTools,
    runAgentTaskNow,
    SystemAIConfig,
    MCPServerConfig,
    SkillConfig,
    WebDavConfig,
    WebDavSyncStatus
} from '../api/setting';

export const useSettings = () => {
    const toast = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // --- State ---
    const [providers, setProviders] = useState<AIProvider[]>([]);
    const [agents, setAgents] = useState<AgentConfig[]>([]);
    const [agentTasks, setAgentTasks] = useState<AgentTaskConfig[]>([]);
    const [agentRunRecords, setAgentRunRecords] = useState<AgentRunRecordConfig[]>([]);
    const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>([]);
    const [skills, setSkills] = useState<SkillConfig[]>([]);
    const [systemConfig, setSystemConfig] = useState<SystemAIConfig>({
        defaultChatModelId: '',
        simpleChatModelId: '',
        defaultImageModelId: '',
        defaultEmbeddingModelId: '',
        defaultRerankModelId: ''
    });

    // WebDav 配置暂时略过，逻辑类似
    const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>({
        enabled: false,
        protocol: 'webdav',
        url: '',
        host: '',
        port: null,
        remotePath: '',
        username: '',
        password: '',
        interval: 30,
        useTls: false,
        passive: true,
        privateKey: '',
        passphrase: '',
        hostKey: '',
    });
    const [webDavStatus, setWebDavStatus] = useState<WebDavSyncStatus>({
        status: 'idle',
        trigger: '',
        runnerId: '',
        lastStartedAt: '',
        lastSuccessAt: '',
        lastPullAt: '',
        lastPushAt: '',
        lastError: '',
        lastSummary: [],
        lastSyncedSnapshotId: '',
        lastUploadedSnapshotId: '',
        lastPulledSnapshotId: '',
        updatedAt: ''
    });
    const webDavStatusRequestRef = useRef(0);

    const normalizeSystemAIConfig = (config: Partial<SystemAIConfig> = {}): SystemAIConfig => ({
        defaultChatModelId: config.defaultChatModelId || '',
        simpleChatModelId: config.simpleChatModelId || '',
        defaultImageModelId: config.defaultImageModelId || '',
        defaultEmbeddingModelId: config.defaultEmbeddingModelId || '',
        defaultRerankModelId: config.defaultRerankModelId || ''
    });

    // --- 初始化加载 ---
    // --- 初始化加载 ---
    const loadSettings = async () => {
        setIsLoading(true);
        try {
            // ✅ 同时解构出第二个返回值 (systemConfigRes)
            const [providersRes, systemConfigRes, agentsRes, agentTasksRes, agentRunRecordsRes, mcpServersRes, skillsRes] = await Promise.all([
                getProviders(),
                getSystemAIConfig(),
                getAgents(),
                getAgentTasks(),
                getAgentRunRecords(),
                getMCPServers(),
                getSkills()
            ]);

            setProviders(providersRes as unknown as AIProvider[]);
            setAgents(agentsRes as unknown as AgentConfig[]);
            setAgentTasks(agentTasksRes as unknown as AgentTaskConfig[]);
            setAgentRunRecords(agentRunRecordsRes as unknown as AgentRunRecordConfig[]);
            setMcpServers(mcpServersRes as unknown as MCPServerConfig[]);
            setSkills(skillsRes as unknown as SkillConfig[]);

            // ✅ 修复 2：将获取到的配置存入 State
            setSystemConfig(normalizeSystemAIConfig(systemConfigRes as unknown as Partial<SystemAIConfig>));

        } catch (error) {
            console.error("加载设置失败", error);
            toast.error("加载设置失败");
        } finally {
            setIsLoading(false);
        }
    };

    // 独立加载 WebDAV 的函数 ---
    const fetchWebDavConfig = useCallback(async () => {
        try {
            const [configRes, statusRes] = await Promise.all([
                getWebDavConfig(),
                getWebDavStatus()
            ]);
            if (configRes) {
                const config = configRes as unknown as WebDavConfig;
                setWebDavConfig({
                    enabled: Boolean(config.enabled),
                    protocol: config.protocol || 'webdav',
                    url: config.url || '',
                    host: config.host || '',
                    port: config.port ?? null,
                    remotePath: config.remotePath || (config as {remote_path?: string}).remote_path || '',
                    username: config.username || '',
                    password: config.password || '',
                    interval: config.interval || 30,
                    useTls: config.useTls ?? (config as {use_tls?: boolean}).use_tls ?? false,
                    passive: config.passive !== false,
                    privateKey: config.privateKey || (config as {private_key?: string}).private_key || '',
                    passphrase: config.passphrase || '',
                    hostKey: config.hostKey || (config as {host_key?: string}).host_key || '',
                });
            }
            if (statusRes) {
                setWebDavStatus(statusRes as unknown as WebDavSyncStatus);
            }
        } catch (error) {
            // 404 也不要弹窗报错，静默失败即可，因为用户可能还没配置后端
            console.warn("WebDAV 配置加载失败或未实现:", error);
        }
    }, []);

    const fetchWebDavStatus = useCallback(async () => {
        const requestId = ++webDavStatusRequestRef.current;
        try {
            const statusRes = await getWebDavStatus();
            if (statusRes && requestId === webDavStatusRequestRef.current) {
                setWebDavStatus(statusRes as unknown as WebDavSyncStatus);
            }
        } catch (error) {
            // 状态轮询失败时不打断用户正在编辑的同步配置
            console.warn("WebDAV 状态加载失败或未实现:", error);
        }
    }, []);

    const fetchAgentRunRecords = useCallback(async () => {
        try {
            const recordsRes = await getAgentRunRecords();
            setAgentRunRecords(recordsRes as unknown as AgentRunRecordConfig[]);
        } catch (error) {
            console.warn('Agent 执行记录刷新失败:', error);
        }
    }, []);

    useEffect(() => {
        if (!agentRunRecords.some(record => record.status === 'running')) return;
        const timer = window.setInterval(fetchAgentRunRecords, 3000);
        return () => window.clearInterval(timer);
    }, [agentRunRecords, fetchAgentRunRecords]);

    useEffect(() => {
        loadSettings();
    }, []);

    // --- Helpers ---
    const allModels = useMemo(() => {
        return providers.flatMap(p => (p.models || []).map(m => ({
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
            const data = res as unknown as AIProvider;

            if (isEdit) {
                setProviders(prev => prev.map(p => p.id === data.id ? {...p, ...data, models: p.models} : p));
                toast.success('服务商已更新');
            } else {
                // 新增时，models 肯定是空的
                setProviders(prev => [{...data, models: []}, ...prev]);
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
            const res = await saveModel({provider: providerId, ...modelData});
            const newModel = res as unknown as any;
            setProviders(prev => prev.map(p => {
                if (p.id === providerId) {
                    const currentModels = p.models || [];
                    return {...p, models: [...currentModels, newModel]};
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
        try {
            if (target.type === 'provider') {
                await deleteProvider(target.providerId);
                setProviders(prev => prev.filter(p => p.id !== target.providerId));
                toast.success('服务商已删除');
            } else if (target.type === 'model' && target.modelId) {
                await deleteModel(target.modelId);
                setProviders(prev => prev.map(p => {
                    if (p.id === target.providerId) {
                        return {...p, models: p.models.filter(m => m.id !== target.modelId)};
                    }
                    return p;
                }));
                toast.success('模型已删除');
            }
        } catch (error) {
            toast.error('删除失败');
        }
    };

    const handleSaveAgent = async (agentData: Partial<AgentConfig>) => {
        setIsSaving(true);
        try {
            const payload = {
                id: agentData.id,
                name: agentData.name || '',
                avatar: agentData.avatar || '',
                model: agentData.model || null,
                prompt: agentData.prompt || '',
                mcpServers: agentData.mcpServers || [],
                skills: agentData.skills || [],
                feishuImEnabled: agentData.feishuImEnabled ?? false,
                feishuAppId: agentData.feishuAppId || '',
                feishuAppSecret: agentData.feishuAppSecret || '',
                feishuVerificationToken: agentData.feishuVerificationToken || '',
                feishuEncryptKey: agentData.feishuEncryptKey || ''
            };
            const res = await saveAgent(payload);
            const data = res as unknown as AgentConfig;

            setAgents(prev => {
                const exists = prev.some(agent => agent.id === data.id);
                if (exists) {
                    return prev.map(agent => agent.id === data.id ? data : agent);
                }
                return [data, ...prev];
            });
            toast.success(agentData.id ? 'Agent 已更新' : 'Agent 已创建');
            return true;
        } catch (error) {
            toast.error('保存 Agent 失败');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteAgent = async (id: string) => {
        try {
            await deleteAgent(id);
            setAgents(prev => prev.filter(agent => agent.id !== id));
            toast.success('Agent 已删除');
        } catch (error) {
            toast.error('删除 Agent 失败');
        }
    };

    const handleSaveAgentTask = async (taskData: Partial<AgentTaskConfig>) => {
        setIsSaving(true);
        try {
            const intervalMinutes = Number(taskData.intervalMinutes) || 60;
            const agentIds = taskData.agents?.length
                ? taskData.agents
                : (taskData.agent ? [taskData.agent] : []);
            const payload = {
                id: taskData.id,
                name: taskData.name || '',
                agent: agentIds[0] || taskData.agent || '',
                agents: agentIds,
                executionMode: taskData.executionMode || 'parallel',
                trigger: taskData.trigger || '定时任务',
                schedule: taskData.schedule || '',
                scheduleType: taskData.scheduleType || 'daily',
                scheduleTime: taskData.scheduleTime || '09:00',
                scheduleWeekday: taskData.scheduleWeekday || '1',
                scheduleMonthDay: taskData.scheduleMonthDay || '1',
                intervalMinutes,
                enabled: taskData.enabled ?? true,
                prompt: taskData.prompt || '',
                notifyEnabled: taskData.notifyEnabled ?? false,
                notifyPlatform: taskData.notifyPlatform || 'feishu',
                notifyWebhookUrl: taskData.notifyWebhookUrl || ''
            };
            const res = await saveAgentTask(payload);
            const data = res as unknown as AgentTaskConfig;
            setAgentTasks(prev => {
                const exists = prev.some(task => task.id === data.id);
                if (exists) {
                    return prev.map(task => task.id === data.id ? data : task);
                }
                return [data, ...prev];
            });
            toast.success(taskData.id ? '任务已更新' : '任务已创建');
            return true;
        } catch (error) {
            toast.error('保存任务失败');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteAgentTask = async (id: string) => {
        try {
            await deleteAgentTask(id);
            setAgentTasks(prev => prev.filter(task => task.id !== id));
            toast.success('任务已删除');
        } catch (error) {
            toast.error('删除任务失败');
        }
    };

    const handleRunAgentTaskNow = async (id: string) => {
        try {
            await runAgentTaskNow(id);
            toast.success('任务已开始执行');
            await fetchAgentRunRecords();
            window.setTimeout(fetchAgentRunRecords, 1200);
            return true;
        } catch (error: any) {
            const msg = error?.response?.data?.msg || error?.response?.data?.detail || error?.message || '未知错误';
            toast.error(`手动执行任务失败：${msg}`);
            return false;
        }
    };

    const handleSaveMCPServer = async (serverData: Partial<MCPServerConfig> & { validateConnection?: boolean }) => {
        setIsSaving(true);
        try {
            const payload = {
                id: serverData.id,
                name: serverData.name || '',
                transport: serverData.transport || 'stdio',
                command: serverData.command || '',
                args: serverData.args || [],
                url: serverData.url || '',
                headers: serverData.headers || {},
                env: serverData.env || {},
                source: serverData.source || 'external',
                enabled: serverData.enabled ?? true,
                availableInChat: serverData.availableInChat ?? false,
                description: serverData.description || '',
                tools: serverData.tools || [],
                validateConnection: serverData.validateConnection ?? false,
            };
            const res = await saveMCPServer(payload as any);
            const data = res as unknown as MCPServerConfig;
            setMcpServers(prev => {
                const exists = prev.some(server => server.id === data.id);
                if (exists) {
                    return prev.map(server => server.id === data.id ? data : server);
                }
                return [...prev, data].sort((a, b) => a.name.localeCompare(b.name));
            });
            toast.success(serverData.id ? 'MCP 已更新' : 'MCP 已添加');
            return true;
        } catch (error: any) {
            const msg = error?.message || error?.response?.data?.msg || '保存失败';
            toast.error(`保存 MCP 失败：${msg}`);
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteMCPServer = async (id: string) => {
        try {
            await deleteMCPServer(id);
            setMcpServers(prev => prev.filter(server => server.id !== id));
            setAgents(prev => prev.map(agent => ({
                ...agent,
                mcpServers: (agent.mcpServers || []).filter(serverId => serverId !== id)
            })));
            toast.success('MCP 已删除');
        } catch (error) {
            toast.error('删除 MCP 失败');
        }
    };

    const handleScanMCPServers = async () => {
        try {
            const res = await scanMCPServers();
            const data = res as unknown as { count: number, servers: MCPServerConfig[] };
            const latest = await getMCPServers();
            setMcpServers(latest as unknown as MCPServerConfig[]);
            toast.success(data.count > 0 ? `已扫描到 ${data.count} 个 MCP` : '未扫描到新的 MCP');
            return data;
        } catch (error) {
            toast.error('扫描 MCP 失败');
            return {count: 0, servers: []};
        }
    };

    const handleRefreshMCPTools = async (id: string) => {
        setIsSaving(true);
        try {
            const res = await refreshMCPServerTools(id);
            const data = res as unknown as MCPServerConfig;
            setMcpServers(prev => prev.map(server => server.id === id ? data : server));
            toast.success('Tools 刷新成功');
            return true;
        } catch (error: any) {
            const msg = error?.response?.data?.msg || error?.message || '刷新失败';
            toast.error(`刷新 Tools 失败: ${msg}`);
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveSkill = async (skillData: Partial<SkillConfig>) => {
        setIsSaving(true);
        try {
            const payload: any = {
                id: skillData.id,
                name: skillData.name || '',
                description: skillData.description || '',
                version: skillData.version || '',
                source: skillData.source || 'skillhub',
                entry: skillData.entry || '',
                prompt: skillData.prompt || '',
                enabled: skillData.enabled ?? true,
                availableInChat: skillData.availableInChat ?? false,
                manifest: skillData.manifest || {}
            };
            if (skillData.skillKey !== undefined) {
                payload.skillKey = skillData.skillKey || '';
            }
            const res = await saveSkill(payload);
            const data = res as unknown as SkillConfig;
            setSkills(prev => {
                const exists = prev.some(skill => skill.id === data.id);
                if (exists) {
                    return prev.map(skill => skill.id === data.id ? data : skill);
                }
                return [...prev, data].sort((a, b) => a.name.localeCompare(b.name));
            });
            toast.success(skillData.id ? '技能已更新' : '技能已添加');
            return true;
        } catch (error) {
            toast.error('保存技能失败');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteSkill = async (id: string) => {
        try {
            await deleteSkill(id);
            setSkills(prev => prev.filter(skill => skill.id !== id));
            setAgents(prev => prev.map(agent => ({
                ...agent,
                skills: (agent.skills || []).filter(skillId => skillId !== id)
            })));
            toast.success('技能已删除');
        } catch (error) {
            toast.error('删除技能失败');
        }
    };

    return {
        providers,
        agents,
        agentTasks,
        agentRunRecords,
        mcpServers,
        skills,
        systemConfig,
        webDavConfig,
        webDavStatus,
        isSaving,
        isLoading,
        allModels,

        // 修改这里：setSystemConfig 现在直接调用带保存逻辑的函数
        setSystemConfig: handleSaveSystemConfig,
        setWebDavConfig,

        getModelsByType,
        handleSaveProvider,
        handleSaveModel,
        handleSaveAgent,
        handleSaveAgentTask,
        handleRunAgentTaskNow,
        handleSaveMCPServer,
        handleDelete,
        handleDeleteAgent,
        handleDeleteAgentTask,
        handleDeleteMCPServer,
        handleScanMCPServers,
        handleRefreshMCPTools,
        handleSaveSkill,
        handleDeleteSkill,

        fetchWebDavConfig,
        fetchWebDavStatus,
        // 重新加载
        refresh: loadSettings
    };
};
