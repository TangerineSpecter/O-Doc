import sourceAlgorithmSamples from './sourceAlgorithmSamples.json' with {type: 'json'};
import {algorithmProfile} from '../../utils/quantAlgorithm';
import {mockInternalStateFactors} from './factorReadiness';
import {mockAdmissionSummary,flushMockAdmissions} from './admissions';
import {mockQualificationSummary} from './qualification';
import {mockVocabulary} from './vocabulary';
import {mockClassification} from './vocabularyClassification';
import type {QuantFactorCandidate, QuantFactorData, QuantEntryDetail, QuantSource} from '../../types/api/quant';
import {mockArithmeticParameters, mockConditionalParameters} from './parameterConditions';
import {quantState} from './state';
import {shareCuration} from './factorIdentity';

export function mockFactors(source?: QuantSource): QuantFactorData[] {
    if (!source?.payload.code?.trim()) return [];
    if (source.payload.code.includes('LOCAL_PYTHON_ALGORITHMS')) {
        const base = structuredClone(sourceAlgorithmSamples[0]) as QuantFactorData;
        return [{...base,name:'价格平方根变换',summary:'普通Python函数、循环和标准库导入的人工样例。',parameters:[],formula:'y[t] = sqrt(abs(close[t]))',
            expression:{op:'python',version:1,code:'import math\n\ndef compute(inputs, parameters=None):\n    result = []\n    for price in inputs["close"]:\n        result.append(math.sqrt(abs(price)))\n    return result\n'},dependencies:['Python标准库math']}];
    }
    if (source.payload.code.includes('LOCAL_SOURCE_ALGORITHMS')) return (structuredClone(sourceAlgorithmSamples) as QuantFactorData[]).map(row => ({...row, name: `${row.name}（IAKF_${row.expression?.output}）`}));
    const conditional = source.payload.code.includes('LOCAL_PARAMETER_CONDITION');
    const arithmetic = source.payload.code.includes('LOCAL_ARITHMETIC_PARAMETERS');
    const constrained = source.payload.code.includes('LOCAL_PARAMETER_DOMAIN');
    const short = source.payload.code.includes('LOCAL_LIBRARY_WINDOW_10');
    const result: QuantFactorData[] = [{name: short ? '短窗口 · 跨来源演示候选' : '区间动量 · 本地演示候选', role: 'factor', family: 'momentum', summary: '这是因子库流程样例，不代表对输入源码的真实提取。', formula: 'close / lag(close, lookback) - 1',
        inputs: [{name: 'close', meaning: '收盘价序列', availability: '每根 K 线收盘后', missingPolicy: '窗口不足时缺失，真实实现需核对'}], outputType: 'numeric_series', units: '比率', timeframe: 'lookback 根 K 线；交易周期待确认',
        parameters: arithmetic ? mockArithmeticParameters(source.payload.code) : conditional ? mockConditionalParameters(source.payload.code) : [{name: 'lookback', type: 'int', defaultValue: short ? '10' : '20', category: 'signal', meaning: '历史窗口', constraints: '正整数', effect: '改变比较跨度', suggestion: '比较相邻窗口的稳定性，尚无经验证的最佳值', evidence: '本地模拟参数，不是对原代码的识别', ...(constrained ? {domain: {version: 1 as const, minimum: 5, maximum: 30, step: 5, stepOrigin: 0, choices: [], relations: [], evidence: [{field: 'code' as const, quote: source.payload.code.slice(0, 500)}]}} : {})}], dependencies: ['价格序列与一致的复权口径'], limitations: '未调用真实模型，未回测或验证平台等价性。', tags: ['动量', '演示'],
        expression: {op: 'sub', args: [{op: 'div', args: [{op: 'input', name: 'close'}, {op: 'lag', args: [{op: 'input', name: 'close'}, {op: 'parameter', name: 'lookback'}]}]}, {op: 'constant', value: 1}]},
        evidence: [{field: 'code', quote: source.payload.code.slice(0, 500)}]}];
    if (source.payload.code.includes('LOCAL_INTERNAL_STATE_FACTORS')) return mockInternalStateFactors(result[0]);
    if (source.payload.language === 'tongdaxin' && source.payload.code.includes('LOCAL_TDX_PARAMETER_TABLE')) {
        const candidate = result[0];
        candidate.name = '参数表 · 通达信人工流程样例';
        candidate.formula = 'close / lag(close, N) - 1';
        candidate.parameters = [{...candidate.parameters[0], name: 'N', evidence: '人工预制参数表，不解析本次粘贴的源码或表格',
            domain: {version: 5, minimum: 2, maximum: 60, step: null, stepOrigin: null, choices: [], relations: [], conditions: [],
                evidence: [{field: 'description', quote: '参数,最小,最大,缺省'}, {field: 'description', quote: 'N,2,60,20'}]}}];
        candidate.expression = {op: 'sub', args: [{op: 'div', args: [{op: 'input', name: 'close'},
            {op: 'lag', args: [{op: 'input', name: 'close'}, {op: 'parameter', name: 'N'}]}]}, {op: 'constant', value: 1}]};
    }
    if (source.payload.code.includes('LOCAL_AI_REPAIR')) result[0].expression = null;
    if (arithmetic) result[0].name = '算术参数 · 本地演示候选';
    if (source.payload.code.includes('LOCAL_JOINT_PARAMETERS')) {
        const candidate = result[0];
        candidate.name = '周期与阈值 · 联合参数演示';
        candidate.parameters.push({...candidate.parameters[0], name: 'threshold', type: 'float', defaultValue: '0.01', meaning: '动量阈值（人工样例）', constraints: '有限数值', effect: '控制触发条件', suggestion: '与周期组成完整网格对照，未验证表现'});
        candidate.expression = {op: 'gt', args: [candidate.expression, {op: 'parameter', name: 'threshold'}]};
        candidate.outputType = 'boolean_series'; candidate.units = 'boolean';
        candidate.formula = 'close / lag(close, lookback) - 1 > threshold';
    }
    if (source.payload.code.includes('LOCAL_BOOLEAN_FILTER')) {
        const candidate = result[0];
        candidate.expression = {op: 'gt', args: [candidate.expression, {op: 'constant', value: 0}]};
        candidate.formula = 'close / lag(close, lookback) - 1 > 0';
        candidate.outputType = 'boolean_series'; candidate.units = 'boolean'; candidate.role = 'filter';
        candidate.name = '趋势过滤 · 本地演示候选';
    }
    if (source.payload.code.includes('LOCAL_STRING_PARAMETER')) {
        const candidate = result[0], original = candidate.expression;
        candidate.parameters.push({...candidate.parameters[0], name: 'mode', type: 'string', defaultValue: '"trend"',
            meaning: '信号模式（人工样例）', constraints: '仅允许 trend 或 reverse', suggestion: '比较两种离散模式，未验证收益',
            domain: {version: 3, minimum: null, maximum: null, step: null, stepOrigin: null, choices: ['trend', 'reverse'], relations: [], conditions: [], evidence: [{field: 'code', quote: source.payload.code.slice(0, 500)}]}});
        candidate.expression = {op: 'or', args: ['trend', 'reverse'].map(mode => ({op: 'and', args: [
            {op: 'eq', args: [{op: 'parameter', name: 'mode'}, {op: 'constant', value: mode}]},
            {op: mode === 'trend' ? 'gt' : 'lt', args: [original, {op: 'constant', value: 0}]},
        ]}))};
        candidate.formula = 'mode == "trend" 时使用正动量；mode == "reverse" 时使用负动量';
        candidate.name = '模式枚举 · 本地演示候选'; candidate.role = 'signal'; candidate.outputType = 'boolean_series'; candidate.units = 'boolean';
    }
    return result;
}

function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
    return JSON.stringify(value);
}
export function collectMockFactors(entries: QuantEntryDetail[]): QuantFactorCandidate[] {
    const extracted: QuantFactorCandidate[] = entries.filter(entry => entry.isValid).flatMap(entry => (entry.reports || []).filter(report=>report.publicationMode!=='pending').flatMap(report => (report.data.factors || []).map((data, index) => {
        const id = `candidate-${report.id}-${index}`;
        const revisions = quantState().factorRevisions[id] || [];
        const current = revisions[revisions.length - 1];
        const source = entry.sources?.find(row => row.id === report.sourceId)?.payload;
        const contract = {role: data.role, outputType: data.outputType, units: data.units, timeframe: data.timeframe,
            inputs: [...data.inputs].sort((a, b) => a.name.localeCompare(b.name)), parameters: data.parameters.map(({name, type, defaultValue, category, meaning, constraints, domain}) => ({name, type, defaultValue, category, meaning, constraints, ...(domain ? {domain} : {})})).sort((a, b) => a.name.localeCompare(b.name)), dependencies: [...new Set(data.dependencies)].sort(), language: source?.language || 'text'};
        return {id, reportId: report.id, sourceId: report.sourceId, entryId: entry.id, entryTitle: entry.title,
            data, expressionHash: data.expression ? 'local-demo-structural-fingerprint' : '', contentHash: 'local-demo-content-fingerprint',
            fingerprints: {raw: source?.code ? stable({code: source.code, formula: data.formula, contract}) : '', expression: data.expression ? stable({expression: data.expression, contract}) : ''}, occurrenceCount: 1,
            curation: current?.data || {name: data.name, family: data.family, tags: data.tags, aliases: [], note: ''}, currentRevisionId: current?.id || '', curationRevisionId: current?.id || '', curationInherited: false, revisions,
            modelName: entry.runs.find(run => run.id === report.runId)?.modelName || '本地模拟', evidenceStatus: 'static_unverified' as const, createdAt: report.createdAt};
    })));
    const derived = quantState().derivedFactors.filter(row => entries.some(entry => entry.isValid && entry.id === row.entryId)).map(row => {
        const revisions = quantState().factorRevisions[row.id] || [], current = revisions[revisions.length - 1];
        return {...row, entryTitle: entries.find(entry => entry.id === row.entryId)?.title || row.entryTitle, data: {...row.data, derivation: row.data.derivation ? {...row.data.derivation, localDemo: true} : undefined}, curation: current?.data || row.curation, currentRevisionId: current?.id || '', curationRevisionId: current?.id || '', curationInherited: false, revisions};
    });
    shareCuration([...derived, ...extracted]);
    const vocabularies = new Map(entries.map(entry => [entry.collId, mockVocabulary(entry.collId)]));
    const result=[...derived, ...extracted].map(candidate => {
        const entry = entries.find(row => row.id === candidate.entryId);
        const vocabulary = entry && vocabularies.get(entry.collId);
        const source = entry?.sources?.find(row => row.id === candidate.sourceId);
        const unchecked = !!source?.payload.code?.includes('LOCAL_VERIFICATION_UNCHECKED') && !quantState().verificationIndexed[candidate.id];
        const verification = mockQualificationSummary(candidate, unchecked);
        return vocabulary ? {...candidate, algorithmProfile: algorithmProfile({...candidate.data, family: candidate.curation.family, tags: candidate.curation.tags}), verification, admission:mockAdmissionSummary(candidate,entry!.collId), classification: mockClassification(candidate, vocabulary, !candidate.data.formulaVersion && !candidate.data.derivation ? source?.payload.platform : '')} : candidate;
    });
    flushMockAdmissions();return result;
}
