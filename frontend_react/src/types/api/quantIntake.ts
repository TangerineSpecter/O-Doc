import type {QuantIntakeInput, QuantRunStatus} from './quant';

export type QuantMaterial = Omit<QuantIntakeInput, 'requestKey' | 'analyze' | 'modelId'>;
export interface QuantBatchInput {
    requestKey: string; name: string; items: QuantMaterial[]; analyze: boolean; modelId: string; wallSeconds: number;
}
export interface QuantBatchRetry {requestKey: string; modelId: string; wallSeconds: number}
export type QuantBatchStatus = 'pending' | 'running' | 'completed' | 'partial' | 'archived' | 'waiting_model' | 'cancelled' | 'wall_budget' | 'interrupted' | 'executor_failed';
export interface QuantBatch {
    id: string; name: string; createdAt: string; status: QuantBatchStatus; message: string; retryBatchId: string | null;
    plan: {version: 1; name: string; sources: string[]; modelId: string; analyze: boolean; wallSeconds: number; parentId: string; requestHash: string};
    outcome: null | {version: 1; reason: string; status: QuantBatchStatus; message: string; dispatched: number; reservedCalls: number; completed: number};
    completed: number; reservedCalls: number; callLimit: number;
    items: {ordinal: number; sourceId: string; entryId: string; title: string; available: boolean;
        status: QuantRunStatus | 'waiting' | 'not_started' | 'rejected'; message: string; runId: string | null; reportId: string | null}[];
}
