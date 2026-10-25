export interface QuantStrategyPolicy {
    version: 1; direction: 'long_only' | 'short_only' | 'long_short'; booleanSide: 'long' | 'short';
    shortEntryThreshold: number; longExitThreshold: number; shortExitThreshold: number;
    positionFraction: number; stopLossFraction: number | null; takeProfitFraction: number | null;
    maxHoldingBars: number; cooldownBars: number; maxEntries: number; shortBorrowBpsPerBar: number; sameOpenReversal: boolean;
}
export interface StrategyTrade {
    id: string; side: 'long' | 'short'; entryBar: number; exitBar: number; signalBar: number; entrySignal: number | boolean | null;
    entryTimestamp: string; exitTimestamp: string; entryRawPrice: number; entryFillPrice: number; exitRawPrice: number; exitFillPrice: number;
    quantity: number; entryEquity: number; positionFraction: number; entryFee: number; exitFee: number; borrowCost: number;
    grossPnl: number; netPnl: number; exitReason: string;
}
export interface StrategyExecution {
    version: 1; semantics: string; policyHash: string; baseline: boolean; status: 'completed' | 'insolvent';
    fees: number; borrowCost: number; realizedPnl: number; capitalDeficit: number; entryBudgetBlockedBars: number;
    exitReasons: Record<string, number>; ledgerScope: 'full_trades' | 'summary_only'; trades?: StrategyTrade[];
}
