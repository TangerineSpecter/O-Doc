import request from '../utils/request';
import type {
    ModelType,
    AIModel,
    AIProvider,
    MemosPushConfig,
    SystemAIConfig,
    WebDavConfig,
    WebDavSyncStatus,
    GeoLocation,
    SaveGeoLocationParams,
} from '../types/api/setting';

// 重新导出类型以便其他组件使用
export type {
    ModelType,
    AIModel,
    AIProvider,
    MemosPushConfig,
    SystemAIConfig,
    WebDavConfig,
    WebDavSyncStatus,
    GeoLocation,
    SaveGeoLocationParams,
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

// 6. 获取系统 AI 配置
export const getSystemAIConfig = () => request.get<SystemAIConfig>('/settings/config/get_ai_config/');

// 7. 保存系统 AI 配置
export const saveSystemAIConfig = (data: SystemAIConfig) => request.post('/settings/config/save_ai_config/', data);

export const getMemosPushConfig = () => request.get<MemosPushConfig>('/settings/config/get_memos_push_config/') as unknown as Promise<MemosPushConfig>;

export const saveMemosPushConfig = (data: MemosPushConfig) => request.post('/settings/config/save_memos_push_config/', data);

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
