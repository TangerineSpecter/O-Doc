import type {DecisionFailoverState} from './decision';

export interface LifeSettings {
    agentIds: string[]; mode: 'fixed' | 'random'; period: 'daily' | 'weekly' | 'monthly' | 'yearly'; count: number;
    intervalMinutes: number; activeStart: string; activeEnd: string; minGapMinutes: number; minRemainingMinutes: number;
    decisionModelId: string; decisionConnectionId?: string; decisionConnectionIds?: string[];
    decisionStickyTtlSeconds?: number;
    jevEnabled?: boolean; jevExcludedScenes?: string[];
    marketAutomationV2?: boolean;
    interleavingEnabled?: boolean; interleavingCheckMinutes?: number;
    interleavingDecisionMinutes?: number; interleavingWaitMinutes?: number;
}
export interface LifeConfig {settings: LifeSettings; pausedAgents: string[]; migrated: boolean; profileAgentIds?: string[]; activeAgentIds?: string[]; migrationSummary?: {convertedItems: number; runningItems: number}; activeCycle: Array<{id: string; startsAt: string; endsAt: string}>; decisionFailover?: DecisionFailoverState}
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
export interface LifeTravelPlan {
    destination: {id: string; countryCode: string; country: string; region: string; city: string;
        price: string; visited?: boolean; requiredBudget?: string};
    budget: string;
    budgetSource: 'structured' | 'price_tier';
    quotedAt: string;
}
export interface LifeAlchemyPlan {
    version: 1;
    entries: Array<{recipeId: string; quantity: number;
        rule: {name: string; ingredients: Array<{sku: string; quantity: number}>;
            requiredLevel: number; salePrice: string; experience: number; energyCost: number}}>;
    materials: Array<{sku: string; quantity: number}>;
}
export interface LifeDailyChoice {
    time: string;
    plan: {id: string; activity: string; reason: string; offeredActivities?: string[]; travelPlan?: LifeTravelPlan};
}
export interface LifeItem {
    source?: 'schedule' | 'interleaved' | 'manual' | 'reservation';
    reservation?: {id: string; status: string; dungeonId: string; dungeonName?: string; prepareAt: string; startsAt: string; endsAt: string; durationSeconds: number; reason: string; runId: string; members: {actorId: string; name: string; jobId: string; durationSeconds: number; status: string}[]};
    actualStartedAt?: string | null; actualEndedAt?: string | null; actualEnergyCost?: string | null;
    activityUsage?: {requests: number; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; usageComplete: boolean} | null;
    domainDetail?: {kind: 'exploration' | 'fishing' | 'blacksmith'; id: string} | null;
    id: string; actorId: string; originalAt: string; scheduledAt: string; activity: string; taskId: string;
    status: string; intent: string; budget: string; spent: string; recordId: string;
    result: {reason?: string; piecesMade?: number; operations?: import('./blacksmith').BlacksmithPiece[];
        stages?: Record<string, unknown>[]}; context?: Record<string, unknown> & {
        lotteryPlan?: {roundId: string; quantity: number}; lotteryNumbers?: number[][]; lotteryAttempts?: number;
        cookingPlan?: LifeCookingPlan; alchemyPlan?: LifeAlchemyPlan; travelPlan?: LifeTravelPlan; dailyChoice?: LifeDailyChoice};
    retryAvailable?: boolean; retryBlockedReason?: string;
    revisions?: Array<{id: string; before: Record<string, unknown>; after: Record<string, unknown>; reason: string; createdAt: string}>;
}
export type LifeScheduleSource = 'all' | 'main' | 'interleaved' | 'reservation';
export interface LifeSchedule {explorationPlanning?: {day: string; actorId: string; name: string; participate: boolean; dungeonId?: string; durationSeconds?: number; status: string; reason: string}[]; counts?: {main: number; interleaved: number; reservation?: number}; summary?: Record<string, number>; items: LifeItem[]; total: number; page: number}
