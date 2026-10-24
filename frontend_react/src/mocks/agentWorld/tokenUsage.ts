import type {BlacksmithActivity} from '../../types/api/blacksmith';
import {blacksmithActivities, blacksmithOverview} from './blacksmith';
import type {TokenMetrics, TokenRequest, TokenRequestContent, TokenSummary} from '../../types/api/tokenUsage';
import type {DailyFeedEvent} from '../../types/api/dailyFeed';
import {dayOf} from '../../utils/tokenObservatory';
import {shanghaiDay} from '../../utils/tokenUsage';
import {residents} from './residents';

const day = shanghaiDay();
const at = (hour: number, minute = 0) => new Date(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`).toISOString();
const phases = ['整日活动规划', '确认投资意向', '读取持仓与行情', '生成交易方案', '交易方案重试', '查看可购商品', '选择采购项目', '选择种植候选', '记忆整理'];
const bodies = new Map<string, TokenRequestContent>();
export const observationRequests: TokenRequest[] = residents.flatMap((actor, a) => phases.map((phase, i) => {
    const investment = i >= 1 && i <= 4;
    const row: TokenRequest = {
        id: `local-observation-${a}-${i}`, agentKey: actor.id, agentName: actor.name,
        taskKey: i === 0 || i === 8 ? '' : investment ? 'local-task-investment' : i <= 6 ? 'local-task-market' : 'local-task-farm',
        taskName: i === 0 || i === 8 ? '' : investment ? '投资决策' : i <= 6 ? '市场采购' : '农场经营',
        recordKey: i === 0 || i === 8 ? '' : i === 7 ? (a === 0 ? 'local-run' : `local-farm-${a}`) : investment ? `local-investment-${a}` : `local-market-${a}`,
        purpose: i === 0 ? 'planning' : i === 8 ? 'memory' : 'task', phase,
        modelName: i === 7 ? '本地决策样例' : '本地文本样例', modelType: i === 7 ? 'decision_model' : 'large_model', providerName: 'LOCAL · 无真实模型调用',
        attempt: i === 4 ? 2 : 1, status: i === 3 ? 'failed' : i === 8 ? 'running' : 'success', usageComplete: i !== 8,
        startedAt: at(i === 0 ? 8 : investment ? 10 : i <= 6 ? 14 : i === 7 ? 16 : 17, i),
        endedAt: i === 8 ? null : at(i === 0 ? 8 : investment ? 10 : i <= 6 ? 14 : 16, i + 1),
        inputTokens: [4200, 6200, 12800, 18400, 18400, 2800, 4400, 1900, 1200][i],
        outputTokens: i === 8 ? null : [330, 240, 280, 380, 210, 160, 220, 90][i], totalTokens: null, cachedTokens: i === 8 ? null : 300, reasoningTokens: null,
    };
    row.totalTokens = row.outputTokens === null ? null : row.inputTokens! + row.outputTokens;
    const persona = '喜欢研究行情，关注预算与生活目标。'.repeat(4);
    const messages: unknown[] = [{role: 'system', content: persona}, {role: 'user', content: JSON.stringify({account: {cash: '8430', reserved: '1500'}, role_prompt: persona, farm: {plots: 32, queue: Array.from({length: 8}, (_, n) => ({crop: '草莓', plot: n + 1}))}})}];
    if (investment && i >= 2) messages.push({role: 'assistant', content: null, tool_calls: [{id: 'quotes-1', type: 'function', function: {name: 'get_quotes', arguments: '{"codes":["600000"]}'}}]}, {role: 'tool', tool_call_id: 'quotes-1', content: JSON.stringify({quote: {code: '600000', price: 12.31}, indicators: {macd: .12}, history: Array.from({length: i >= 3 ? 100 : 20}, (_, n) => ({day: n + 1, close: 12 + n / 100, volume: 1800000}))})});
    bodies.set(row.id, i === 8 ? {available: false, reason: 'not_found', message: '当前服务器未找到该请求的输入输出正文文件'} : {
        available: true, status: row.status, request: {model: row.modelName, messages, tools: [{type: 'function', function: {name: 'get_quotes', description: '读取报价与行情时点', parameters: {type: 'object', properties: {codes: {type: 'array', items: {type: 'string'}}}}}}]},
        response: {choices: [{message: i === 1 || i === 5 ? {role: 'assistant', content: '先读取当前状态。', tool_calls: [{id: 'quotes-1', type: 'function', function: {name: 'get_quotes', arguments: '{"codes":["600000"]}'}}]} : {role: 'assistant', content: i === 3 ? '{"action":"buy","quantity":"待定"}' : i === 4 ? '{"action":"hold","reason":"保留旅行预算"}' : '{"choice":"ready","reason":"结合库存与资金安排"}'}}]},
    });
    return row;
}));

// 兼容真实历史中的英文阶段；凌晨样例完整保留输入输出，不能按时间误判为过期。
for (const actor of residents) {
    const base = observationRequests.find(row => row.agentKey === actor.id)!;
    for (const [index, phase] of ['daily_consolidation', 'life_interleaving', 'combat_preparation'].entries()) {
        const row: TokenRequest = {...base, id: `local-legacy-${actor.id}-${index}`, taskKey: '', taskName: '',
            recordKey: index === 0 ? '' : `local-interleaving-${actor.id}`, purpose: index === 0 ? 'memory' : 'planning', phase,
            modelType: index === 0 ? 'large_model' : 'decision_model',
            startedAt: at(index === 0 ? 3 : 6, index), endedAt: at(index === 0 ? 3 : 6, index + 1)};
        observationRequests.push(row);
        bodies.set(row.id, {available: true, status: 'success',
            request: index === 0 ? {messages: [{role: 'user', content: '整理今天已发生的经历，只保留重要事件与稳定偏好。'}]}
                : {state: {available_minutes: 60, energy: 80}, questions: [{id: phase, options: {explore: '迷宫探索', rest: '暂不活动'}}]},
            response: index === 0 ? {choices: [{message: {content: '今天完成了种植计划，为下一次探索保留体力。'}}]}
                : {choice: 'explore', confidence: .9}});
    }
}

// Forging requests share one stable execution id with their frozen output facts.
export function addBlacksmithObservation(activity: BlacksmithActivity) {
    const overview = blacksmithOverview(activity.actorId);
    for (const [index, stage] of activity.stages.entries()) {
        const lastFailed = activity.status === 'failed' && index === activity.stages.length - 1;
        const created = new Date(Date.parse(activity.createdAt) + index * 1500);
        const id = `${activity.id}-request-${index}`;
        const row: TokenRequest = {id, agentKey: activity.actorId, agentName: activity.actorName,
            taskKey: 'local-task-blacksmith', taskName: '铁匠铺打造', recordKey: activity.recordId,
            purpose: 'task', phase: String(stage.scene), modelName: '本地决策样例', modelType: 'decision_model',
            providerName: 'LOCAL · 无真实模型调用', attempt: 1, status: lastFailed ? 'failed' : 'success', usageComplete: true,
            startedAt: created.toISOString(), endedAt: new Date(created.getTime() + 1000).toISOString(),
            inputTokens: 180 + index * 5, outputTokens: lastFailed ? 0 : 8, totalTokens: 180 + index * 5 + (lastFailed ? 0 : 8), cachedTokens: 0, reasoningTokens: null};
        observationRequests.push(row);
        const choices = stage.phase === 'continue' ? {continue: '继续打造', finish: '结束本次打造'}
            : stage.phase === 'band' ? Object.fromEntries(overview.bands.slice(0, 3).map(band => [band.id, band.label]))
            : stage.phase === 'slot' ? Object.fromEntries(overview.recipes.filter(recipe => recipe.bandId === '10-20' && recipe.state === 'ready').map(recipe => [recipe.slot, recipe.slotName]))
            : Object.fromEntries(overview.recipes.find(recipe => recipe.bandId === '10-20' && recipe.slot === 'weapon')!.types.map(type => [type.templateId, type.name]));
        bodies.set(id, {available: true, status: row.status, ...(lastFailed ? {errorType: 'DecisionUnavailable'} : {}),
            request: {state: {actor: overview.actor, pieceNumber: Number(stage.pieceIndex) + 1, maxPieces: 3,
                craftedEquipment: activity.operations.filter(op => op.pieceIndex < Number(stage.pieceIndex) || stage.phase === 'continue').map(op => op.result.item)},
                questions: [{id: `${activity.id}:${index}`, scene: stage.scene, options: choices}],
                instructions: '仅从合法候选选择一个。品质、等级与词条由系统抽取，每件成品入库后再决定是否继续。'},
            response: lastFailed ? {error: '本地样例：决策连接暂时不可用，已完成成品保留'} : {choice: stage.choice, confidence: .86},
        });
    }
}

for (const activity of blacksmithActivities) addBlacksmithObservation(activity);

export const observationFacts: DailyFeedEvent[] = residents.map((actor, i) => ({
    id: `local-investment-fact-${i}`, actorId: actor.id, actorName: actor.name, category: 'investment', source: 'run',
    occurredAt: at(10, 5), title: '投资决策已结束', detail: '数量格式校验失败后重试，最终选择观望。未发生成交，旅行预留仍保留。',
    status: 'success', amount: null, target: {kind: 'run', id: `local-investment-${i}`},
    steps: [{id: 'invalid', title: '方案校验未通过', detail: 'quantity 必须是合法数字；没有提交交易。', occurredAt: at(10, 3), amount: null},
        {id: 'hold', title: '重试后选择观望', detail: '本次执行结束，未成交。', occurredAt: at(10, 5), amount: null}],
}));

export function observationMetrics(rows: TokenRequest[]): TokenMetrics {
    const sum = (field: 'inputTokens' | 'outputTokens' | 'totalTokens') => rows.reduce((n, row) => n + (row[field] ?? 0), 0);
    const executionCount = new Set(rows.map(r => r.recordKey).filter(Boolean)).size;
    return {inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), totalTokens: sum('totalTokens'), requestCount: rows.length,
        incompleteCount: rows.filter(r => !r.usageComplete || r.status === 'running').length, executionCount,
        largeModelTokens: rows.filter(r => r.modelType === 'large_model').reduce((n, r) => n + (r.totalTokens ?? 0), 0),
        decisionModelTokens: rows.filter(r => r.modelType === 'decision_model').reduce((n, r) => n + (r.totalTokens ?? 0), 0),
        averageTokens: executionCount ? Math.round(sum('totalTokens') / executionCount) : null, collected: rows.length > 0};
}

export function observationRoute(url: URL, empty: boolean): unknown {
    const p = url.searchParams;
    const pick = (snake: string, camel: string) => p.has(snake) ? p.get(snake) : p.get(camel);
    const actor = pick('agent_id', 'agentId'), task = pick('task_id', 'taskId'), record = pick('record_id', 'recordId');
    let rows = empty ? [] : observationRequests.filter(r => (actor === null || r.agentKey === actor) && (task === null || r.taskKey === task) && (record === null || r.recordKey === record) && (!p.get('purpose') || r.purpose === p.get('purpose')) && (p.get('other') !== '1' || !r.taskKey));
    if (p.get('all') !== '1') rows = rows.filter(r => dayOf(r.startedAt) >= (pick('start_date', 'startDate') || day) && dayOf(r.startedAt) <= (pick('end_date', 'endDate') || day));
    if (url.pathname.endsWith('/export/')) {
        const include = pick('include_content', 'includeContent') === '1';
        const metrics = observationMetrics(rows);
        return {metadata: {format_version: include ? 2 : 1, generated_at: new Date().toISOString(), timezone: 'Asia/Shanghai', filters: Object.fromEntries(p)},
            summary: {request_count: rows.length, input_tokens: metrics.inputTokens, output_tokens: metrics.outputTokens, total_tokens: metrics.totalTokens,
                ...(include ? {content_available_count: rows.filter(r => bodies.get(r.id)?.available).length, content_unavailable_count: rows.filter(r => !bodies.get(r.id)?.available).length} : {})},
            requests: [...rows].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id)).map((r, i) => ({id: r.id, sequence: i + 1, agent_key: r.agentKey, agent_name: r.agentName, record_key: r.recordKey,
                task_key: r.taskKey, task_name: r.taskName, purpose: r.purpose, phase: r.phase, model_name: r.modelName, provider_name: r.providerName, attempt: r.attempt, status: r.status,
                started_at: r.startedAt, ended_at: r.endedAt, input_tokens: r.inputTokens, output_tokens: r.outputTokens, total_tokens: r.totalTokens, usage_complete: r.usageComplete,
                ...(include ? {content: bodies.get(r.id)} : {})})), by_task: [], by_purpose: [], by_phase: [], by_model_provider: []};
    }
    if (url.pathname.endsWith('/summary/')) return {...observationMetrics(rows), days: rows.length ? [{...observationMetrics(rows), day}] : [], agents: residents.map(r => ({agentKey: r.id, name: r.name})), tasks: [{taskKey: 'local-task-blacksmith', name: '铁匠铺打造'}, {taskKey: 'local-task-farm', name: '农场经营'}, {taskKey: 'local-task-investment', name: '投资决策'}, {taskKey: 'local-task-market', name: '市场采购'}]} satisfies TokenSummary;
    if (url.pathname.endsWith('/requests/')) {
        const ordered = [...rows].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
        const offset = Number(p.get('cursor')) || 0;
        return {items: ordered.slice(offset, offset + 5), hasMore: offset + 5 < rows.length, nextCursor: offset + 5 < rows.length ? String(offset + 5) : null};
    }
    if (url.pathname.endsWith('/content/')) return empty ? {available: false, message: '空数据样例'} : bodies.get(decodeURIComponent(url.pathname.split('/').slice(-3)[0])) || {available: false, message: '未采集'};
    if (url.pathname.endsWith('/breakdown/')) {
        const group = p.get('group') || 'agent';
        const key = (r: TokenRequest) => group === 'agent' ? r.agentKey : group === 'record' ? r.recordKey : group === 'task' ? r.taskKey : r.purpose;
        const items = [...new Set(rows.map(key))].filter(k => k || group === 'agent').map(k => {
            const selected = rows.filter(r => key(r) === k), first = selected[0];
            return {...observationMetrics(selected), key: k, name: group === 'agent' ? first.agentName : group === 'purpose' ? k : first.taskName, lastAt: selected.map(r => r.startedAt).sort().slice(-1)[0]};
        });
        const page = Number(p.get('page')) || 1;
        return {items: items.slice((page - 1) * 30, page * 30), total: items.length, page, hasMore: items.length > page * 30, unassigned: null};
    }
    return undefined;
}
