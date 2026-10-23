import type {
    AgentConfig,
    AgentTaskConfig,
    AgentTaskExecutionMode,
    AgentTaskFollowupAction,
    AgentTaskMcpToolScope,
    AgentTaskNotifyPlatform,
    AgentTaskRandomPeriod,
    AgentTaskScheduleType,
    SaveAgentTaskConfigParams,
} from '../../../types/api/setting';
import {emptyTravelConfig, type TravelConfig} from '../../../types/api/travel';
import type {AgentPublishConfig} from '../../../types/api/agentPublish';
import {travelConfigError} from '../../../utils/agentTaskValidation';
import {emptyPublishConfig} from './publishDefaults';
import {randomPeriodLabels, resolveAllocations} from './randomTaskSchedule';

export type AgentTaskDraft = {
    marketConfig?: import('../../../types/api/decision').MarketDecisionConfig;
    model: string;
    taskKind?: AgentTaskConfig['taskKind'];
    mcpToolScope: AgentTaskMcpToolScope;
    investmentConfig?: import('../../../types/api/investment').InvestmentConfig;
    publishConfig?: AgentPublishConfig;
    travelConfig?: TravelConfig;
    postCollectionIds?: string[];
    postCategoryIds?: string[];
    id?: string;
    name: string;
    agents: string[];
    executionMode: AgentTaskExecutionMode;
    trigger: string;
    schedule: string;
    scheduleType: AgentTaskScheduleType;
    scheduleMode: 'fixed' | 'random';
    randomPeriod: AgentTaskRandomPeriod;
    randomCount: string;
    randomAllocations: Record<string, number>;
    scheduleTime: string;
    scheduleWeekday: string;
    scheduleMonthDay: string;
    intervalMinutes: string;
    enabled: boolean;
    prompt: string;
    notifyEnabled: boolean;
    notifyPlatform: AgentTaskNotifyPlatform;
    notifyWebhookUrl: string;
    followupEnabled: boolean;
    followupAgent: string;
    followupAction: AgentTaskFollowupAction;
    followupPrompt: string;
};

export function isSystemTaskKind(kind: AgentTaskConfig['taskKind']): boolean {
    return ['post_interaction', 'post_publish', 'travel', 'farm', 'market', 'investment', 'cooking', 'alchemy', 'blacksmith', 'exploration'].includes(kind || '');
}

export function createAgentTaskDraft(defaultAgentId = ''): AgentTaskDraft {
    return {
        model: '',
        taskKind: 'custom',
        mcpToolScope: {},
        name: '',
        agents: defaultAgentId ? [defaultAgentId] : [],
        executionMode: 'parallel',
        trigger: '定时任务',
        schedule: '每天 09:00',
        scheduleType: 'daily',
        scheduleMode: 'fixed',
        randomPeriod: 'daily',
        randomCount: '1',
        randomAllocations: {},
        scheduleTime: '09:00',
        scheduleWeekday: '1',
        scheduleMonthDay: '1',
        intervalMinutes: '60',
        enabled: true,
        prompt: '',
        notifyEnabled: false,
        notifyPlatform: 'feishu',
        notifyWebhookUrl: '',
        followupEnabled: false,
        followupAgent: '',
        followupAction: 'review',
        followupPrompt: '',
    };
}

export function agentTaskToDraft(task: AgentTaskConfig): AgentTaskDraft {
    const taskAgentIds = task.agents?.length ? task.agents : (task.agent ? [task.agent] : []);
    return {
        id: task.id,
        model: task.model || '',
        taskKind: task.taskKind || 'custom',
        // Missing scope on an existing task keeps inherited tools; new drafts use {}.
        mcpToolScope: task.mcpToolScope ?? null,
        investmentConfig: task.investmentConfig || {},
        marketConfig: task.marketConfig || {decisionEnabled: false, decisionProvider: 'jev'},
        publishConfig: {...emptyPublishConfig(), ...(task.publishConfig || {})},
        travelConfig: task.travelConfig || emptyTravelConfig(),
        postCollectionIds: task.postCollectionIds || [],
        postCategoryIds: task.postCategoryIds || [],
        name: task.name,
        agents: taskAgentIds,
        executionMode: task.executionMode || 'parallel',
        trigger: task.trigger,
        schedule: task.schedule,
        enabled: task.enabled,
        prompt: task.prompt || '',
        scheduleType: task.scheduleType || 'daily',
        scheduleMode: task.scheduleMode || 'fixed',
        randomPeriod: task.randomPeriod || 'daily',
        randomCount: String(task.randomCount ?? 1),
        randomAllocations: Object.fromEntries((task.randomAllocations || []).map(item => [item.agentId, item.count])),
        scheduleTime: task.scheduleTime || '09:00',
        scheduleWeekday: task.scheduleWeekday || '1',
        scheduleMonthDay: task.scheduleMonthDay || '1',
        intervalMinutes: String(task.intervalMinutes || 60),
        notifyEnabled: task.notifyEnabled ?? false,
        notifyPlatform: task.notifyPlatform || 'feishu',
        notifyWebhookUrl: task.notifyWebhookUrl || '',
        followupEnabled: task.followupEnabled ?? false,
        followupAgent: task.followupAgent || '',
        followupAction: task.followupAction || 'review',
        followupPrompt: task.followupPrompt || '',
    };
}

export const taskWeekdayOptions = [
    {value: '1', label: '周一'},
    {value: '2', label: '周二'},
    {value: '3', label: '周三'},
    {value: '4', label: '周四'},
    {value: '5', label: '周五'},
    {value: '6', label: '周六'},
    {value: '0', label: '周日'},
];
const buildTaskSchedule = (task: Pick<AgentTaskDraft, 'scheduleType' | 'scheduleTime' | 'scheduleWeekday' | 'scheduleMonthDay' | 'intervalMinutes'>) => {
    if (task.scheduleType === 'daily') {
        return `每天 ${task.scheduleTime}`;
    }
    if (task.scheduleType === 'weekly') {
        const weekday = taskWeekdayOptions.find(option => option.value === task.scheduleWeekday)?.label || '周一';
        return `每${weekday} ${task.scheduleTime}`;
    }
    if (task.scheduleType === 'monthly') {
        return `每月 ${task.scheduleMonthDay} 日 ${task.scheduleTime}`;
    }
    return `每 ${task.intervalMinutes || '1'} 分钟`;
};

export function validateAgentTaskDraft(draft: AgentTaskDraft, selectedAgents: string[]): string | undefined {
    const isSystemTask = isSystemTaskKind(draft.taskKind);
    const isTravelTask = draft.taskKind === 'travel';
    const isPublishTask = draft.taskKind === 'post_publish';
    const isManualTask = draft.trigger === '手动执行';
    if (isTravelTask) {
        const error = travelConfigError(draft.travelConfig);
        if (error) {
            return error;
        }
    }
    if (draft.trigger === '定时任务' && draft.scheduleMode === 'random') {
        const count = Number(draft.randomCount);
        if (!Number.isSafeInteger(count) || count < 1 || count > 10000) {
            return '目标次数须为 1 到 10000 之间的整数';
        }
        const allocations = resolveAllocations(selectedAgents, count, draft.randomAllocations);
        const total = Object.values(allocations).reduce((sum, value) => sum + value, 0);
        if (!isSystemTask && draft.executionMode === 'serial' && (Object.values(allocations).some(value => !Number.isSafeInteger(value) || value < 0) || total < 1 || total > count)) {
            return 'Agent 分配次数须为非负整数，合计大于 0 且不能超过任务总次数';
        }
    }
    if (!draft.name.trim() || (!isSystemTask && !draft.prompt.trim())) {
        return '请填写任务名称和任务目标';
    }
    if (isPublishTask && (!draft.publishConfig?.collectionId || !draft.publishConfig.searchServerId || !draft.publishConfig.rules.length || draft.publishConfig.rules.some(rule => !rule.modes.length))) {
        return '请选择输出文集、搜索服务和至少一个有效分类及内容方式';
    }
    if (isPublishTask && draft.publishConfig?.quotaEnabled) {
        const total = Number(draft.publishConfig.quotaTotal);
        const perAgent = Number(draft.publishConfig.quotaPerAgent) || 0;
        if (!Number.isSafeInteger(total) || total < 1 || total > 10000) {
            return '周期内所有 Agent 最多发帖数须为 1 到 10000 之间的整数';
        }
        if (perAgent && (!Number.isSafeInteger(perAgent) || perAgent < 1 || perAgent > total)) {
            return '每位 Agent 的发帖上限须为 1 到周期总量之间的整数，留空表示不限';
        }
    }
    if (selectedAgents.length === 0) {
        return isSystemTask ? '请先在统一生活运行中选择居民' : '请至少选择一个 Agent';
    }
    if (!isManualTask && draft.scheduleMode !== 'random' && draft.scheduleType === 'interval' && (!draft.intervalMinutes || Number(draft.intervalMinutes) < 1)) {
        return '请填写大于 0 的间隔分钟数';
    }
    if (draft.notifyEnabled && !draft.notifyWebhookUrl.trim()) {
        return '请填写通知 Webhook 地址';
    }
    if (draft.followupEnabled && !draft.followupAgent) {
        return '请选择完成后接手的 Agent';
    }
    if (draft.followupEnabled && selectedAgents.includes(draft.followupAgent)) {
        return '后续 Agent 不能与主执行 Agent 重复';
    }
}

export function agentTaskDraftToConfig(
    draft: AgentTaskDraft,
    selectedAgents: string[],
    residents: readonly Pick<AgentConfig, 'id' | 'mcpServers'>[],
): SaveAgentTaskConfigParams {
    const isSystemTask = isSystemTaskKind(draft.taskKind);
    const isTravelTask = draft.taskKind === 'travel';
    const isPublishTask = draft.taskKind === 'post_publish';
    const isManualTask = draft.trigger === '手动执行';
    const isInvestmentTask = draft.taskKind === 'investment';
    const isMarketTask = draft.taskKind === 'market';
    const boundMcpIds = new Set(residents
        .filter(agent => selectedAgents.includes(agent.id))
        .flatMap(agent => agent.mcpServers || []));
    const mcpToolScope = draft.mcpToolScope === null
        ? null
        : Object.fromEntries(Object.entries(draft.mcpToolScope || {})
            .filter(([serverId, toolNames]) => boundMcpIds.has(serverId) && toolNames.length > 0));

    return {
        id: draft.id,
        model: draft.model || null,
        taskKind: draft.taskKind || 'custom',
        mcpToolScope: (draft.taskKind || 'custom') === 'custom' ? mcpToolScope : undefined,
        investmentConfig: isInvestmentTask ? draft.investmentConfig || {} : undefined,
        marketConfig: isMarketTask ? draft.marketConfig || {decisionEnabled: false, decisionProvider: 'jev'} : undefined,
        publishConfig: isPublishTask ? draft.publishConfig : undefined,
        travelConfig: isTravelTask ? draft.travelConfig : undefined,
        postCollectionIds: draft.postCollectionIds || [],
        postCategoryIds: draft.postCategoryIds || [],
        name: draft.name.trim(),
        agent: selectedAgents[0],
        agents: selectedAgents,
        executionMode: isSystemTask ? 'serial' : draft.executionMode,
        trigger: draft.trigger,
        schedule: isSystemTask ? '由统一生活日程安排' : isManualTask ? '手动执行' : draft.scheduleMode === 'random' && draft.trigger === '定时任务'
            ? `${randomPeriodLabels[draft.randomPeriod]}随机 · ${draft.executionMode === 'parallel' ? '每个 Agent' : '合计'} ${draft.randomCount} 次`
            : buildTaskSchedule(draft),
        scheduleType: isSystemTask ? 'interval' : draft.scheduleType,
        scheduleMode: draft.trigger === '定时任务' ? draft.scheduleMode : 'fixed',
        randomPeriod: draft.randomPeriod,
        randomCount: Number(draft.randomCount) || 1,
        randomAllocations: draft.executionMode === 'serial' ? Object.entries(draft.randomAllocations).map(([agentId, count]) => ({agentId, count})) : [],
        scheduleTime: draft.scheduleTime,
        scheduleWeekday: draft.scheduleWeekday,
        scheduleMonthDay: draft.scheduleMonthDay,
        intervalMinutes: Number(draft.intervalMinutes || 60),
        enabled: draft.enabled,
        prompt: draft.prompt.trim(),
        notifyEnabled: draft.notifyEnabled,
        notifyPlatform: draft.notifyPlatform,
        notifyWebhookUrl: draft.notifyEnabled ? draft.notifyWebhookUrl.trim() : '',
        followupEnabled: !isSystemTask && draft.followupEnabled,
        followupAgent: draft.followupEnabled ? draft.followupAgent : null,
        followupAction: draft.followupAction,
        followupPrompt: draft.followupEnabled ? draft.followupPrompt.trim() : '',
    };
}

export function toggleAgentTaskDraftAgent(draft: AgentTaskDraft, agentId: string): AgentTaskDraft {
    const selected = new Set(draft.agents);
    if (selected.has(agentId)) selected.delete(agentId);
    else selected.add(agentId);
    return {...draft, agents: Array.from(selected), randomAllocations: {}};
}
