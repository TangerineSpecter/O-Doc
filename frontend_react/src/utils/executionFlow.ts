import type {FlowBlock, FlowStep, TokenRequest, TokenRequestContent} from '../types/api/tokenUsage';
import {purposeNames} from './tokenUsage';

/**
 * 执行流程视图的纯解析逻辑：把一次执行的模型请求正文拆成「输入分段小卡片 + 输出卡片」。
 * 只做数据变形与度量，不依赖 React，便于单测。
 */

/** 常见 JSON 顶层字段的中文标签，未命中时直接使用原始键名。 */
const FIELD_LABELS: Record<string, string> = {
    state: '当前状态',
    questions: '提问',
    market_state: '市场状态',
    session: '会话',
    objective: '目标',
    progression: '成长信息',
    options: '候选分支',
    inventory: '背包',
    listings: '我的挂牌',
    farm: '农场信息',
    planting: '种植信息',
    life: '生活状态',
    participants: '参与者',
    news: '新闻',
    chat_so_far: '已有聊天',
    combat_result: '战斗结算',
    rewards: '奖励',
    actor_name: '角色名',
    activities: '可选活动',
    recent_experiences: '近期经历',
    preceding_agents: '前序安排',
    allocation_order: '排位顺序',
    allocation_count: '同批人数',
    job_id: '职业选择',
    life_activity: '生活活动',
    choice: '选择结果',
    confidence: '置信度',
    probabilities: '概率分布',
    reason: '理由',
    content: '输出内容',
};

const ROLE_LABELS: Record<string, string> = {
    system: '系统指令',
    user: '用户输入',
    assistant: '助手消息',
    developer: '开发者指令',
    tool: '工具结果',
};

const HEADING = /^\s{0,3}#{1,6}\s+(\S.*?)\s*$/;
const MARKER = '资料：';
const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function previewOf(text: string, maxChars = 120): string {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 2).join(' ');
    return lines.length > maxChars ? `${lines.slice(0, maxChars)}…` : lines;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** 仅在文本整体就是一个 JSON 对象/数组时返回解析结果，否则返回 undefined。 */
function parseJson(text: string): unknown {
    const head = text.trim().slice(0, 1);
    if (head !== '{' && head !== '[') return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function countChars(text: string): number {
    return [...text].length;
}

function countBytes(text: string): number {
    if (encoder) return encoder.encode(text).length;
    let bytes = 0;
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    }
    return bytes;
}

function makeBlock(id: string, label: string, text: string): FlowBlock {
    return {id, label: label.trim() || '内容', text, chars: countChars(text), bytes: countBytes(text), preview: previewOf(text)};
}

function stringifyValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    return JSON.stringify(value, null, 2) ?? String(value);
}

function blocksFromJson(value: unknown, idPrefix: string, fallbackLabel: string): FlowBlock[] {
    const record = asRecord(value);
    if (record) {
        const blocks = Object.entries(record).map(([key, item], index) =>
            makeBlock(`${idPrefix}-${index}`, FIELD_LABELS[key] ?? key, stringifyValue(item))
        );
        if (blocks.length) return blocks;
    }
    if (Array.isArray(value)) {
        if (value.length > 0 && value.length <= 8) {
            return value.map((item, index) => makeBlock(`${idPrefix}-${index}`, `第 ${index + 1} 项`, stringifyValue(item)));
        }
        return [makeBlock(`${idPrefix}-list`, `列表 · ${value.length} 项`, JSON.stringify(value, null, 2) ?? '')];
    }
    return [makeBlock(`${idPrefix}-0`, fallbackLabel, stringifyValue(value))];
}

/** 形如「姓名：可莉」的标题把冒号右侧当作卡片内容，左侧作为卡片标签。 */
function headingParts(heading: string): {label: string; inline: string} {
    const index = heading.indexOf('：');
    if (index > 0) {
        const label = heading.slice(0, index).trim();
        const inline = heading.slice(index + 1).trim();
        if (label && inline) return {label, inline};
    }
    return {label: heading, inline: ''};
}

/** 按 Markdown 标题（#~######）切段；标题本身作为卡片标签。无标题时返回空数组。 */
function splitByHeading(text: string, idPrefix: string, fallbackLabel: string): FlowBlock[] {
    const blocks: FlowBlock[] = [];
    let found = false;
    let label = fallbackLabel;
    let inline = '';
    let buffer: string[] = [];
    const flush = () => {
        const body = buffer.join('\n').trim();
        const parts = [inline, body].filter(Boolean);
        if (parts.length) blocks.push(makeBlock(`${idPrefix}-h${blocks.length}`, label, parts.join('\n')));
        buffer = [];
        inline = '';
    };
    for (const line of text.split('\n')) {
        const heading = HEADING.exec(line);
        if (heading) {
            flush();
            found = true;
            ({label, inline} = headingParts(heading[1]));
            continue;
        }
        buffer.push(line);
    }
    flush();
    return found ? blocks : [];
}

function splitByParagraph(text: string, idPrefix: string, fallbackLabel: string): FlowBlock[] {
    const parts = text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
    if (parts.length <= 1) return [makeBlock(`${idPrefix}-0`, fallbackLabel, text)];
    return parts.map((part, index) =>
        makeBlock(`${idPrefix}-${index}`, part.split('\n')[0].slice(0, 12) || `段落 ${index + 1}`, part)
    );
}

function blocksFromText(rawText: string, fallbackLabel: string, idPrefix: string): FlowBlock[] {
    const text = rawText.trim();
    if (!text) return [];
    const whole = parseJson(text);
    if (whole !== undefined) return blocksFromJson(whole, idPrefix, fallbackLabel);
    const marker = text.lastIndexOf(MARKER);
    if (marker >= 0) {
        const instruction = text.slice(0, marker).trim();
        const payload = parseJson(text.slice(marker + MARKER.length));
        if (payload !== undefined) {
            const head = instruction ? [makeBlock(`${idPrefix}-head`, fallbackLabel, instruction)] : [];
            return [...head, ...blocksFromJson(payload, `${idPrefix}-data`, MARKER.slice(0, -1))];
        }
    }
    const headings = splitByHeading(text, idPrefix, fallbackLabel);
    return headings.length ? headings : splitByParagraph(text, idPrefix, fallbackLabel);
}

function messagesOf(request: unknown): {role: string; content: string}[] {
    const container = asRecord(request);
    const nested = asRecord(container?.json);
    const list = Array.isArray(container?.messages) ? container.messages : Array.isArray(nested?.messages) ? nested.messages : null;
    if (!list) return [];
    return list.map((item, index) => {
        const record = asRecord(item) ?? {};
        const content = record.content;
        return {
            role: typeof record.role === 'string' ? record.role : `消息 ${index + 1}`,
            content:
                typeof content === 'string'
                    ? content
                    : content === undefined || content === null
                      ? ''
                      : JSON.stringify(content, null, 2) ?? '',
        };
    });
}

export function inputBlocksFromRequest(request: unknown): FlowBlock[] {
    const messages = messagesOf(request);
    if (messages.length) {
        return messages.flatMap((message, index) =>
            blocksFromText(message.content, ROLE_LABELS[message.role] ?? message.role, `m${index}`)
        );
    }
    if (request === undefined || request === null) return [];
    const record = asRecord(request);
    if (record && Object.keys(record).length) return blocksFromJson(record, 'req', '请求参数');
    return [makeBlock('req', '请求参数', typeof request === 'string' ? request : JSON.stringify(request, null, 2) ?? '')];
}

interface OutputParts {
    text: string;
    toolNames: string[];
    payload: unknown;
    label: string;
}

function toolCallNames(message: Record<string, unknown> | null): string[] {
    if (!message) return [];
    const calls = message.tool_calls;
    if (!Array.isArray(calls)) return [];
    return calls.map(call => {
        const record = asRecord(call);
        const name = asRecord(record?.function)?.name ?? record?.name;
        return typeof name === 'string' && name ? name : '未命名工具';
    });
}

function firstChoiceMessage(envelope: Record<string, unknown> | null): Record<string, unknown> | null {
    const choices = envelope?.choices;
    if (!Array.isArray(choices) || !choices.length) return null;
    return asRecord(asRecord(choices[0])?.message);
}

function outputParts(response: unknown): OutputParts | null {
    if (response === undefined || response === null) return null;
    if (typeof response === 'string') {
        return {text: response, toolNames: [], payload: parseJson(response), label: '模型输出'};
    }
    const record = asRecord(response);
    if (!record) {
        return {text: JSON.stringify(response, null, 2) ?? '', toolNames: [], payload: undefined, label: '输出'};
    }
    // 决策模型落盘为 {raw, json}，大模型直接落盘响应体，两者都可能是 OpenAI chat 响应。
    const envelope = asRecord(record.json) ?? record;
    const message = firstChoiceMessage(envelope);
    const toolNames = toolCallNames(message);
    const text =
        typeof message?.content === 'string' && message.content.trim()
            ? message.content
            : typeof record.content === 'string'
              ? record.content
              : '';
    if (text.trim()) return {text, toolNames, payload: parseJson(text), label: '模型输出'};
    if (typeof record.raw === 'string' && record.raw.trim()) {
        return {text: record.raw, toolNames, payload: undefined, label: '原始响应'};
    }
    if (toolNames.length) return {text: '', toolNames, payload: undefined, label: '工具调用'};
    return {text: JSON.stringify(response, null, 2) ?? '', toolNames: [], payload: undefined, label: '输出'};
}

function outputSummaryOf(parts: OutputParts): string {
    if (parts.toolNames.length) {
        const names = parts.toolNames.slice(0, 3).join('、');
        return `调用工具：${names}${parts.toolNames.length > 3 ? ` 等 ${parts.toolNames.length} 个` : ''}`;
    }
    const payload = asRecord(parts.payload);
    if (payload) {
        const keys = Object.keys(payload);
        if (keys.length) return `返回字段：${keys.slice(0, 4).join('、')}${keys.length > 4 ? '…' : ''}`;
    }
    return previewOf(parts.text.replace(/\s+/g, ' '), 48) || '无输出内容';
}

export function outputFromResponse(response: unknown): {blocks: FlowBlock[]; summary: string} | null {
    const parts = outputParts(response);
    if (!parts) return null;
    const blocks: FlowBlock[] = [];
    if (parts.payload !== undefined) blocks.push(...blocksFromJson(parts.payload, 'out', parts.label));
    else if (parts.text) blocks.push(makeBlock('out-text', parts.label, parts.text));
    if (parts.toolNames.length) {
        blocks.push(makeBlock('out-tools', '工具调用', parts.toolNames.map(name => `· ${name}`).join('\n')));
    }
    if (!blocks.length) blocks.push(makeBlock('out-empty', '输出', '（本次没有输出内容）'));
    return {blocks, summary: outputSummaryOf(parts)};
}

export function flowStepsFromRequests(
    requests: TokenRequest[],
    contents: Record<string, TokenRequestContent | null>
): FlowStep[] {
    // 请求列表接口按时间倒序分页；流程中的编号和箭头必须沿实际执行顺序。
    const ordered = [...requests].sort((left, right) =>
        Date.parse(left.startedAt) - Date.parse(right.startedAt)
        || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    );
    return ordered.map((request, index) => {
        const loaded = Object.prototype.hasOwnProperty.call(contents, request.id);
        const content = loaded ? contents[request.id] : undefined;
        const output = outputFromResponse(content?.response);
        const step: FlowStep = {
            id: request.id,
            index: index + 1,
            title: request.phase || purposeNames[request.purpose] || request.purpose,
            purposeLabel: purposeNames[request.purpose] || request.purpose,
            modelName: request.modelName,
            modelType: request.modelType,
            agentName: request.agentName,
            startedAt: request.startedAt,
            totalTokens: request.totalTokens,
            inputs: [],
            output: output?.blocks ?? [],
            outputSummary: output?.summary ?? (request.status === 'running' ? '执行中…' : '无输出内容'),
            rawRequest: content?.request,
            rawResponse: content?.response,
        };
        if (!loaded) step.unavailable = '正在读取正文…';
        else if (!content) step.unavailable = '请求正文读取失败';
        else if (!content.available) step.unavailable = content.message || '请求正文未记录或已超过 30 天保留期';
        else step.inputs = inputBlocksFromRequest(content.request);
        return step;
    });
}

export interface FlowTotals {
    steps: number;
    tokens: number;
    inputChars: number;
    outputChars: number;
    ready: number;
}

export function flowTotals(steps: FlowStep[]): FlowTotals {
    return steps.reduce<FlowTotals>(
        (totals, step) => ({
            steps: totals.steps + 1,
            tokens: totals.tokens + (step.totalTokens ?? 0),
            inputChars: totals.inputChars + step.inputs.reduce((sum, block) => sum + block.chars, 0),
            outputChars: totals.outputChars + step.output.reduce((sum, block) => sum + block.chars, 0),
            ready: totals.ready + (step.unavailable ? 0 : 1),
        }),
        {steps: 0, tokens: 0, inputChars: 0, outputChars: 0, ready: 0}
    );
}
