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
    type: 'openai' | 'azure' | 'anthropic' | 'ollama' | 'custom';
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
        id: 'p_openai',
        name: 'OpenAI',
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-********************',
        models: [
            { id: 'm_gpt4o', name: 'gpt-4o', type: 'chat' },
            { id: 'm_gpt35', name: 'gpt-3.5-turbo', type: 'chat' },
            { id: 'm_emb3', name: 'text-embedding-3-small', type: 'embedding' }
        ]
    },
    {
        id: 'p_ollama',
        name: 'Local Ollama',
        type: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        models: [
            { id: 'm_llama3', name: 'llama3:8b', type: 'chat' },
            { id: 'm_bge', name: 'bge-m3', type: 'rerank' }
        ]
    }
];

// 这里预留后续对接真实接口的位置
// export const getSettings = () => request.get('/settings');
// export const updateSettings = (data: any) => request.put('/settings', data);