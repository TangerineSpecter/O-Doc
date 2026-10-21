export type DecisionProtocol = 'systemone' | 'openai_chat_json';

export interface DecisionConnection {
    id: string;
    name: string;
    protocol: DecisionProtocol;
    baseUrl: string;
    modelId: string;
    builtIn: boolean;
    configured: boolean;
    apiKeyConfigured: boolean;
}

export interface DecisionFailoverState {
    order: string[];
    stickyConnectionId: string | null;
    stickyUntil: string | null;
    ttlSeconds: number;
}

export interface DecisionConfig {
    providers: DecisionConnection[];
    connections: DecisionConnection[];
    failover?: DecisionFailoverState;
}

export interface DecisionConnectionInput {
    name: string;
    protocol: DecisionProtocol;
    baseUrl: string;
    modelId: string;
    apiKey?: string | null;
}

export interface MarketDecisionConfig {
    ownerId?: string;
    decisionEnabled?: boolean;
    decisionProvider?: 'jev';
    marketAutomationV2?: boolean;
}
