import type {FlowBlock} from '../types/api/tokenUsage';

/**
 * 执行观测界面的纯解析逻辑：把模型请求正文拆成输入分段与输出内容。
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

export function inputBlocksFromRequest(request: unknown): FlowBlock[] {
    const outer = asRecord(request);
    const container = asRecord(outer?.json) ?? outer;
    const messages = Array.isArray(container?.messages) ? container.messages : null;
    if (messages) {
        const blocks: FlowBlock[] = messages.flatMap((item, index) => {
            const message = asRecord(item) ?? {};
            const role = typeof message.role === 'string' ? message.role : 'user';
            const label = ROLE_LABELS[role] ?? role;
            const kind: FlowBlock['kind'] = role === 'tool' ? 'tool_results'
                : role === 'assistant' ? 'history'
                : role === 'system' || role === 'developer' ? 'instructions' : 'business';
            const source = `messages[${index}] · ${role}${message.tool_call_id ? ` · ${message.tool_call_id}` : ''}`;
            const parts = blocksFromText(stringifyValue(message.content), label, `m${index}`);
            if (message.tool_calls) parts.push(makeBlock(`m${index}-calls`, '工具调用参数与 ID', stringifyValue(message.tool_calls)));
            if (message.function_call) parts.push(makeBlock(`m${index}-function`, '函数调用', stringifyValue(message.function_call)));
            return parts.map(block => ({...block, kind, source: `${source} / ${block.label}`}));
        });
        for (const key of ['tools', 'functions', 'response_format']) {
            if (container?.[key] !== undefined) blocks.push({
                ...makeBlock(`req-${key}`, key === 'response_format' ? '输出格式约束' : '工具定义 / Schema', stringifyValue(container[key])),
                kind: key === 'response_format' ? 'instructions' : 'tools', source: `request.${key}`,
            });
        }
        return blocks;
    }
    if (request === undefined || request === null) return [];
    if (container && Object.keys(container).length) return blocksFromJson(container, 'req', '请求参数')
        .map(block => ({...block, kind: 'business', source: `request / ${block.label}`}));
    return [makeBlock('req', '请求参数', stringifyValue(request))];
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
        const record = asRecord(response);
        const message = firstChoiceMessage(asRecord(record?.json) ?? record);
        blocks.push(makeBlock('out-tools', '工具调用', stringifyValue(message?.tool_calls) || parts.toolNames.join('、')));
    }
    if (!blocks.length) blocks.push(makeBlock('out-empty', '输出', '（本次没有输出内容）'));
    return {blocks, summary: outputSummaryOf(parts)};
}
