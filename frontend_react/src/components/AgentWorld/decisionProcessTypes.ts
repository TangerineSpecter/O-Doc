export type DecisionGuideKind = 'main_schedule' | 'interleaving' | 'travel' | 'farm' | 'investment'
    | 'post_publish' | 'post_interaction' | 'exploration' | 'cooking' | 'alchemy' | 'lottery'
    | 'fishing' | 'tournament' | 'blacksmith' | 'market' | 'social' | 'theatre' | 'memo_capture' | 'bounty';

export interface DecisionFlowStep {
    title: string;
    detail: string;
    role: '模型选择' | '系统判断' | '系统执行';
    input?: string;
    options?: string;
    repeat?: string;
    branch?: string;
}

export interface DecisionProcessGuide {
    title: string;
    subtitle: string;
    theme: 'orange' | 'purple' | 'emerald';
    introduction: string;
    steps: DecisionFlowStep[];
    notes: Array<{title: string; detail: string}>;
    loop?: string;
    upcoming?: string;
}
