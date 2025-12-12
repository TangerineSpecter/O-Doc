import request from '../utils/request';

// --- 类型定义 ---
export type ModelType = 'chat' | 'embedding' | 'rerank';

export interface AIModel {
    id: string;
    name: string;
    displayName?: string;
    type: ModelType;
}

export interface AIProvider {
    id: string;
    name: string;
    type: 'OpenAi' | 'Google AI' | 'Qwen' | 'Doubao' | 'DeepSeek' | 'Ollama' | 'custom';
    baseUrl: string;
    apiKey: string;
    models: AIModel[];
}

export interface SystemAIConfig {
    defaultChatModelId: string;
    defaultEmbeddingModelId: string;
    defaultRerankModelId: string;
}

export interface WebDavConfig {
    enabled: boolean;
    url: string;
    username: string;
    password: string;
    interval: number;
}

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
            {id: 'm_emb3', name: 'text-embedding-3-small', type: 'embedding'}
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
