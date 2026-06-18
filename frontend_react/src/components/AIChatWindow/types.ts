// frontend_react/src/components/AIChatWindow/types.ts

import { type AgentConfig } from '../../api/setting';

export type ActivityStatus = 'queued' | 'active' | 'done';

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    thinking?: string;
    statusId?: string;
    status?: ActivityStatus;
}

export interface StreamChar {
    conversationKey: string;
    value: string;
}

export interface ActivityStep {
    id: string;
    label: string;
    detail?: string;
    status: ActivityStatus;
}

export interface AIChatWindowProps {
    isOpen: boolean;
    onClose: () => void;
    activeAgent?: AgentConfig | null;
    onOpenContacts?: () => void;
    onSelectAgent?: (agent: AgentConfig | null) => void;
}

export type AssistantMode = 'disabled' | 'manual' | 'auto';
