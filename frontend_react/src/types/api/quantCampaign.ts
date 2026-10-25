import type {QuantExperiment} from './quantExperiment';
export interface QuantCampaignInput {
    requestKey: string; name: string; proposalId: string; datasetIds: string[];
    maxRounds: number; maxAttempts: number; computeSeconds: number; wallSeconds: number; modelId: string;
}
export interface QuantCampaign {
    id: string; name: string; createdAt: string; status: 'pending' | 'running' | 'completed' | 'stopped' | 'cancelled' | 'interrupted';
    message: string; reason: string; plan: Omit<QuantCampaignInput, 'requestKey'> & {version: number};
    reservedAttempts: number; reservedComputeSeconds: number; modelCalls: number;
    rounds: {ordinal: number; experiment: QuantExperiment; reviewStatus: string | null}[];
    outcome: null | {version: number; status: string; reason: string; message: string; roundCount: number; independentValidationProven: false};
}
