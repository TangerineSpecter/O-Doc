import assert from 'node:assert/strict';
import {test} from 'node:test';
import {outputFromResponse, inputBlocksFromRequest} from './executionFlow.ts';

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

test('工具调用输出优先用工具名作为摘要', () => {
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

test('Responses 请求保留工具调用和结果关系，推理状态只显示占位说明', () => {
    const blocks = inputBlocksFromRequest({input: [
        {role: 'system', content: '遵守规则'}, {role: 'user', content: '{"market_state":{"cash":10}}'},
        {type: 'reasoning', id: 'r1', encrypted_content: 'private-replay-state'},
        {type: 'function_call', call_id: 'call-1', name: 'get_quotes', arguments: '{"code":"A"}'},
        {type: 'function_call_output', call_id: 'call-1', output: '{"price":12}'},
    ], tools: [{type: 'function', name: 'get_quotes', parameters: {type: 'object'}}]});
    assert.equal(blocks.find(block => block.label === '模型推理状态')?.kind, 'history');
    assert.equal(blocks.find(block => block.label === '工具调用参数与 ID')?.kind, 'history');
    assert.match(blocks.find(block => block.kind === 'tool_results')?.source ?? '', /call-1/);
    assert.ok(blocks.some(block => block.kind === 'tools'));
    assert.ok(!JSON.stringify(blocks).includes('private-replay-state'));
});

test('Responses 输出识别工具调用和文本，不把加密推理状态当输出内容', () => {
    const response = {output: [
        {type: 'reasoning', encrypted_content: 'private-replay-state'},
        {type: 'message', content: [{type: 'output_text', text: '先查询报价'}]},
        {type: 'function_call', name: 'get_quotes', call_id: 'c1', arguments: '{"code":"A"}'},
    ]};
    const output = outputFromResponse(response);
    assert.equal(output?.summary, '调用工具：get_quotes');
    assert.equal(output?.blocks[0].text, '先查询报价');
    assert.match(output?.blocks[1].text ?? '', /c1/);
    assert.ok(!JSON.stringify(output).includes('private-replay-state'));
    assert.equal(outputFromResponse({output: [{type: 'reasoning', encrypted_content: 'private-replay-state'}]})?.summary, '无输出内容');
});
