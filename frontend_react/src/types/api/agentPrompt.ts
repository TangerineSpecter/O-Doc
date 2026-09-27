export type CharacterType = 'existing' | 'original';

export interface AgentPromptInput {
    characterType: CharacterType;
    characterName: string;
    source: string;
    description: string;
    requirements: string;
    avatar: string;
    referenceAvatar: boolean;
    avatarDescription?: string;
    modelId: string;
}

export interface AgentAvatarDescription {
    description: string;
    avatarUsed: boolean;
    warning: string;
}

export interface AgentPromptResult {
    status: 'ready' | 'needs_information';
    prompt: string;
    question: string;
    avatarUsed: boolean;
    warning: string;
}
