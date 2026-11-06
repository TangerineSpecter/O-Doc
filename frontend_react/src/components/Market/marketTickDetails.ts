import type {MarketAutomationTick} from '../../types/api/market';

export interface MarketTickIssue {kind: string; quantity?: number; item: string; reason: string}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function marketTickIssues(tick: MarketAutomationTick): MarketTickIssue[] {
    const outcome = object(tick.hits.outcome);
    return (Array.isArray(outcome.failed) ? outcome.failed : []).map(value => {
        const entry = object(value), operation = object(entry.operation);
        return {kind: typeof operation.kind === 'string' ? operation.kind : '交易',
            quantity: typeof operation.quantity === 'number' ? operation.quantity : undefined,
            item: String(operation.materialId || operation.material_id || operation.itemId || operation.item_id || ''),
            reason: typeof entry.reason === 'string' ? entry.reason : '交易失败'};
    });
}
