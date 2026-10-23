import assert from 'node:assert/strict';
import test from 'node:test';
import type {AgentConfig} from '@/types/api/setting';
import {AGENT_CSV_HEADERS, convertAgentsToCsv, escapeCsvCell} from './agentCsvExport.ts';

test('escapeCsvCell correctly handles plain text, commas, quotes, and newlines', () => {
    assert.equal(escapeCsvCell('普通文本'), '普通文本');
    assert.equal(escapeCsvCell(undefined), '');
    assert.equal(escapeCsvCell(null), '');
    assert.equal(escapeCsvCell('含有,逗号'), '"含有,逗号"');
    assert.equal(escapeCsvCell('含有"双引号"'), '"含有""双引号"""');
    assert.equal(escapeCsvCell('含有\n换行'), '"含有\n换行"');
    assert.equal(escapeCsvCell('综合,"测试"\n多行'), '"综合,""测试""\n多行"');
});

test('convertAgentsToCsv generates standard CSV with UTF-8 BOM, headers and agent fields excluding model', () => {
    const mockAgents: AgentConfig[] = [
        {
            id: 'agent-1',
            name: '小橘',
            avatar: '',
            model: 'gpt-4o', // 导出中不应包含大模型
            money: '1000',
            stamina: '100',
            mcpServers: [],
            skills: [],
            feishuImEnabled: false,
            feishuAppId: '',
            feishuAppSecret: '',
            feishuVerificationToken: '',
            feishuEncryptKey: '',
            roleProfile: {
                age: '18岁',
                mbti: 'ENFP',
                identity: '旅行作家，喜欢游历各地',
                personality: '开朗热情，富有同理心',
                preferences: '喜欢草莓布丁、摄影',
                expression: '语气温和亲切',
                appearance: '头戴橘色发带，身穿白色衬衫',
            },
            prompt: '补充提示词：保持探索与记录的热情。',
        },
        {
            id: 'agent-2',
            name: '林芽,带有逗号',
            avatar: '',
            model: 'claude-3-5-sonnet',
            money: '2000',
            stamina: '80',
            mcpServers: [],
            skills: [],
            feishuImEnabled: false,
            feishuAppId: '',
            feishuAppSecret: '',
            feishuVerificationToken: '',
            feishuEncryptKey: '',
            prompt: '纯提示词，无角色设定',
        },
    ];

    const csv = convertAgentsToCsv(mockAgents);

    // 必须以 UTF-8 BOM (\uFEFF) 开头
    assert.ok(csv.startsWith('\uFEFF'), 'CSV 应该包含 UTF-8 BOM');

    const lines = csv.slice(1).split('\r\n');
    assert.equal(lines.length, 3, '包含表头与两行数据');

    // 验证表头
    assert.equal(lines[0], AGENT_CSV_HEADERS.join(','));
    assert.equal(
        lines[0],
        '名字,年龄说明,MBTI,身份与背景,性格与判断倾向,兴趣与生活偏好,表达与相处方式,外貌与服饰,补充提示词',
    );

    // 不包含模型列
    assert.ok(!lines[0].includes('大模型') && !lines[0].includes('模型'));
    assert.ok(!csv.includes('gpt-4o') && !csv.includes('claude-3-5-sonnet'));

    // 验证第 1 个 Agent 的数据行
    const row1 = lines[1];
    assert.ok(row1.startsWith('小橘,18岁,ENFP,旅行作家，喜欢游历各地,开朗热情，富有同理心,喜欢草莓布丁、摄影,语气温和亲切,头戴橘色发带，身穿白色衬衫,'));
    assert.ok(row1.includes('补充提示词：保持探索与记录的热情。'));

    // 验证第 2 个 Agent 的转义与空值
    const row2 = lines[2];
    assert.ok(row2.startsWith('"林芽,带有逗号",,,,,,,,纯提示词，无角色设定'));
});
