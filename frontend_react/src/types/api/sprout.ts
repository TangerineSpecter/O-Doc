export interface SproutTool {serverId: string; name: string; label?: string; description?: string}
export interface SproutSource {memoId: string; content: string; tag: string; creatorType: string; creatorId: string; creatorName: string; createdAt: string}
export interface SproutResult {kind: 'article' | 'insight' | 'no_direction'; title: string; body: string; length: number; mode: 'research' | 'inspiration'; references: {url: string; title: string; excerpt?: string}[]}
export interface SproutRecord {id: string; sources: SproutSource[]; direction: string; modelId: string; status: string; stage: string; error: string; result: Partial<SproutResult>; articleId: string; createdAt: string}
export interface SproutInput {memoIds: string[]; direction: string; modelId: string; tools: SproutTool[]}
export interface SproutOptions {models: {id: string; name: string}[]; tools: SproutTool[]}
