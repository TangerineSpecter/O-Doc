import type {AgentTaskConfig} from '@/types/api/setting';

// 内置行为即使尚未保存配置也可展示；空 id 只表示尚未持久化。
export const defaultPostInteractionTask: AgentTaskConfig = {
    id: '', taskKind: 'post_interaction', name: '阅读帖子并评论打分',
    agent: '', agentName: '', agents: [], executionMode: 'serial',
    trigger: '定时任务', schedule: '每 60 分钟 · 随机一位 Agent',
    scheduleType: 'interval', scheduleMode: 'fixed', intervalMinutes: 60,
    randomPeriod: 'daily', randomCount: 1, randomAllocations: [],
    scheduleTime: '09:00', scheduleWeekday: '1', scheduleMonthDay: '1',
    enabled: false, prompt: '', postCollectionIds: [], postCategoryIds: [],
    notifyEnabled: false, notifyPlatform: 'feishu', notifyWebhookUrl: '',
    followupEnabled: false, followupAgent: null, followupAction: 'review', followupPrompt: '',
};
