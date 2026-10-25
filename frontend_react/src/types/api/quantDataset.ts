export interface QuantMarketRow {timestamp: string; open: number; high: number; low: number; close: number; volume: number | null}
export interface QuantDatasetInput {name: string; csvText: string; symbol: string; timeframe: string; timezone: string; priceAdjustment: string; source: string}
export interface QuantDataset {
    id: string; name: string; createdAt: string; contentHash: string; rowCount: number; start: string; end: string;
    symbol: string; timeframe: string; timezone: string; priceAdjustment: string; source: string; missingVolume: number; warnings: string[];
    preview?: QuantMarketRow[]; discardedColumns?: string[]; parserVersion?: number; timestampSemantics?: string;
}
