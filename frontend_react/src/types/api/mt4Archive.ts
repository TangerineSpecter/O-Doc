export interface MT4Parameter {name: string; value: string; label?: string; type?: string; description?: string}
export interface MT4ParameterSet {name: string; parameters: MT4Parameter[]}
export interface MT4Expert {
    id: string; name: string; category: string; version: string; sourceUrl: string; forumUrl: string;
    minimumCapital: string; timeframe: string; accountRequirement: string; requirements: string; notes: string; tradingLogic: string; parameters: MT4Parameter[]; parameterSets: MT4ParameterSet[];
    createdAt: string; updatedAt: string;
}
export type MT4ExpertInput = Omit<MT4Expert, 'id' | 'createdAt' | 'updatedAt'>;
export interface MT4Event {sequence: string; time: string; type: string; order: string; lots: string; price: string; stopLoss: string; takeProfit: string; profit: string; balance: string}
export interface MT4Report {
    title?: string; server?: string; build?: string; fields?: Record<string, string>; parameters?: MT4Parameter[];
    metrics?: string[][]; events?: MT4Event[]; imageReferences?: string[]; source?: string; hasChart?: boolean; expertVersion?: string; visionModel?: string;
}
export interface MT4Test {id: string; expertId: string; title: string; description: string; conclusion: string; data: MT4Report; reportHash: string; createdAt: string; updatedAt: string}
export interface MT4Attachment {id: string; assetId: string; backtestId: string | null; role: string; note: string; name: string; fileType: string; url: string}
export interface MT4ExpertDetail {expert: MT4Expert; backtests: MT4Test[]; attachments: MT4Attachment[]}
export interface MT4TestDetail {backtest: MT4Test; attachments: MT4Attachment[]}
export interface MT4Preview {report: MT4Report; reportHash: string; hasChart: boolean; duplicates: {id: string; title: string}[]}
