import request from '../utils/request';
import type {
    ModelType,
    AgentLongTermMemoryConfig,
    AgentMemoryStatus,
    AgentMemoryType,
    SaveAgentLongTermMemoryParams,
    AgentConfig,
    AgentRunRecordConfig,
    AgentTaskConfig,
    AgentTaskExecutionMode,
    AgentTaskNotifyPlatform,
    AgentTaskScheduleType,
    MCPServerConfig,
    SkillConfig,
    AIModel,
    AIModelConnectionResult,
    ArticleRagScheduleConfig,
    AIProvider,
    MemosPushConfig,
    SystemAIConfig,
    ImageUploadConfig,
    WebDavConfig,
    WebDavSyncStatus,
    RuntimeInfo,
    GeoLocation,
    SaveGeoLocationParams,
    SaveAgentConfigParams,
    SaveAgentTaskConfigParams,
    SaveMCPServerConfigParams,
    SaveSkillConfigParams,
    MCPTransport,
    MCPSource,
    MCPToolConfig,
    SystemMCPConfig,
} from '../types/api/setting';

// 重新导出类型以便其他组件使用
export type {
    ModelType,
    AgentLongTermMemoryConfig,
    AgentMemoryStatus,
    AgentMemoryType,
    SaveAgentLongTermMemoryParams,
    AgentConfig,
    AgentRunRecordConfig,
    AgentTaskConfig,
    AgentTaskExecutionMode,
    AgentTaskNotifyPlatform,
    AgentTaskScheduleType,
    MCPServerConfig,
    SkillConfig,
    AIModel,
    AIModelConnectionResult,
    ArticleRagScheduleConfig,
    AIProvider,
    MemosPushConfig,
    SystemAIConfig,
    ImageUploadConfig,
    WebDavConfig,
    WebDavSyncStatus,
    RuntimeInfo,
    GeoLocation,
    SaveGeoLocationParams,
    SaveAgentConfigParams,
    SaveAgentTaskConfigParams,
    SaveMCPServerConfigParams,
    SaveSkillConfigParams,
    MCPTransport,
    MCPSource,
    MCPToolConfig,
    SystemMCPConfig,
};

// --- 模拟数据 ---
export const MOCK_PROVIDERS: AIProvider[] = [
    {
        id: 'p_deepseek',
        name: 'DeepSeek',
        type: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-********************',
        models: [
            {id: 'm_ds_chat', name: 'deepseek-chat', type: 'chat'},
            {id: 'm_ds_coder', name: 'deepseek-coder', type: 'chat'}
        ]
    },
    {
        id: 'p_qwen',
        name: 'Qwen',
        type: 'Qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-********************',
        models: [
            {id: 'm_qwen_max', name: 'qwen-max', type: 'chat'},
            {id: 'm_qwen_turbo', name: 'qwen-turbo', type: 'chat'},
            {id: 'm_qwen_vl', name: 'qwen-vl-plus', type: 'image'},
            {id: 'm_qwen_emb', name: 'text-embedding-v1', type: 'embedding'}
        ]
    }, {
        id: 'p_openai',
        name: 'OpenAI',
        type: 'OpenAi',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-********************',
        models: [
            {id: 'm_gpt4o', name: 'gpt-5.1', type: 'chat'},
            {id: 'm_gpt35', name: 'gpt-4.1-turbo', type: 'chat'},
            {id: 'm_gpt4o_image', name: 'gpt-4o', type: 'image'},
            {id: 'm_emb3', name: 'text-embedding-3-small', type: 'embedding'}
        ]
    },
    {
        id: 'p_minimax',
        name: 'MiniMax',
        type: 'MiniMax',
        baseUrl: 'https://api.minimaxi.com/v1',
        apiKey: 'sk-********************',
        models: [
            {id: 'm_minimax_m27', name: 'MiniMax-M2.7', type: 'chat'},
            {id: 'm_minimax_m27_fast', name: 'MiniMax-M2.7-highspeed', type: 'chat'}
        ]
    },
    {
        id: 'p_ollama',
        name: 'Ollama',
        type: 'Ollama',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        models: [
            {id: 'm_llama3', name: 'qwen3:14b', type: 'chat'},
            {id: 'm_bge', name: 'bge-m3', type: 'rerank'}
        ]
    }
];

// 这里预留后续对接真实接口的位置
// 1. 获取所有服务商列表
export const getProviders = () => request.get<AIProvider[]>('/settings/providers/');

// 2. 保存服务商 (新增或更新)
export const saveProvider = (data: Partial<AIProvider>) => {
    if (data.id) {
        return request.put<AIProvider>(`/settings/providers/${data.id}/`, data);
    }
    return request.post<AIProvider>('/settings/providers/', data);
};

// 3. 删除服务商
export const deleteProvider = (id: string) => request.delete(`/settings/providers/${id}/`);

// 4. 添加/保存模型
export const saveModel = (data: { provider: string, name: string, type: ModelType }) => {
    return request.post<AIModel>('/settings/models/', data);
};

// 5. 删除模型
export const deleteModel = (id: string) => request.delete(`/settings/models/${id}/`);

export const testAIModelConnection = (id: string) => {
    return request.post<any, AIModelConnectionResult>(`/settings/models/${id}/test_connection/`, undefined, {timeout: 25000});
};

// 6. 获取系统 AI 配置
export const getSystemAIConfig = () => request.get<SystemAIConfig>('/settings/config/get_ai_config/');

// 7. 保存系统 AI 配置
export const saveSystemAIConfig = (data: SystemAIConfig) => request.post('/settings/config/save_ai_config/', data);

export const getImageUploadConfig = () => request.get<any, ImageUploadConfig>('/settings/config/get_image_upload_config/');

export const saveImageUploadConfig = (data: ImageUploadConfig) => request.post<any, ImageUploadConfig>('/settings/config/save_image_upload_config/', data);

export const getAgents = () => request.get<AgentConfig[]>('/settings/agents/');

export const saveAgent = (data: SaveAgentConfigParams) => {
    if (data.id) {
        return request.put<AgentConfig>(`/settings/agents/${data.id}/`, data);
    }
    return request.post<AgentConfig>('/settings/agents/', data);
};

export const deleteAgent = (id: string) => request.delete(`/settings/agents/${id}/`);

export const getAgentMemories = (agentId: string) => request.get<any, AgentLongTermMemoryConfig[]>(`/settings/agents/${agentId}/memories/`);

export const saveAgentMemory = (agentId: string, data: SaveAgentLongTermMemoryParams) => {
    if (data.id) {
        return request.put<any, AgentLongTermMemoryConfig>(`/settings/agents/${agentId}/memories/${data.id}/`, data);
    }
    return request.post<any, AgentLongTermMemoryConfig>(`/settings/agents/${agentId}/memories/`, data);
};

export const archiveAgentMemory = (agentId: string, memoryId: string) => request.delete(`/settings/agents/${agentId}/memories/${memoryId}/`);

export const getAgentTasks = () => request.get<AgentTaskConfig[]>('/settings/agent-tasks/');

export const saveAgentTask = (data: SaveAgentTaskConfigParams) => {
    if (data.id) {
        return request.put<AgentTaskConfig>(`/settings/agent-tasks/${data.id}/`, data);
    }
    return request.post<AgentTaskConfig>('/settings/agent-tasks/', data);
};

export const deleteAgentTask = (id: string) => request.delete(`/settings/agent-tasks/${id}/`);

export const runAgentTaskNow = (id: string) => request.post(`/settings/agent-tasks/${id}/run_now/`);

export const getAgentRunRecords = () => request.get<AgentRunRecordConfig[]>('/settings/agent-run-records/');

export const getMCPServers = () => request.get<MCPServerConfig[]>('/settings/mcp-servers/');

export const saveMCPServer = (data: SaveMCPServerConfigParams) => {
    if (data.id) {
        return request.put<MCPServerConfig>(`/settings/mcp-servers/${data.id}/`, data, {timeout: 30000});
    }
    return request.post<MCPServerConfig>('/settings/mcp-servers/', data, {timeout: 30000});
};

export const deleteMCPServer = (id: string) => request.delete(`/settings/mcp-servers/${id}/`);

export const scanMCPServers = () => request.post<any, { count: number, servers: MCPServerConfig[] }>('/settings/mcp-servers/scan/');

export const refreshMCPServerTools = (id: string) => request.post<MCPServerConfig>(`/settings/mcp-servers/${id}/refresh_tools/`, undefined, {timeout: 30000});

export const getSystemMCPConfig = () => request.get<SystemMCPConfig>('/settings/config/get_system_mcp_config/') as unknown as Promise<SystemMCPConfig>;

export const saveSystemMCPConfig = (data: Pick<SystemMCPConfig, 'enabled'>) => request.post<SystemMCPConfig>('/settings/config/save_system_mcp_config/', data) as unknown as Promise<SystemMCPConfig>;

export const regenerateSystemMCPKey = () => request.post<SystemMCPConfig>('/settings/config/regenerate_system_mcp_key/') as unknown as Promise<SystemMCPConfig>;

export const getSkills = () => request.get<SkillConfig[]>('/settings/skills/');

export const saveSkill = (data: SaveSkillConfigParams) => {
    if (data.id) {
        return request.put<SkillConfig>(`/settings/skills/${data.id}/`, data);
    }
    return request.post<SkillConfig>('/settings/skills/', data);
};

export const deleteSkill = (id: string) => request.delete(`/settings/skills/${id}/`);

export const getRuntimeInfo = () => request.get<any, RuntimeInfo>('/settings/config/get_runtime_info/');

export const getMemosPushConfig = () => request.get<MemosPushConfig>('/settings/config/get_memos_push_config/') as unknown as Promise<MemosPushConfig>;

export const saveMemosPushConfig = (data: MemosPushConfig) => request.post('/settings/config/save_memos_push_config/', data);

export const getArticleRagScheduleConfig = () => request.get<ArticleRagScheduleConfig>('/settings/config/get_article_rag_schedule_config/') as unknown as Promise<ArticleRagScheduleConfig>;

export const saveArticleRagScheduleConfig = (data: ArticleRagScheduleConfig) => request.post('/settings/config/save_article_rag_schedule_config/', data);

export const runArticleRagNow = () => request.post<any, { detail: string }>('/settings/config/run_article_rag_now/');

// --- WebDAV 相关接口 ---

// 1. 获取 WebDAV 配置 (如果需要单独获取)
export const getWebDavConfig = () => request.get<WebDavConfig>('/settings/config/get_webdav_config/');

// 1.1 获取 WebDAV 同步状态
export const getWebDavStatus = () => request.get<WebDavSyncStatus>('/settings/config/get_webdav_status/');

// 2. 测试连接并保存配置
export const saveWebDavConfig = (data: WebDavConfig) => request.post('/settings/config/save_webdav_config/', data);

// 3. 触发上传 (备份到 WebDAV)
export const syncToWebDav = () => request.post<any, { msg: string }>('/settings/config/sync_to_webdav/');

// 4. 触发下载 (从 WebDAV 恢复)
export const syncFromWebDav = () => request.post<any, { msg: string }>('/settings/config/sync_from_webdav/');

export const getGeoLocations = () => request.get<any, GeoLocation[]>('/settings/locations/');

export const saveGeoLocation = (data: SaveGeoLocationParams) => {
    if (data.id) {
        return request.put<any, GeoLocation>(`/settings/locations/${data.id}/`, data);
    }
    return request.post<any, GeoLocation>('/settings/locations/', data);
};

export const deleteGeoLocation = (id: string) => request.delete(`/settings/locations/${id}/`);
