import {HttpResponse} from 'msw';
import type {QuantAIRun, QuantEntryDetail, QuantReport, QuantSource} from '../../types/api/quant';
import type {QuantFeedbackAnalysis, QuantFeedbackInput} from '../../types/api/quantFeedback';
import {createRun} from './runs';
import {quantModels} from './fixtures';
import {collectMockFactors} from './factors';
import {persistQuantState, quantId, quantState} from './state';
import {mockConfiguration} from './parameters';
import {mockMemoryMarkdown} from './researchMemory';
import {normalizeMockExecution, mockExecutionParameterComparison, localExecutionHash} from './platformEvidence';
import type {QuantComputedExecution,QuantExecutionPreview} from '../../types/api/quantPlatformEvidence';
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});

export function collectMockFeedback(entry: QuantEntryDetail, input: QuantFeedbackInput) {
    const execution = !!input.executionAdapter;
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(input.requestKey || '') || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 255 || typeof input.document !== 'string' || !input.document.trim() || (execution ? new TextEncoder().encode(input.document).length > 1048576 : input.document.length > 60000)) return fail(400, '请填写有效标题、报告内容和请求标识');
    const target = entry.sources?.find(source => source.id === input.targetSourceId && source.payload.provenance !== 'external_feedback');
    if (!target) return fail(400, '反馈须关联当前研究的原始来源');
    if (!['unknown', 'backtest', 'paper', 'live', 'configuration'].includes(input.mode) || !['text', 'json', 'csv', 'html', 'mql_set'].includes(input.documentFormat)) return fail(400, '反馈类型或格式无效');
    if (input.documentFormat === 'mql_set' && input.mode !== 'configuration') return fail(400, 'SET 须标记为参数配置');
    if (execution && input.mode === 'configuration' || !execution && input.executionOptionsJson !== undefined) return fail(400, '结构化执行记录须选择运行模式和明确适配器');
    let executionPreview: QuantExecutionPreview | undefined;
    if (execution) {try {executionPreview = normalizeMockExecution(input);} catch (error) {return fail(400, error instanceof Error ? error.message : '执行资料无效');}}
    let configuration;
    if (input.documentFormat === 'mql_set') {
        try {configuration = mockConfiguration(input.document, target);} catch (error) {return fail(400, error instanceof Error ? error.message : '配置无效');}
    }
    if (input.documentFormat === 'json') {
        try {const parsed: unknown = JSON.parse(input.document, (_key, value: unknown) => {if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('non-finite'); return value;}); if (!parsed || typeof parsed !== 'object') throw new Error('invalid');}
        catch {return fail(400, 'JSON 报告必须是完整对象或列表');}
    }
    const factor = input.factorId ? collectMockFactors([entry]).find(row => row.id === input.factorId && row.sourceId === input.targetSourceId) : undefined;
    if (input.factorId && !factor) return fail(400, '因子与反馈目标来源不一致');
    if (input.experimentResultId && !quantState().experiments.some(row => row.collection === entry.collId && row.data.reviewContext?.experimentResultId === input.experimentResultId && row.data.reviewContext?.sourceId === input.targetSourceId && (!factor || row.input.seeds.some(seed => seed.candidateId === factor.id)))) return fail(400, '实验不包含当前反馈目标');
    const fingerprint = executionPreview ? JSON.stringify([input.requestKey, input.title.trim(), input.targetSourceId, input.factorId || '', input.experimentResultId || '',
        input.mode, input.documentFormat, input.document, input.platform || '', input.notes || '', input.analyze !== false, input.modelId || '', executionPreview.execution_evidence.adapter, executionPreview.execution_evidence.options]) : JSON.stringify(input);
    const identity = `feedback-${entry.id}-${input.requestKey}`;
    const existing = entry.sources?.find(row => row.id === identity);
    if (existing) return existing.payload.requestFingerprint === fingerprint ? {source: existing, notice: ''} : fail(409, '该反馈请求标识已用于其他材料');
    const source: QuantSource = {id: identity, materialId: identity, codeVersionId: null, createdAt: new Date().toISOString(), payload: {
        provenance: 'external_feedback', feedbackVersion: executionPreview ? 5 : configuration ? 2 : 1,
        ...(executionPreview ? {executionPreviewJson: JSON.stringify(executionPreview)} : {}), ...(configuration ? {parameterConfiguration: configuration.configuration, parameterComparison: configuration.comparison} : {}), title: input.title, targetSourceId: input.targetSourceId, factorId: input.factorId || '',
        experimentResultId: input.experimentResultId || '', document: input.document, documentFormat: input.documentFormat, platform: input.platform || '', notes: input.notes || '', mode: input.mode, requestFingerprint: fingerprint}};
    (entry.sources ||= []).unshift(source);
    const unavailable = !!input.modelId && !quantModels.models.some(row => row.id === input.modelId);
    if (input.analyze !== false && !unavailable) createRun(entry, {kind: 'feedback_review', sourceId: source.id, requestKey: input.requestKey, modelId: input.modelId});
    persistQuantState();
    return {source, notice: unavailable ? '请选择已配置的对话模型' : ''};
}

export function mockFeedbackAnalysis(source?: QuantSource): QuantFeedbackAnalysis {
    const document = source?.payload.document || '';
    if (document.includes('LOCAL_NATIVE_PYTHON')){
        const parsed=JSON.parse(document) as {verdict:'pass'|'fail'|'inconclusive'|'unavailable';parameters:{name:string;value:number|boolean|string}[]};
        return {feedbackVersion:1,evidenceStatus:'external_report_unverified',title:'原始Python函数验证 · 人工解读样例',summary:'此报告仅演示固定源码、实际参数、原始输出对照与AI解读的流程，没有执行Python、模型或行情。',
            reportedParameters:[],reportedMetrics:[],supportingEvidence:[],counterEvidence:[],comparison:'人工样例结论只属于这次记录，不证明收益或平台全局等价。',hypotheses:['在其他区间固定相同参数对照，保留失败与缺失反例'],unknowns:['真实源码输出、运行器和模型质量仍需独立验收'],nextSteps:'补充真实固定样本验证，参数建议仍为待检验假设。',
            nativeReviewVersion:1,nativeReview:{verdict:parsed.verdict,actualParameters:parsed.parameters,interpretation:'人工样例保留计算判定和差异；不以输出一致提高收益评分。',parameterAssessment:'参数范围建议需要新样本检验，不将默认值当作本次实际配置。',limitations:['本地样例未运行原始函数、未调用真实AI。']}};
    }
    const parameter = document.match(/N=(\d+)/), metric = document.match(/net=(-?\d+(?:\.\d+)?%)/);
    const target = quantState().entries.flatMap(row => row.sources || []).find(row => row.id === source?.payload.targetSourceId);
    const configured = source?.payload.parameterConfiguration && target ? mockConfiguration(document, target) : undefined;
    if (source && [3,5].includes(source.payload.feedbackVersion || 0) && source.payload.executionPreviewJson && target) {
        const frozen = JSON.parse(source.payload.executionPreviewJson) as QuantExecutionPreview;
        const status = frozen.execution_accounting.status;
        const parameterComparison=mockExecutionParameterComparison(frozen,target,source.payload.feedbackVersion===5?2:1);
        const reference = status === 'mismatch' ? frozen.execution_accounting.reconciliation.mismatches[0]?.ref : 'accounting:net_profit';
        return {feedbackVersion: 1, evidenceStatus: 'external_report_unverified', evidenceHash: localExecutionHash([source.payload.executionPreviewJson, target.id]),
            title: `${source.payload.title || '执行证据'} · 本地演示解读`, summary: '人工执行证据流程样例：固定来源、核算投影与后续研究分开保留，未调用真实模型或平台核算引擎。',
            executionAssessment: {summary: status === 'mismatch' ? '人工样例显示余额核对差异，需先核查资料覆盖与口径。' : status === 'insufficient' ? '人工样例证据不足，缺失金额与净值保持未知。' : '人工样例余额相符，仅用于演示，不证明平台真实性或策略有效。',
                findings: [{kind: status === 'mismatch' ? 'counters' : status === 'insufficient' ? 'limitation' : 'supports', claim: '仅引用当前固定人工核算依据；不把一致性或收益方向当作真实效果证明。', refs: [reference || 'execution:metadata']},...(parameterComparison.version===2?[{kind:'limitation' as const,claim:'人工样例：源码默认、初始赋值与报告声明分开，缺失映射不猜测。',refs:[parameterComparison.ref!]}]:[])],
                unknowns: ['资料真实性、成交覆盖与原平台执行语义尚未独立验证。']},
            computedExecutionJson: JSON.stringify({execution_summary: frozen.execution_summary, execution_parameter_comparison: parameterComparison}),
            reportedParameters: [], reportedMetrics: [], supportingEvidence: [], counterEvidence: [], comparison: '执行核算以固定结构化证据为依据；报告声明参数保留原名，不使用源码默认值补齐实际配置。',
            hypotheses: ['补充同口径资料后在独立行情复核，不直接启动交易。'], unknowns: ['本地为明确人工样例，真实核算与模型质量尚未验收。'], nextSteps: '核查当前固定证据引用，并使用新行情检验假设。'};
    }
    return {...(configured ? {parameterConfiguration: configured.configuration, parameterComparison: configured.comparison} : {}), title: `${source?.payload.title || '使用反馈'} · 本地演示解读`, summary: '本地样例演示外部反馈归档、原文依据与研究报告，未调用真实模型；不能据此评价实盘表现。',
        feedbackVersion: 1, evidenceStatus: 'external_report_unverified',
        reportedParameters: parameter ? [{name: 'N', value: parameter[1], unit: '', quote: parameter[0]}] : [],
        reportedMetrics: metric && !configured ? [{name: 'net', value: metric[1], unit: '%', quote: metric[0]}] : [],
        supportingEvidence: [], counterEvidence: [], comparison: '真实分析将核对报告声明的参数与源码默认值，并先检查平台、费用和成交约定差异。',
        hypotheses: ['待真实分析后提出可否证假设'], unknowns: ['未完成独立复算', '报告覆盖范围与实际成本需核对'], nextSteps: '补齐实际参数和数据口径，在新行情检验；本地样例不会启动实验。'};
}

export function mockFeedbackReport(run: QuantAIRun): QuantReport {
    const data = run.result.feedback!;
    const values = (title: string, rows: QuantFeedbackAnalysis['reportedParameters']) => `## ${title}\n\n${rows.map(row => `### ${row.name}\n\n${row.value}${row.unit && !row.value.endsWith(row.unit) ? ` ${row.unit}` : ''}\n\n原文依据：${row.quote}`).join('\n\n') || '未识别明确值；不能使用源码默认值代替。'}`;
    const extracted = data.nativeReview?'':data.executionAssessment && data.computedExecutionJson ? `## 报告声明的运行参数\n\n${(JSON.parse(data.computedExecutionJson) as {execution_summary: {parameters: {name: string; value: string; unit: string}[]}}).execution_summary.parameters.map(row => `- ${row.name}：${row.value} ${row.unit}`).join('\n') || '未提供明确运行参数，不能使用源码默认值补齐。'}` : `${values(data.parameterConfiguration ? '文件配置参数' : '报告声明的实际参数', data.reportedParameters)}\n\n${values('报告声明的指标', data.reportedMetrics)}`;
    const markdown = `# ${data.title}\n\n${data.summary}\n\n${data.nativeReview?'本机Python原始函数固定样本解读 · 本地人工流程样例':'外部报告解读 · 用户声明尚未独立验证'}\n\n${extracted}\n\n## 对照与差异\n\n${data.comparison}\n\n## 缺失信息\n\n${data.unknowns.join('\n\n')}\n\n## 后续研究\n\n${data.nextSteps}`;
    const nativeMarkdown=data.nativeReview?`\n\n## Python原始函数固定样本解读\n\n计算判定：${data.nativeReview.verdict}\n\n| 参数 | 本次实际值 |\n| --- | --- |\n${data.nativeReview.actualParameters.map(row=>`| ${row.name} | ${JSON.stringify(row.value)} |`).join('\n')}\n\n${data.nativeReview.interpretation}\n\n${data.nativeReview.parameterAssessment}\n\n${data.nativeReview.limitations.join('；')}`:'';
    const executionMarkdown = data.executionAssessment ? `\n\n## 结构化执行证据与核算\n\n${data.executionAssessment.summary}\n\n${data.executionAssessment.findings.map(row => `${row.kind}：${row.claim}\n\n依据：${row.refs.join('、')}`).join('\n\n')}\n\n${data.executionAssessment.unknowns.join('\n\n')}` : '';
    const compared=data.computedExecutionJson?(JSON.parse(data.computedExecutionJson) as QuantComputedExecution).execution_parameter_comparison:undefined;
    const sourceParameters=compared?.version===2?`\n\n### 源码参数对照 · 本地人工样例\n\n${compared.rows.map(row=>`- ${row.name}：报告值 ${JSON.stringify(row.configured.value)}；${row.declaration?.binding_kind==='module_literal'?'初始赋值（非公开输入）':'默认声明'} ${row.declaration?.default_raw || '未知'}；${row.status}`).join('\n')}\n\n报告未提供：${compared.missing.map(row=>row.name).join('、') || '没有缺项'}。不补实际值。`:'';
    return {id: quantId('report'), sourceId: run.sourceId!, runId: run.id, schemaVersion: 5, data, markdown: markdown + nativeMarkdown + executionMarkdown + sourceParameters + mockMemoryMarkdown(run), originalMarkdown: markdown + nativeMarkdown + executionMarkdown + sourceParameters + mockMemoryMarkdown(run), currentRevisionId: '', createdAt: new Date().toISOString(), revisions: []};
}
