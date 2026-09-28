import type {AgentPublishConfig, PublishCategoryRule} from '@/types/api/agentPublish';
export const emptyPublishConfig = (): AgentPublishConfig => ({collectionId: '', searchServerId: '', rules: [], cooldownHours: 6, unreadEnabled: false, unreadCount: 3});
export const newPublishRule = (categoryId: string): PublishCategoryRule => ({categoryId, modes: ['news', 'topic'], topics: '', newsDays: 3, region: '全球', excludedTopics: ''});
