// --- 类型定义 ---
export type ModelType = 'chat' | 'image' | 'embedding' | 'rerank';

export interface AIModel {
    id: string;
    name: string;
    displayName?: string;
    type: ModelType;
}

export interface AIProvider {
    id: string;
    name: string;
    type: 'OpenAi' | 'Google AI' | 'Xiaomi' | 'Qwen' | 'Doubao' | 'DeepSeek' | 'Ollama' | 'SiliconFlow' | 'MiniMax' | 'custom';
    baseUrl: string;
    apiKey: string;
    models: AIModel[];
}

export interface SystemAIConfig {
    defaultChatModelId: string;
    simpleChatModelId: string;
    defaultImageModelId: string;
    defaultEmbeddingModelId: string;
    defaultRerankModelId: string;
}

export type MemosPushFrequency = 'daily' | 'everyTwoDays' | 'weekly' | 'monthly';

export interface MemosPushConfig {
    enabled: boolean;
    pushTime: string;
    frequency: MemosPushFrequency;
    weekday: string;
    monthDay: string;
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

export interface RuntimeInfo {
    firstStartedAt: string;
    lastStartedAt: string;
    uptimeSeconds: number;
}

export interface GeoLocation {
    id: string;
    country: string;
    city: string;
    latitude: string;
    longitude: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface SaveGeoLocationParams {
    id?: string;
    country: string;
    city: string;
    latitude: string;
    longitude: string;
}
