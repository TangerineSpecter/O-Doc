import type {DailyFeedEvent} from '../types/api/dailyFeed';
import type {FlowBlock, TokenRequest} from '../types/api/tokenUsage';
import {requestPhaseName} from './tokenUsageLabels';

export interface ObservedActivity {
    id: string;
    title: string;
    startedAt: string;
    requests: TokenRequest[];
    facts: DailyFeedEvent[];
}

export const sourceNames = {
    instructions: '指令与角色', tools: '工具定义 / Schema', business: '当前业务资料',
    history: '历史对话与调用', tool_results: '工具返回内容',
};
export type SourceKind = keyof typeof sourceNames;
export const sourceKinds = Object.keys(sourceNames) as SourceKind[];
export const requestOrder = (a: TokenRequest, b: TokenRequest) =>
    Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id);
export function dayOf(value: string): string {
    return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(value));
}
export function clockTime(value: string): string {
    return new Date(value).toLocaleTimeString('zh-CN', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false});
}
export function shiftDay(day: string, offset: number): string {
    const date = new Date(`${day}T12:00:00+08:00`);
    date.setUTCDate(date.getUTCDate() + offset);
    return dayOf(date.toISOString());
}

/** 只按稳定执行身份连接业务事实；无执行 ID 的请求独立保留，不按时间猜测因果。 */
export function observedActivities(requests: TokenRequest[], facts: DailyFeedEvent[]): ObservedActivity[] {
    const groups = new Map<string, ObservedActivity>();
    for (const row of [...requests].sort(requestOrder)) {
        const id = row.recordKey ? `run:${row.recordKey}:${row.agentKey}` : `request:${row.id}`;
        const group = groups.get(id) ?? {
            id, title: row.taskName || requestPhaseName(row),
            startedAt: row.startedAt, requests: [], facts: [],
        };
        group.requests.push(row);
        groups.set(id, group);
    }
    for (const fact of facts) {
        const linked = fact.target?.kind === 'run' ? groups.get(`run:${fact.target.id}:${fact.actorId}`) : undefined;
        if (linked) linked.facts.push(fact);
        else groups.set(`fact:${fact.id}`, {id: `fact:${fact.id}`, title: fact.title, startedAt: fact.occurredAt, requests: [], facts: [fact]});
    }
    return [...groups.values()].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id));
}

export function knownTokens(rows: TokenRequest[], field: 'inputTokens' | 'outputTokens' | 'totalTokens'): number | null {
    const known = rows.map(row => row[field]).filter((n): n is number => n !== null);
    return known.length ? known.reduce((sum, n) => sum + n, 0) : null;
}

export function sourceGroups(blocks: FlowBlock[]) {
    return sourceKinds.map(kind => ({kind, name: sourceNames[kind], blocks: blocks.filter(b => (b.kind || 'business') === kind)}))
        .map(group => ({...group, chars: group.blocks.reduce((sum, block) => sum + block.chars, 0)}));
}

export interface InputClue {title: string; detail: string; block?: FlowBlock}
export function inputClues(current: TokenRequest, blocks: FlowBlock[], previous?: TokenRequest, previousBlocks?: FlowBlock[]): InputClue[] {
    const clues: InputClue[] = [];
    const seen = new Map<string, FlowBlock>();
    for (const block of blocks) {
        if (block.chars >= 40 && seen.has(block.text)) clues.push({
            title: '同一请求出现相同内容', detail: `${block.source || block.label} 与 ${seen.get(block.text)?.source || '前文'} 的展示文本一致；是否可删除需核对消息角色与业务用途。`, block,
        });
        seen.set(block.text, block);
    }
    const largest = [...blocks].filter(b => b.kind === 'tool_results').sort((a, b) => b.chars - a.chars)[0];
    if (largest && largest.chars >= 4000) clues.push({title: '工具返回较长', detail: `${largest.chars.toLocaleString()} 字。检查当前判断是否需要完整明细；长度本身不证明无关。`, block: largest});
    if (previous && current.inputTokens !== null && previous.inputTokens !== null && current.inputTokens > previous.inputTokens) clues.push({
        title: '接口实报输入增长', detail: `比同一执行内前次请求增加 ${(current.inputTokens - previous.inputTokens).toLocaleString()} Token${current.modelName !== previous.modelName ? '；两轮模型不同，不能直接归因于正文变化' : ''}。分项对比使用展示文本字数。`,
    });
    if (previousBlocks && blocks.length && blocks.map(b => b.text).join('\n') === previousBlocks.map(b => b.text).join('\n')) clues.push({
        title: '与前次展示输入一致', detail: '输入分段完全相同；不代表全部请求参数相同。核对重试、轮次与缓存，不能将重复量直接当作浪费。',
    });
    if (current.attempt > 1) clues.push({title: `第 ${current.attempt} 次尝试`, detail: '本次为显式重试；保留失败请求已确认的用量，检查上次错误是否已被反馈。'});
    if (!current.usageComplete) clues.push({title: '用量不完整', detail: '仅显示接口已确认的消耗，未知部分不按零补齐。'});
    return clues;
}

export function changedBlocks(current: FlowBlock[], previous: FlowBlock[]) {
    const old = new Map(previous.map(block => [block.source || block.id, block]));
    const rows = current.map(block => {
        const before = old.get(block.source || block.id);
        old.delete(block.source || block.id);
        return {block, before, state: !before ? '新增' : before.text === block.text ? '沿用' : '变化'};
    });
    return [...rows, ...[...old.values()].map(block => ({block, before: block, state: '移除'}))];
}
