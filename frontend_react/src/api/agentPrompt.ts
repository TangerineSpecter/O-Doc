import request from '@/utils/request';
import type {AgentAvatarDescription, AgentPromptInput, AgentPromptResult} from '@/types/api/agentPrompt';

export const describeAgentAvatar = (avatar: string, signal: AbortSignal) =>
    request.post<unknown, AgentAvatarDescription>('/settings/agents/describe-avatar/', {avatar}, {signal, timeout: 65000});

export const generateAgentPrompt = (input: AgentPromptInput, signal: AbortSignal) =>
    request.post<unknown, AgentPromptResult>('/settings/agents/generate-prompt/', input, {signal, timeout: 185000});
