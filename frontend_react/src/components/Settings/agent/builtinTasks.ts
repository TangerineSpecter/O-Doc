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

export const defaultPostPublishTask: AgentTaskConfig = {
    ...defaultPostInteractionTask, taskKind: 'post_publish', name: '自主选题并发帖',
    scheduleMode: 'random', schedule: '每天随机 · 1 次发帖机会',
};

export const defaultTravelTask: AgentTaskConfig = {
    ...defaultPostInteractionTask, taskKind: 'travel', name: '旅行',
    scheduleMode: 'random', randomPeriod: 'weekly', schedule: '每周随机 · 1 次旅行机会',
};

export const defaultFarmTask: AgentTaskConfig = {
    ...defaultPostInteractionTask, taskKind: "farm", name: "农场经营", intervalMinutes: 30, schedule: "每 30 分钟 · 随机一位 Agent",
};
