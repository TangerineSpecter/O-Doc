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

export interface AgentConfig {
    id: string;
    name: string;
    avatar: string;
    model: string | null;
    modelDetail?: AIModel | null;
    prompt: string;
    mcpServers: string[];
    skills: string[];
    createdAt?: string;
    updatedAt?: string;
}

export type SaveAgentConfigParams = Omit<AgentConfig, 'id' | 'modelDetail' | 'createdAt' | 'updatedAt'> & {
    id?: string;
};

export type AgentTaskScheduleType = 'daily' | 'weekly' | 'monthly' | 'interval';
export type AgentTaskOutput = 'collection' | 'memos';
export type AgentTaskNotifyPlatform = 'feishu';
export type AgentRunStatus = 'success' | 'failed' | 'running';
export type AgentRunStepStatus = AgentRunStatus | 'info';

export interface AgentTaskConfig {
    id: string;
    name: string;
    agent: string;
    agentName: string;
    trigger: string;
    schedule: string;
    scheduleType: AgentTaskScheduleType;
    scheduleTime: string;
    scheduleWeekday: string;
    scheduleMonthDay: string;
    intervalMinutes: number;
    output: AgentTaskOutput;
    targetCollectionId?: string;
    targetCollectionTitle?: string;
    enabled: boolean;
    prompt: string;
    notifyEnabled: boolean;
    notifyPlatform: AgentTaskNotifyPlatform;
    notifyWebhookUrl: string;
    createdAt?: string;
    updatedAt?: string;
}

export type SaveAgentTaskConfigParams = Omit<AgentTaskConfig, 'id' | 'agentName' | 'createdAt' | 'updatedAt'> & {
    id?: string;
};

export interface AgentRunRecordConfig {
    id: string;
    task?: string | null;
    taskName: string;
    agent?: string | null;
    agentName: string;
    trigger: string;
    status: AgentRunStatus;
    startedAt: string;
    duration: string;
    summary: string;
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
    description: string;
    tools?: MCPToolConfig[];
    createdAt?: string;
    updatedAt?: string;
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
