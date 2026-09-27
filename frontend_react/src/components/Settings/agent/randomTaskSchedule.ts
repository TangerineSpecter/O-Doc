import type {AgentTaskRandomPeriod} from '@/types/api/setting';

export const randomPeriodLabels: Record<AgentTaskRandomPeriod, string> = {
    daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年',
};

export function resolveAllocations(agents: string[], count: number, allocations: Record<string, number>): Record<string, number> {
    if (Object.keys(allocations).length) return Object.fromEntries(agents.map(id => [id, allocations[id] ?? 0]));
    return Object.fromEntries(agents.map((id, index) => [id, Math.floor(count / agents.length) + (index < count % agents.length ? 1 : 0)]));
}
