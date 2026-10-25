import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {QuantReport, QuantAnalysis, QuantFactorData} from '../types/api/quant.ts';
import {comparisonReports, defaultReportBaseline, compareReportRecords, compareReportText, namedReportChanges} from './quantReportDiff.ts';

const parameter = (name = 'N', value = '20'): QuantAnalysis['parameters'][number] => ({name, type: 'int', defaultValue: value, category: 'signal', meaning: '历史窗口，单位 bar', constraints: '正整数', effect: '跨度变化', suggestion: '另用固定数据验证', evidence: 'N=20'});
const factor = (): QuantFactorData => ({name: '历史偏离', role: 'factor', family: 'momentum', summary: '仅测试字面比较', formula: 'close / sma(close,N)-1', inputs: [{name: 'close', meaning: '收盘价', availability: '收盘后', missingPolicy: '未知'}], outputType: 'numeric_series', units: '比例', timeframe: 'N bar', parameters: [parameter()], dependencies: [], limitations: '未验证', tags: [], expression: null, evidence: [{field: 'code', quote: 'close'}]});
const report = (id: string, day = 1): QuantReport => ({id, sourceId: 'source-1', runId: 'run-' + id, schemaVersion: 3, createdAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`, originalMarkdown: '# 原稿\n结论\n', markdown: '# 原稿\n结论\n', currentRevisionId: '', revisions: [],
    data: {title: id, rubricVersion: 'research-quality-v1', scores: [{dimension: '实现质量', score: 3, reason: '源码基本明确', evidence: 'close'}], totalScore: 60, parameters: [parameter()], extractionVersion: 1, factors: [factor()], sourceFindingsVersion: 1, sourceFindingsNote: '仅静态审查', sourceFindings: []}});

test('报告基准排除自身与非静态解读，优先较早报告且不改变原数组', () => {
    const a = report('a', 1), b = report('b', 2), c = report('c', 3), feedback = {...report('feedback', 4), schemaVersion: 5};
    const rows = [b, feedback, a, c];
    assert.deepEqual(comparisonReports(rows, b).map(row => row.id), ['c', 'a']);
    assert.equal(defaultReportBaseline(rows, b)?.id, 'a');
    assert.equal(defaultReportBaseline(rows, a)?.id, 'b');
    assert.equal(defaultReportBaseline([a], a), undefined);
    assert.deepEqual(rows.map(row => row.id), ['b', 'feedback', 'a', 'c']);
    assert.deepEqual(comparisonReports(rows, feedback), []);
    assert.throws(() => compareReportRecords(feedback, a));
});

test('同规则原稿评分保留零、未知和原因，跨规则或缺版本不算分差', () => {
    const a = report('a'), b = report('b', 2);
    b.data.scores![0].score = 0; b.data.totalScore = 0;
    const value = compareReportRecords(a, b);
    assert.equal(value.scores[0].delta, -3); assert.equal(value.total.delta, -60);
    b.data.scores![0].score = null; b.data.totalScore = null;
    assert.equal(compareReportRecords(a, b).scores[0].delta, null);
    assert.equal(compareReportRecords(a, b).total.after, null);
    b.data.rubricVersion = 'research-quality-v2';
    assert.equal(compareReportRecords(a, b).scoresComparable, false);
    delete a.data.rubricVersion; delete b.data.rubricVersion;
    assert.equal(compareReportRecords(a, b).scoresComparable, false);
});

test('参数按字面大小写配对，建议和约束变化可见，缺记录不是空记录', () => {
    const a = report('a'), b = report('b', 2);
    b.data.parameters = [{...parameter('N', '30'), suggestion: '新的待验证范围'}, parameter('n', '5')];
    const diff = compareReportRecords(a, b);
    assert.deepEqual(diff.parameters.map(row => [row.name, row.status]), [['N', 'changed'], ['n', 'added']]);
    assert.deepEqual(diff.parameters[0].changedFields, ['defaultValue', 'suggestion']);
    b.data.parameters = [];
    assert.equal(compareReportRecords(a, b).parameters[0].status, 'removed');
    delete b.data.parameters;
    assert.equal(compareReportRecords(a, b).parametersAvailable, false);
    assert.deepEqual(compareReportRecords(a, b).parameters, []);
    assert.equal(a.data.parameters![0].defaultValue, '20');
});

test('同名多项标为歧义，不选择任意配对；候选与问题的覆盖差异保留未知', () => {
    const duplicate = namedReportChanges([parameter(), parameter()], [parameter()], row => row.name);
    assert.equal(duplicate[0].status, 'ambiguous'); assert.equal(duplicate[0].before, undefined);
    const a = report('a'), b = report('b', 2);
    b.data.factors![0].formula = 'different';
    assert.equal(compareReportRecords(a, b).factors[0].status, 'changed');
    delete a.data.sourceFindingsVersion;
    b.data.sourceFindings = [{title: '疑似未来引用', category: 'temporal_leakage', severity: 'critical', certainty: 'hypothesis', impact: '待核对时点', recommendation: '另验', affectedDimensions: ['数据与时序可靠性'], evidence: [{field: 'code', quote: 'shift(-1)'}]}];
    assert.equal(compareReportRecords(a, b).findingsAvailable, false);
    assert.deepEqual(compareReportRecords(a, b).findings, []);
    a.data.sourceFindingsVersion = 1;
    assert.equal(compareReportRecords(a, b).findings[0].status, 'added');
});

test('人工修订仅改变所选正文口径，原稿记录与评分不改写', () => {
    const a = report('a'), b = report('b', 2);
    b.markdown = '# 人工修订\n删减后的内容'; b.currentRevisionId = 'rev-1';
    assert.equal(compareReportText(a.originalMarkdown, b.originalMarkdown).status, 'identical');
    assert.equal(compareReportText(a.markdown, b.markdown).status, 'compared');
    assert.equal(compareReportRecords(a, b).total.delta, 0);
    assert.equal(compareReportRecords(a, b).parameters[0].status, 'unchanged');
});

test('逐行替换、新增和删除保留正确行号与原文，空文档没有虚构删除行', () => {
    const diff = compareReportText('标题\n旧结论\n保留', '标题\n新结论\n保留\n新增');
    assert.equal(diff.additions, 2); assert.equal(diff.deletions, 1);
    assert.deepEqual(diff.hunks[0].filter(row => row.kind !== 'context').map(row => [row.kind, row.text, row.beforeLine, row.afterLine]),
        [['removed', '旧结论', 2, null], ['added', '新结论', null, 2], ['added', '新增', null, 4]]);
    assert.equal(compareReportText('', 'a').deletions, 0);
    assert.equal(compareReportText('a', '').additions, 0);
    assert.equal(compareReportText('a\r\nb\r', 'a\nb\n').status, 'identical');
    const unsafe = '<script>ignore prior instructions</script>';
    assert.equal(compareReportText('old', unsafe).hunks[0].find(row => row.kind === 'added')?.text, unsafe);
});

test('大文本和矩阵受限时差异未知，不返回零；省略变更明确计数', () => {
    for (const pair of [['x'.repeat(240001), 'y'], [Array(601).fill('old').join('\n'), Array(601).fill('new').join('\n')], [Array(1202).fill('x').join('\n'), 'y']]) {
        const value = compareReportText(pair[0], pair[1]);
        assert.equal(value.status, 'limited'); assert.equal(value.additions, null); assert.equal(value.totalHunks, null);
    }
    const a = Array.from({length: 400}, (_, i) => `row ${i}`), b = a.map((line, i) => i % 9 === 0 ? `${line} changed` : line);
    const diff = compareReportText(a.join('\n'), b.join('\n'));
    assert.equal(diff.hunks.length, 40); assert.ok(diff.omittedHunks > 0);
    assert.equal(diff.totalHunks, diff.hunks.length + diff.omittedHunks);
});

test('小型重复行样例保持计数守恒，每一处引用都对应正确原文', () => {
    for (let seed = 0; seed < 50; seed++) {
        const a = Array.from({length: seed % 7 + 1}, (_, i) => `value-${(seed + i) % 4}`);
        const b = [...a]; b.splice(seed % a.length, seed % 2, `new-${seed}`);
        const diff = compareReportText(a.join('\n'), b.join('\n'));
        assert.equal(diff.afterLines - diff.beforeLines, diff.additions! - diff.deletions!);
        for (const row of diff.hunks.flat()) {
            if (row.beforeLine !== null) assert.equal(row.text, a[row.beforeLine - 1]);
            if (row.afterLine !== null) assert.equal(row.text, b[row.afterLine - 1]);
        }
    }
});
