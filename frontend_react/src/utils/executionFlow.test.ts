import assert from 'node:assert/strict';
import {test} from 'node:test';
import {flowStepsFromRequests, flowTotals, outputFromResponse, inputBlocksFromRequest} from './executionFlow.ts';
import type {TokenRequest} from '../types/api/tokenUsage.ts';

const request = (overrides: Partial<TokenRequest> = {}): TokenRequest => ({
    id: 'r1',
    agentKey: 'a1',
    agentName: '可莉',
    taskKey: 't1',
    taskName: '市场交易',
    recordKey: 'rec1',
    purpose: 'planning',
    phase: '农场种植队列规划',
    modelName: 'glm-5.3-flash',
    modelType: 'large_model',
    providerName: '默认服务',
    attempt: 1,
    status: 'success',
    usageComplete: true,
    startedAt: '2026-10-19T15:42:26+08:00',
    endedAt: '2026-10-19T15:42:30+08:00',
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    cachedTokens: null,
    reasoningTokens: null,
    ...overrides,
});

test('纯 JSON 输入按顶层字段拆卡并映射中文标签', () => {
    const payload = {market_state: {balance: '10000.00', stamina: '95'}, farm: {plots: 4}, objective: '处理一个复杂操作'};
    const blocks = inputBlocksFromRequest({model: 'glm', messages: [{role: 'user', content: JSON.stringify(payload)}]});
    assert.deepEqual(blocks.map(block => block.label), ['市场状态', '农场信息', '目标']);
    assert.ok(blocks[0].chars > 0);
    // 中文内容的 UTF-8 字节数大于字数
    assert.ok(blocks[2].bytes > blocks[2].chars);
});

test('指令文本加资料 JSON 时拆成指令段与资料字段', () => {
    const text = `只依据新闻标题写一条消息。\n资料：${JSON.stringify({news: {title: '标题'}, participants: [{id: 'a', name: '早坂爱'}]})}`;
    const blocks = inputBlocksFromRequest({messages: [{role: 'user', content: text}]});
    assert.deepEqual(blocks.map(block => block.label), ['用户输入', '新闻', '参与者']);
});

test('带 Markdown 标题的文本按标题拆卡，标题内联值单独成卡，容器标题不留空卡', () => {
    const text = [
        '当前 Agent：可莉',
        '',
        '## 补充提示词',
        '# 姓名：可莉 / Klee',
        '',
        '## 年龄：10岁',
        '',
        '## 性格',
        '外向单纯，好奇心旺盛。',
    ].join('\n');
    const blocks = inputBlocksFromRequest({messages: [{role: 'user', content: text}]});
    assert.deepEqual(blocks.map(block => block.label), ['用户输入', '姓名', '年龄', '性格']);
    assert.equal(blocks[1].text, '可莉 / Klee');
    assert.equal(blocks[3].text, '外向单纯，好奇心旺盛。');
});

test('无标题的纯文本按空行拆段', () => {
    const blocks = inputBlocksFromRequest({messages: [{role: 'system', content: '第一段说明。\n\n第二段说明。'}]});
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].label, '第一段说明。');
});

test('决策模型的 {raw, json} 输出按 JSON 字段拆分并给出返回字段摘要', () => {
    const response = {raw: '{"id":"x"}', json: {choices: [{message: {content: '{"job_id":"job.mage","reason":"喜欢爆炸"}'}}]}};
    const output = outputFromResponse(response);
    assert.deepEqual(output?.blocks.map(block => block.label), ['职业选择', '理由']);
    assert.equal(output?.summary, '返回字段：job_id、reason');
});

test('工具调用输出优先用工具名作为箭头摘要', () => {
    const response = {
        id: 'x',
        choices: [
            {
                message: {
                    role: 'assistant',
                    content: '我先查看一下市场情况',
                    tool_calls: [
                        {id: 'c1', function: {name: 'get_market_shop', arguments: '{}'}},
                        {id: 'c2', function: {name: 'get_market_context', arguments: '{}'}},
                    ],
                },
            },
        ],
    };
    const output = outputFromResponse(response);
    assert.equal(output?.summary, '调用工具：get_market_shop、get_market_context');
    assert.equal(output?.blocks[0].text, '我先查看一下市场情况');
    assert.equal(output?.blocks[1].label, '工具调用');
});

test('正文不可用时标记原因且不伪造输入输出', () => {
    const rows = [request({id: 'r9'})];
    const steps = flowStepsFromRequests(rows, {r9: {available: false, message: '请求内容未记录或已超过 30 天保留期'}});
    assert.equal(steps.length, 1);
    assert.equal(steps[0].unavailable, '请求内容未记录或已超过 30 天保留期');
    assert.deepEqual(steps[0].inputs, []);
    assert.deepEqual(steps[0].output, []);
});

test('正文尚未读取与读取失败区分显示', () => {
    const rows = [request({id: 'r1'}), request({id: 'r2'})];
    const pending = flowStepsFromRequests(rows, {});
    assert.equal(pending[0].unavailable, '正在读取正文…');
    const failed = flowStepsFromRequests(rows, {r1: {available: true, request: {messages: []}}, r2: null});
    assert.equal(failed[0].unavailable, undefined);
    assert.equal(failed[1].unavailable, '请求正文读取失败');
});

test('汇总统计步骤数、token 数与输入输出字数', () => {
    const rows = [request({id: 'r1'})];
    const steps = flowStepsFromRequests(rows, {r1: {available: true, request: {messages: [{role: 'user', content: '可莉'}]}, response: {content: '你好'}}});
    const totals = flowTotals(steps);
    assert.equal(totals.steps, 1);
    assert.equal(totals.tokens, 120);
    assert.equal(totals.inputChars, 2);
    assert.equal(totals.outputChars, 2);
    assert.equal(totals.ready, 1);
});

test('倒序分页合并后按实际时间与稳定 ID 正序编号且保留各步输出', () => {
    const rows = [
        request({id: 'r4', startedAt: '2026-10-19T16:00:00+08:00'}),
        request({id: 'r3', startedAt: '2026-10-19T07:45:00Z'}),
        request({id: 'r2', startedAt: '2026-10-19T15:45:00+08:00'}),
        request({id: 'r1', startedAt: '2026-10-19T15:30:00+08:00'}),
    ];
    const contents = Object.fromEntries(rows.map(row => [row.id, {
        available: true, request: {messages: [{role: 'user', content: `输入 ${row.id}`}]},
        response: {content: `输出 ${row.id}`},
    }]));
    const steps = flowStepsFromRequests(rows, contents);
    assert.deepEqual(steps.map(step => step.id), ['r1', 'r2', 'r3', 'r4']);
    assert.deepEqual(steps.map(step => step.index), [1, 2, 3, 4]);
    assert.deepEqual(steps.map(step => step.output[0].text), ['输出 r1', '输出 r2', '输出 r3', '输出 r4']);
    assert.deepEqual(rows.map(row => row.id), ['r4', 'r3', 'r2', 'r1']);
});
