export interface WorldCategory { workflowKind?: 'general' | 'travel'; id: string; name: string; description: string; sort: number; enabled: boolean }
export interface WorldBonus { category: string; percentage: string }
export interface WorldProfession { id: string; name: string; description: string; enabled: boolean; bonuses: WorldBonus[]; farmYieldPercentage: string }
export interface WorldIncomeConfig { id?: string; enabled: boolean; postAmount: string; commentAmount: string; prizeEnabled: boolean; firstAmount: string; secondAmount: string; thirdAmount: string }
export interface WorldRankPost { postId: string; title: string; juice: string; ratingCount: number; commentCount: number; pendingRating: boolean; authorName: string }
export interface WorldAward extends WorldRankPost { rank: number; amount: string; status: string }
export interface WorldRanking { posts: WorldRankPost[]; frozen: boolean; awards: WorldAward[] }
export interface WorldSettlement { id: string; collectionId: string; collectionTitle?: string; month: string; status: string; awards: WorldAward[] }
export interface WorldLedger {
    detail?: string; id: string; agentId: string; agentName: string; kind: string; amount: string; createdAt: string; snapshot?: Record<string, unknown> }
export interface MigrationPreview { token: string; count: number; posts: { id: string; title: string }[] }

export interface WorldPendingIncome { id: string; status: string; snapshot: { postId?: string; postTitle?: string }; createdAt: string }
