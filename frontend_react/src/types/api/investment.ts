export interface InvestmentConfig {ownerId?: string; searchServerId?: string}
export interface InvestmentResident {id: string; name: string}
export interface InvestmentPage<T> {items: T[]; total: number; page: number}
export type InvestmentTab = 'positions' | 'trades' | 'decisions';
export interface InvestmentPosition {
    code: string; name: string; quantity: number; availableQuantity: number;
    cost: string; averageCost: string; closePrice: string | null; priceDate: string | null;
    marketValue: string | null; unrealizedProfit: string | null; returnPercent: string | null;
    firstBought: string; lastBought: string; buyReason: string;
}
export interface InvestmentOverview {
    actorId: string; actorName: string; balance: string | null; realizedProfit: string;
    unrealizedProfit: string; marketValue: string; positionCount: number;
    positions: InvestmentPage<InvestmentPosition>;
}
export interface InvestmentTrade {
    id: string; createdAt: string;
    operation: {code: string; name: string; quantity: number; side: 'buy' | 'sell'; reason: string; day: string};
    result: {price: string; priceDate: string; source: string; cashDelta: string; allocatedCost: string; realizedProfit: string};
}
export interface InvestmentDecision {
    id: string; createdAt: string; status: string; reason: string; referenceDate: string;
    calls: Array<{tool: string; arguments: Record<string, unknown>; result: unknown}>;
}
export interface InvestmentAnalysis {
    asOf: string; analysisAdjust: string; quote: {price: string; date: string; source: string};
    indicators: {macd: {dif: number; dea: number; histogram: number; cross: string}; rsi14: number;
        ma: Record<string, number>; change5: number; sampleCount: number};
}
export interface InvestmentDetail {position: InvestmentPosition; analysis: InvestmentAnalysis | null; analysisError?: string}
