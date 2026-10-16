export interface LifeSettings {
    agentIds: string[]; mode: 'fixed' | 'random'; period: 'daily' | 'weekly' | 'monthly' | 'yearly'; count: number;
    intervalMinutes: number; activeStart: string; activeEnd: string; minGapMinutes: number; minRemainingMinutes: number;
    decisionModelId: string; decisionConnectionId?: string;
    jevEnabled?: boolean; jevExcludedScenes?: string[];
}
export interface LifeConfig {settings: LifeSettings; pausedAgents: string[]; migrated: boolean; profileAgentIds?: string[]; activeAgentIds?: string[]; migrationSummary?: {convertedItems: number; runningItems: number}; activeCycle: Array<{id: string; startsAt: string; endsAt: string}>}
export interface LifeProfile {id: string; preferences: string; direction: string}
export interface LifeCondition {kind: 'subjective' | 'savings' | 'travel' | 'inventory'; amount?: string; destinationId?: string; sku?: string; quantity?: number; description?: string}
export interface LifeGoal {id: string; actorId: string; title: string; condition: LifeCondition; progress: string; status: 'active' | 'paused' | 'completed' | 'abandoned'; reason: string}
export interface LifeCookingPlan {
    version: 1;
    entries: Array<{
        recipeId: string;
        quantity: number;
        ingredientStrategy: 'low_stars_first' | 'high_stars_first';
        rule: {name: string; ingredients: Array<{sku: string; quantity: number}>;
            requiredLevel: number; salePrice: string; experience: number; energyCost: number};
    }>;
    materials: Array<{sku: string; quantity: number}>;
}
export interface LifeItem {
    id: string; actorId: string; originalAt: string; scheduledAt: string; activity: string; taskId: string;
    status: string; intent: string; budget: string; spent: string; recordId: string;
    result: {reason?: string}; context?: Record<string, unknown> & {cookingPlan?: LifeCookingPlan};
    retryAvailable?: boolean; retryBlockedReason?: string;
    revisions?: Array<{id: string; before: Record<string, unknown>; after: Record<string, unknown>; reason: string; createdAt: string}>;
}
export interface LifeSchedule {items: LifeItem[]; total: number; page: number}
