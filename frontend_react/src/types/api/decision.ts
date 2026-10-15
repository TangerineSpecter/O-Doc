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

export interface DecisionConfig {
    providers: DecisionConnection[];
    connections: DecisionConnection[];
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
}
