import type {AgentTaskConfig, SaveAgentTaskConfigParams} from '../types/api/setting';

export function buildAgentTaskPayload(taskData: Partial<AgentTaskConfig>): SaveAgentTaskConfigParams {
    const intervalMinutes = Number(taskData.intervalMinutes) || 60;
    const agentIds = taskData.agents?.length
        ? taskData.agents
        : (taskData.agent ? [taskData.agent] : []);
    return {
        id: taskData.id,
        model: taskData.model || null,
        name: taskData.name || '',
        agent: agentIds[0] || taskData.agent || '',
        agents: agentIds,
        executionMode: taskData.executionMode || 'parallel',
        taskKind: taskData.taskKind || 'custom',
        mcpToolScope: taskData.mcpToolScope,
        publishConfig: taskData.publishConfig,
        travelConfig: taskData.travelConfig,
        investmentConfig: taskData.investmentConfig,
        marketConfig: taskData.marketConfig,
        postCollectionIds: taskData.postCollectionIds || [],
        postCategoryIds: taskData.postCategoryIds || [],
        trigger: taskData.trigger || '定时任务',
        schedule: taskData.schedule || '',
        scheduleType: taskData.scheduleType || 'daily',
        scheduleMode: taskData.scheduleMode || 'fixed',
        randomPeriod: taskData.randomPeriod || 'daily',
        randomCount: taskData.randomCount ?? 1,
        randomAllocations: taskData.randomAllocations || [],
        scheduleTime: taskData.scheduleTime || '09:00',
        scheduleWeekday: taskData.scheduleWeekday || '1',
        scheduleMonthDay: taskData.scheduleMonthDay || '1',
        intervalMinutes,
        enabled: taskData.enabled ?? true,
        prompt: taskData.prompt || '',
        notifyEnabled: taskData.notifyEnabled ?? false,
        notifyPlatform: taskData.notifyPlatform || 'feishu',
        notifyWebhookUrl: taskData.notifyWebhookUrl || '',
        followupEnabled: taskData.followupEnabled ?? false,
        followupAgent: taskData.followupAgent || null,
        followupAction: taskData.followupAction || 'review',
        followupPrompt: taskData.followupPrompt || '',
    };
}
