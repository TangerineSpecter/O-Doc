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
    type: 'OpenAi' | 'Google AI' | 'Xiaomi' | 'Qwen' | 'Doubao' | 'DeepSeek' | 'Ollama' | 'SiliconFlow' | 'custom';
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
    remotePath: string;
    username: string;
    password: string;
    interval: number;
}

export interface WebDavSyncStatus {
    status: 'idle' | 'running' | 'success' | 'error' | string;
    trigger: string;
    runnerId: string;
    lastStartedAt: string;
    lastSuccessAt: string;
    lastPullAt: string;
    lastPushAt: string;
    lastError: string;
    lastSummary: string[];
    lastSyncedSnapshotId: string;
    lastUploadedSnapshotId: string;
    lastPulledSnapshotId: string;
    updatedAt: string;
}
