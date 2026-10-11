export interface DecisionProvider {
    id: 'jev';
    name: string;
    configured: boolean;
}

export interface DecisionConfig {
    providers: DecisionProvider[];
}

export interface MarketDecisionConfig {
    ownerId?: string;
    decisionEnabled?: boolean;
    decisionProvider?: 'jev';
}
