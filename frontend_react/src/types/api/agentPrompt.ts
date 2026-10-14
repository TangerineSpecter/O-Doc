export type CharacterType = 'existing' | 'original';

export interface AgentPromptInput {
    characterType: CharacterType;
    characterName: string;
    source: string;
    description: string;
    requirements: string;
    avatar: string;
    referenceAvatar: boolean;
    researchCharacter: boolean;
    avatarDescription?: string;
    modelId: string;
}

export interface AgentAvatarDescription {
    description: string;
    avatarUsed: boolean;
    warning: string;
}

export interface AgentPromptResult {
    roleProfile?: RoleProfile;
    status: 'ready' | 'needs_information';
    prompt: string;
    question: string;
    avatarUsed: boolean;
    researchUsed?: boolean;
    warning: string;
}

export interface RoleProfile {
    age: string; mbti: string; identity: string; personality: string;
    preferences: string; expression: string; appearance: string;
}
export interface RoleDraft {roleProfile: RoleProfile; prompt: string; warnings: string[]}
