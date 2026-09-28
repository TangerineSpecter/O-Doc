import request from '@/utils/request';
import type {PublishPreview} from '@/types/api/agentPublish';
export const previewAgentPublication = (taskId: string, agentId: string, signal: AbortSignal) =>
    request.post<never, PublishPreview>(`/settings/agent-tasks/${taskId}/preview/`, {agentId}, {timeout: 310000, signal});

export const getPublishCollections = () => request.get<never, {collId: string; title: string; type: string}[]>('/settings/agent-tasks/publish_collections/');
