import type {MarketAutomationTick} from '../../types/api/market';

export interface MarketTickIssue {kind: string; quantity?: number; item: string; reason: string}
export interface MarketTickStock {
    sku: string;
    sell: number;
    list: number;
    expiredReturn: number;
    blockedListing: number;
    sold: number;
    listed: number;
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown) => Array.isArray(value) ? value.map(object) : [];
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function marketTickStock(tick: MarketAutomationTick): MarketTickStock[] {
    const {hits} = tick;
    const outcome = object(hits.outcome);
    const settled = new Map(rows(outcome.stockSettled ?? outcome.stock_settled).map(row => [row.sku, row]));
    return rows(hits.stockDisposition ?? hits.stock_disposition).flatMap(row => {
        if (typeof row.sku !== 'string' || !row.sku) return [];
        const actual = settled.get(row.sku);
        return [{
            sku: row.sku, sell: count(row.sell), list: count(row.list),
            expiredReturn: count(row.expiredReturn ?? row.expired_return),
            blockedListing: count(row.blockedListing ?? row.blocked_listing),
            sold: count(actual?.sold), listed: count(actual?.listed),
        }];
    });
}

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
