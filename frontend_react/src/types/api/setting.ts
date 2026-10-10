import type {SocialFeeling} from './social';
// --- 类型定义 ---
export type ModelType = 'chat' | 'image' | 'image_generation' | 'embedding' | 'rerank';

export type ThinkingMode = 'default' | 'enabled' | 'disabled';
export type ThinkingProtocol = 'auto' | 'thinking' | 'enable_thinking' | 'adaptive' | 'reasoning_effort' | 'unsupported';
export interface ThinkingCapability {
    supported: boolean;
    protocol: ThinkingProtocol;
    manualProtocol: boolean;
    reason: string;
    enabledEffort: string;
}
export interface ModelInput {
    name: string;
    type: ModelType;
    thinkingMode: ThinkingMode;
    thinkingProtocol: ThinkingProtocol;
}

export interface AIModel {
    id: string;
    name: string;
    displayName?: string;
    thinkingMode?: ThinkingMode;
    thinkingProtocol?: ThinkingProtocol;
    thinkingCapability?: ThinkingCapability;
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
    type: 'OpenAi' | 'Google AI' | 'Xiaomi' | 'Qwen' | 'Doubao' | 'DeepSeek' | 'Ollama' | 'SiliconFlow' | 'MiniMax' | 'Grsai' | 'NewAPI' | 'custom';
    baseUrl: string;
    apiKey: string;
    models: AIModel[];
}

export interface SystemAIConfig {
    defaultChatModelId: string;
    simpleChatModelId: string;
    defaultImageModelId: string;
    defaultImageGenerationModelId: string;
    defaultEmbeddingModelId: string;
    defaultRerankModelId: string;
}

export interface ImageUploadConfig {
    maxLongEdge: number;
    maxFileSizeMb: number;
}

export interface AgentConfig {
    postCollectionIds?: string[];
    postCategoryIds?: string[];
    stamina?: string;
    profession?: string | null;
    professionName?: string;
    id: string;
    name: string;
    avatar: string;
    fullBodyImage?: string;
    model: string | null;
    modelDetail?: AIModel | null;
    prompt: string;
    money: string;
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

export type SaveAgentConfigParams = Omit<AgentConfig, 'id' | 'modelDetail' | 'money' | 'stamina' | 'createdAt' | 'updatedAt'> & {
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
export type AgentTaskRandomPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface AgentTaskRandomProgress {
    periodStart: string;
    periodEnd: string;
    mode: AgentTaskExecutionMode;
    targetCount: number;
    nextExecutionAt: string | null;
    status: 'scheduled' | 'running' | 'retrying' | 'complete';
    configPending: boolean;
    agents: {agentId: string; agentName: string; target: number; successCount: number; unavailable?: boolean}[];
}
export type AgentTaskNotifyPlatform = 'feishu';
export type AgentTaskExecutionMode = 'parallel' | 'serial';
export type AgentTaskFollowupAction = 'review' | 'continue_research';
export type AgentRunStatus = 'success' | 'failed' | 'running';
export type AgentRunStepStatus = AgentRunStatus | 'info';

export interface AgentTaskConfig {
    model?: string | null;
    investmentConfig?: import('./investment').InvestmentConfig;
    taskKind?: 'custom' | 'post_interaction' | 'post_publish' | 'travel' | 'farm' | 'market' | 'investment' | 'cooking';
    publishConfig?: import('./agentPublish').AgentPublishConfig;
    travelConfig?: import('./travel').TravelConfig;
    postCollectionIds?: string[];
    postCategoryIds?: string[];
    worldProgress?: {targetCount: number | null; processedCount: number; missedCount: number; nextExecutionAt: string | null; configPending: boolean} | null;
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
    scheduleMode?: 'fixed' | 'random';
    randomPeriod?: AgentTaskRandomPeriod;
    randomCount?: number;
    randomAllocations?: {agentId: string; count: number}[];
    randomProgress?: AgentTaskRandomProgress | null;
    scheduleTime: string;
    scheduleWeekday: string;
    scheduleMonthDay: string;
    intervalMinutes: number;
    enabled: boolean;
    prompt: string;
    notifyEnabled: boolean;
    notifyPlatform: AgentTaskNotifyPlatform;
    notifyWebhookUrl: string;
    followupEnabled: boolean;
    followupAgent: string | null;
    followupAction: AgentTaskFollowupAction;
    followupPrompt: string;
    createdAt?: string;
    updatedAt?: string;
}

export type SaveAgentTaskConfigParams = Omit<AgentTaskConfig, 'id' | 'agentName' | 'agentNames' | 'randomProgress' | 'worldProgress' | 'createdAt' | 'updatedAt'> & {
    id?: string;
};

export interface AgentRunRecordConfig {
    travelProgress?: {journeyId: string; status: string; phase: string; updatedAt: string; nextAt: string | null; attempts: number; authorized: boolean} | null;
    id: string;
    task?: string | null;
    taskName: string;
    agent?: string | null;
    agentName: string;
    agentRuns?: AgentRunAgentConfig[];
    randomContext?: {planId: string; periodStart: string; periodEnd: string; slot: number; leaseToken: string} | Record<string, never>;
    trigger: string;
    status: AgentRunStatus;
    startedAt: string;
    duration: string;
    summary: string;
    output?: string;
    steps?: AgentRunStepConfig[];
    parentRecord?: string | null;
    sourceAgent?: string | null;
    followupDepth?: number;
    createdAt?: string;
    updatedAt?: string;
}

export type AgentActivityType = 'work' | 'publication' | 'interaction';

export interface AgentActivityArtifact {
    kind: 'agentPost' | 'articleComment' | 'articleAnnotation';
    id: string;
    articleId: string;
    collId: string;
    title: string;
}

export interface AgentActivity {
    rating?: number | null;
    id: string;
    type: AgentActivityType;
    status: AgentRunStatus;
    agent: Pick<AgentConfig, 'id' | 'name' | 'avatar'>;
    title: string;
    summary: string;
    currentAction?: string;
    occurredAt: string;
    runRecordId?: string | null;
    outputPreview?: string;
    artifact?: AgentActivityArtifact | null;
}

export interface AgentWorldAgentStatus {
    id: string;
    name: string;
    avatar: string;
    status: 'running' | 'idle';
    currentAction: string;
    latestTitle: string;
    todayCount: number;
}

export interface AgentActivityListResult {
    items: AgentActivity[];
    nextCursor?: string | null;
    hasMore: boolean;
}

export interface AgentRelationNode {
    departed?: boolean;
    kind?: 'agent' | 'user';
    inventoryCount?: number;
    professionName?: string;
    id: string;
    name: string;
    avatar: string;
    money: string;
    stamina?: string;
    cooking?: import('./cooking').CookingSkill;
    planting?: import('./farm').PlantingSkill;
    creativity: number;
    postCount: number;
    ratedPostCount: number;
    activeDays: number;
    status: 'running' | 'idle';
}

export interface AgentRelationEdge {
    sourceId: string;
    targetId: string;
    tier: string;
    sourceScore: number | null;
    targetScore: number | null;
    sourceRelation?: SocialFeeling | null;
    targetRelation?: SocialFeeling | null;
    oneWay?: boolean;
    band?: string;
    sourceName: string;
    targetName: string;
}

export interface AgentRelationGraph {
    nodes: AgentRelationNode[];
    edges: AgentRelationEdge[];
}

export interface AgentWorldSummary {
    todayActivityCount: number;
    todayWorkCount: number;
    activeAgentCount: number;
    latest: AgentActivity[];
    agents: AgentWorldAgentStatus[];
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
    modelName?: string;
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
    autoSyncEnabled: boolean;
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
    cancelRequested?: boolean;
    syncProgress?: number;
    autoSyncConsecutiveFailures?: number;
    autoSyncNextRetryAt?: string;
    autoSyncPaused?: boolean;
    autoSyncPauseNoticeSent?: boolean;
    autoSyncMaxFailures?: number;
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
    snapshotBytes?: number | null;
}

export interface RuntimeInfo {
    firstStartedAt: string;
    lastStartedAt: string;
    uptimeSeconds: number;
}

export type SystemUpdateState =
    | 'idle'
    | 'queued'
    | 'pulling'
    | 'verifyingImage'
    | 'backingUp'
    | 'restarting'
    | 'healthCheck'
    | 'succeeded'
    | 'rolledBack'
    | 'failed';

export interface SystemUpdateStatus {
    currentVersion: string;
    currentCommit: string;
    autoUpdateSupported: boolean;
    state: SystemUpdateState;
    targetVersion: string;
    targetCommit: string;
    progress: number;
    message: string;
    requestedAt: string;
    startedAt: string;
    finishedAt: string;
    backupName: string;
    rollbackSucceeded: boolean | null;
}

export interface StartSystemUpdateParams {
    targetVersion: string;
    targetCommit: string;
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
