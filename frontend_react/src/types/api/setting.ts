// --- 类型定义 ---
export type ModelType = 'chat' | 'image' | 'embedding' | 'rerank';

export interface AIModel {
    id: string;
    name: string;
    displayName?: string;
    type: ModelType;
}

export interface AIModelConnectionResult {
    ok: boolean;
    modelId: string;
    modelName: string;
    modelType: ModelType;
    providerName: string;
    statusCode?: number;
    elapsedMs: number;
    detail?: string;
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

export interface ImageUploadConfig {
    maxLongEdge: number;
    maxFileSizeMb: number;
}

export interface AgentConfig {
    id: string;
    name: string;
    avatar: string;
    model: string | null;
    modelDetail?: AIModel | null;
    prompt: string;
    mcpServers: string[];
    skills: string[];
    feishuImEnabled: boolean;
    feishuAppId: string;
    feishuAppSecret: string;
    feishuVerificationToken: string;
    feishuEncryptKey: string;
    createdAt?: string;
    updatedAt?: string;
}

export type SaveAgentConfigParams = Omit<AgentConfig, 'id' | 'modelDetail' | 'createdAt' | 'updatedAt'> & {
    id?: string;
};

export type AgentMemoryType = 'preference' | 'fact' | 'project' | 'instruction' | 'other';
export type AgentMemoryStatus = 'active' | 'archived';

export interface AgentLongTermMemoryConfig {
    id: string;
    agent: string;
    scope: string;
    chatId: string;
    senderId: string;
    memoryType: AgentMemoryType;
    title: string;
    content: string;
    confidence: number;
    sourceCount: number;
    status: AgentMemoryStatus;
    lastRecalledAt?: string | null;
    metadata?: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
}

export type SaveAgentLongTermMemoryParams = Pick<AgentLongTermMemoryConfig, 'memoryType' | 'title' | 'content' | 'status'> & {
    id?: string;
    scope?: string;
    chatId?: string;
    senderId?: string;
    confidence?: number;
};

export type AgentTaskScheduleType = 'daily' | 'weekly' | 'monthly' | 'interval';
export type AgentTaskNotifyPlatform = 'feishu';
export type AgentTaskExecutionMode = 'parallel' | 'serial';
export type AgentRunStatus = 'success' | 'failed' | 'running';
export type AgentRunStepStatus = AgentRunStatus | 'info';

export interface AgentTaskConfig {
    id: string;
    name: string;
    agent: string;
    agentName: string;
    agents?: string[];
    agentNames?: string[];
    executionMode: AgentTaskExecutionMode;
    trigger: string;
    schedule: string;
    scheduleType: AgentTaskScheduleType;
    scheduleTime: string;
    scheduleWeekday: string;
    scheduleMonthDay: string;
    intervalMinutes: number;
    enabled: boolean;
    prompt: string;
    notifyEnabled: boolean;
    notifyPlatform: AgentTaskNotifyPlatform;
    notifyWebhookUrl: string;
    createdAt?: string;
    updatedAt?: string;
}

export type SaveAgentTaskConfigParams = Omit<AgentTaskConfig, 'id' | 'agentName' | 'agentNames' | 'createdAt' | 'updatedAt'> & {
    id?: string;
};

export interface AgentRunRecordConfig {
    id: string;
    task?: string | null;
    taskName: string;
    agent?: string | null;
    agentName: string;
    agentRuns?: AgentRunAgentConfig[];
    trigger: string;
    status: AgentRunStatus;
    startedAt: string;
    duration: string;
    summary: string;
    output?: string;
    steps?: AgentRunStepConfig[];
    createdAt?: string;
    updatedAt?: string;
}

export interface AgentRunStepConfig {
    time: string;
    status: AgentRunStepStatus;
    title: string;
    detail?: string;
}

export interface AgentRunAgentConfig {
    agent: string;
    agentName: string;
    agentAvatar?: string;
    status: AgentRunStatus;
    summary: string;
    content?: string;
    duration?: string;
    steps?: AgentRunStepConfig[];
}

export type MCPTransport = 'stdio' | 'sse' | 'streamableHttp';
export type MCPSource = 'system' | 'external';

export interface MCPToolConfig {
    name: string;
    description?: string;
    enabled: boolean;
}

export interface MCPServerConfig {
    id: string;
    name: string;
    transport: MCPTransport;
    command: string;
    args: string[];
    url: string;
    headers: Record<string, string>;
    env: Record<string, string>;
    source: MCPSource;
    enabled: boolean;
    availableInChat: boolean;
    description: string;
    tools?: MCPToolConfig[];
    createdAt?: string;
    updatedAt?: string;
}

export interface SystemMCPConfig {
    enabled: boolean;
    apiKey: string;
    endpoint: string;
}

export type SaveMCPServerConfigParams = Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
};

export type SkillSource = 'skillhub' | 'local' | 'built_in';

export interface SkillConfig {
    id: string;
    name: string;
    description: string;
    version: string;
    source: SkillSource;
    skillKey: string;
    entry: string;
    prompt: string;
    enabled: boolean;
    availableInChat: boolean;
    isSystem: boolean;
    manifest: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
}

export type SaveSkillConfigParams = Omit<SkillConfig, 'id' | 'isSystem' | 'createdAt' | 'updatedAt'> & {
    id?: string;
};

export type MemosPushFrequency = 'daily' | 'everyTwoDays' | 'weekly' | 'monthly';

export interface MemosPushConfig {
    enabled: boolean;
    pushTime: string;
    frequency: MemosPushFrequency;
    weekday: string;
    monthDay: string;
}

export interface ArticleRagScheduleConfig {
    enabled: boolean;
    runTime: string;
}

export type SyncProtocol = 'webdav' | 'ftp' | 'sftp';

export interface WebDavConfig {
    enabled: boolean;
    protocol?: SyncProtocol;
    url: string;
    host?: string;
    port?: number | null;
    remotePath: string;
    username: string;
    password: string;
    interval: number;
    useTls?: boolean;
    passive?: boolean;
    privateKey?: string;
    passphrase?: string;
    hostKey?: string;
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
    lastBaseSnapshotId?: string;
    lastUploadedSnapshotId: string;
    lastPulledSnapshotId: string;
    updatedAt: string;
    lastSafetyBackup?: string;
    lastMergeSummary?: {created?: number; updated?: number; deleted?: number; conflicts?: number};
}

export interface SyncHistoryEntry {
    snapshotId: string;
    generatedAt: string;
    source: string;
    deviceId: string;
    appVersion: string;
    recordCount: number;
    mediaCount: number;
    mediaBytes: number;
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
