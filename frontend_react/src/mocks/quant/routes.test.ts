import assert from 'node:assert/strict';
import {beforeEach, test} from 'node:test';
import {resolveQuantRoute} from './routes.ts';
import {decodeFeedbackFile} from '../../utils/quantFeedbackFile.ts';
import {clearQuantMockData, quantState, resetQuantStateForTests} from './state.ts';
import type {QuantAIRun, QuantEntryDetail, QuantImplementation, QuantAttachment, QuantEntry, QuantCodeVersion} from '../../types/api/quant.ts';
import type {Anthology} from '../../types/api/anthology.ts';
import type {QuantModels} from '../../types/api/quant.ts';
import type {QuantBatch, QuantBatchInput} from '../../types/api/quantIntake.ts';
import {decodeSourceFile, emptyMaterial, validateMaterials} from '../../utils/quantIntake.ts';
import {compareReportRecords, compareReportText} from '../../utils/quantReportDiff.ts';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {value: {getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), key: (index: number) => [...storage.keys()][index] || null, get length() {return storage.size;}}, configurable: true});
Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=sample'), writable: true, configurable: true});
const setScenario = (state: string) => Object.defineProperty(globalThis, 'location', {value: new URL(`http://localhost/?mockState=${state}`), writable: true, configurable: true});
beforeEach(() => {storage.clear(); resetQuantStateForTests(); setScenario('sample');});
const base = '/api/quant/local-quant/';
const entryBase = `${base}entries/local-momentum/`;
const invoke = async <T>(path: string, method = 'GET', body?: unknown, authorized = true): Promise<T> => {
    const request = new Request(`http://localhost${path}`, {method, headers: {...(authorized ? {Authorization: 'Token local-demo-token'} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    return await resolveQuantRoute(request) as T;
};

test('新的AI设计样例直接产出多内层方案，能力记录可读且准备前不执行', async () => {
    const {readProposal} = await import('../../components/Quant/experiments/proposal.ts');
    const {entry} = await invoke<{entry: QuantEntryDetail}>(base+'intake/','POST',{
        requestKey:'nested_planning_local_001',title:'多内层AI规划',language:'python',code:'# LOCAL_NESTED_PLANNING\nN=20\ndef factor(close): return close/close.shift(N)-1'});
    entry.runs[0].createdAt='2020-01-01T00:00:00Z';
    const ready=await invoke<QuantEntryDetail>(base+`entries/${entry.id}/`);
    const proposal=ready.reports![0].proposal!;
    const parsed=readProposal(proposal);
    assert.equal(parsed.config.walkForward!.version,2);assert.equal(parsed.config.walkForward!.innerFolds,3);
    assert.equal(parsed.config.walkForward!.warmupBars,25);
    assert.match(JSON.parse(proposal.dataJson).data_requirement,/133/);
    assert.equal(quantState().experiments.length,0);
    const stage=await invoke<import('../../types/api/quantWorkflow.ts').QuantStageEvidence>(base+`entries/${entry.id}/runs/${ready.runs[0].id}/workflow/plan/`);
    assert.equal(JSON.parse(stage.inputJson).planning_capabilities.maximum_attempts,32);
    assert.equal(JSON.parse(stage.inputJson).planning_capabilities.scope,'design_capability_not_market_data_execution_authority_or_validation');
    assert.equal((await invoke<Response>(base+`entries/${entry.id}/runs/${ready.runs[0].id}/workflow/plan/`,'GET',undefined,false)).status,403);
    setScenario('error');assert.equal((await invoke<Response>(base+`entries/${entry.id}/runs/${ready.runs[0].id}/workflow/plan/`)).status,503);
    setScenario('sample');assert.equal((await invoke<QuantEntryDetail>(base+`entries/${entry.id}/`)).reports![0].proposal!.dataJson,proposal.dataJson);
});

test('多内层参数复核 local 贯穿详情、AI解读和恢复，失败与未知保留',async()=>{
    const {readProposal}=await import('../../components/Quant/experiments/proposal.ts');
    const {readExperiment}=await import('../../components/Quant/experiments/readout.ts');
    const source=await invoke<{entry:QuantEntryDetail}>(base+'intake/','POST',{requestKey:'temporal_stability_source',title:'跨窗口参数复核',code:'N=20\ndef factor(close): return close/close.shift(N)-1'});
    source.entry.runs[0].createdAt='2020-01-01T00:00:00Z';
    const detail=await invoke<QuantEntryDetail>(base+`entries/${source.entry.id}/`),plan=readProposal(detail.reports![0].proposal!);
    plan.config.walkForward={version:2,mode:'expanding',folds:3,innerFolds:3,trainBars:40,validationBars:10,testBars:10,warmupBars:0};plan.config.maxCandidates=16;
    const rows=Array.from({length:180},(_,index)=>`${new Date(Date.UTC(2024,0,index+1)).toISOString()},100,102,99,101,500`);
    const dataset=await invoke<{id:string}>(base+'datasets/','POST',{name:'人工窗口行情',symbol:'SYNTHETIC',timeframe:'1d',timezone:'UTC',priceAdjustment:'',source:'人工样例',csvText:['timestamp,open,high,low,close,volume',...rows].join('\n')});
    type Experiment=import('../../types/api/quantExperiment.ts').QuantExperiment;
    const started=await invoke<Experiment>(base+'experiments/','POST',{requestKey:'temporal_stability_run01',name:'跨窗口人工实验',datasetId:dataset.id,seeds:plan.seeds,config:plan.config});
    assert.equal(readExperiment(started).temporalSensitivity!.planned_windows,9);
    assert.equal(readExperiment(started).temporalSensitivity!.status,'insufficient_comparison');
    quantState().experiments.find(row=>row.data.id===started.id)!.data.createdAt='2020-01-01T00:00:00Z';
    const completed=await invoke<Experiment>(base+`experiments/${started.id}/`),run=completed.reviews![0].run;
    assert.equal(readExperiment(completed).temporalSensitivity!.families[0].axes[0].windows.length,9);
    quantState().entries.find(row=>row.id===run.entryId)!.runs.find(row=>row.id===run.id)!.createdAt='2020-01-01T00:00:00Z';
    const reviewed=await invoke<Experiment>(base+`experiments/${started.id}/`);
    assert.match(reviewed.reviews![0].report!.markdown,/跨窗口参数复核/);
    assert.equal(reviewed.reviews![0].run.result.review!.temporalParameterReview!.plannedWindows,9);
    assert.equal((await invoke<{items:Experiment[]}>(base+'experiments/')).items.find(row=>row.id===started.id)!.temporalSensitivityJson,undefined);
    resetQuantStateForTests();assert.equal((await invoke<Experiment>(base+`experiments/${started.id}/`)).temporalSensitivityJson,reviewed.temporalSensitivityJson);
    assert.equal((await invoke<Response>(base+`experiments/${started.id}/`,'GET',undefined,false)).status,403);
    setScenario('empty');assert.equal((await invoke<{total:number}>(base+'experiments/')).total,0);
    setScenario('error');assert.equal((await invoke<Response>(base+`experiments/${started.id}/`)).status,503);
    setScenario('slow');assert.equal(readExperiment(await invoke<Experiment>(base+`experiments/${started.id}/`)).temporalSensitivity!.planned_windows,9);
});

test('同一来源重新分析保留两份原稿、完整参数和修订正文，可直接对照', async () => {
    const {entry} = await invoke<{entry: QuantEntryDetail}>(base + 'intake/', 'POST', {requestKey: 'report_comparison_local_001', title: '重复分析对照', language: 'python', code: 'N=20\ndef factor(close): return close / close.shift(N)-1'});
    entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const first = await invoke<QuantEntryDetail>(base + `entries/${entry.id}/`), original = first.reports![0];
    const next = await invoke<QuantAIRun>(base + `entries/${entry.id}/runs/`, 'POST', {kind: 'analyze', sourceId: original.sourceId, modelId: 'local-model', requestKey: 'report_comparison_rerun_001'});
    next.createdAt = '2020-01-01T00:00:00Z';
    const second = await invoke<QuantEntryDetail>(base + `entries/${entry.id}/`), current = second.reports![0];
    assert.notEqual(current.id, original.id); assert.equal(second.reports!.length, 2);
    const diff = compareReportRecords(original, current);
    assert.equal(diff.parametersAvailable, true); assert.equal(diff.total.delta, 0);
    assert.ok(diff.parameters.every(row => row.status === 'unchanged'));
    await invoke(base + `entries/${entry.id}/reports/${current.id}/`, 'PATCH', {markdown: '人工修订后的研究正文', expectedRevisionId: ''});
    const after = await invoke<QuantEntryDetail>(base + `entries/${entry.id}/`), revised = after.reports!.find(row => row.id === current.id)!;
    assert.equal(compareReportText(original.originalMarkdown, revised.originalMarkdown).status, 'identical');
    assert.equal(compareReportText(original.markdown, revised.markdown).status, 'compared');
    assert.equal(compareReportRecords(original, revised).total.delta, 0);
});

test('源码问题清单保留严重度、原文和人工修订边界，空清单不表示通过', async () => {
    const collect = async (marker: string, key: string) => {
        const {entry} = await invoke<{entry: QuantEntryDetail}>(base + 'intake/', 'POST', {requestKey: key, title: '源码问题清单演示', language: 'python',
            code: `# ${marker}\ndef factor(close): return close.shift(-1) / close - 1`});
        entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
        return invoke<QuantEntryDetail>(base + `entries/${entry.id}/`);
    };
    const entry = await collect('LOCAL_CRITICAL_FINDING', 'source_findings_critical_001'), report = entry.reports![0];
    assert.equal(entry.runs[0].workflow?.version, 16);
    assert.equal(report.data.sourceFindingsVersion, 1);
    assert.equal(report.data.sourceFindings?.[0].severity, 'critical');
    assert.equal(report.data.sourceFindings?.[0].evidence[0].quote, '# LOCAL_CRITICAL_FINDING');
    assert.ok(report.originalMarkdown.includes('问题清单与严重度'));
    const changed = await invoke<typeof report>(base + `entries/${entry.id}/reports/${report.id}/`, 'PATCH', {markdown: '人工删减正文', expectedRevisionId: ''});
    assert.equal(changed.markdown, '人工删减正文');
    assert.equal(changed.data.sourceFindings?.[0].severity, 'critical');
    assert.ok(changed.originalMarkdown.includes('问题清单与严重度'));
    const empty = await collect('LOCAL_NO_FINDINGS', 'source_findings_empty_001');
    assert.deepEqual(empty.reports![0].data.sourceFindings, []);
    assert.ok(empty.reports![0].markdown.includes('不证明源码没有缺陷'));
});

test('执行证据人工预览只读，显式样例覆盖相符、差异、部分和不支持，保留Decimal及负面样本', async () => {
    const {localExecutionSamples, localExecutionDefaultOptions} = await import('./platformEvidence.ts');
    const {readExecutionPreview} = await import('../../utils/quantPlatformEvidence.ts');
    const path = `${entryBase}feedback/preview/`;
    const input = {document: localExecutionSamples.json, executionAdapter: 'standard-execution-json-v1', executionOptionsJson: JSON.stringify(localExecutionDefaultOptions)};
    await invoke<QuantEntryDetail>(entryBase);
    const before = JSON.stringify(quantState()), saved = JSON.stringify([...storage.entries()]);
    const preview = await invoke<{previewJson: string}>(path, 'POST', input);
    const data = readExecutionPreview(preview.previewJson);
    assert.equal(data.local_demo, true); assert.equal(data.execution_accounting.status, 'reconciled');
    assert.equal(data.execution_accounting.metrics.net_profit.value, '-10'); assert.equal(data.execution_accounting.metrics.net_profit.ref, 'accounting:net_profit');
    assert.equal(data.execution_accounting.metrics.equity_drawdown_amount.value, null); assert.equal(data.execution_evidence.records[0].kind, 'trade');
    if (data.execution_evidence.records[0].kind === 'trade') assert.equal(data.execution_evidence.records[0].commission, null);
    assert.equal(data.execution_evidence.parameters[0].name, 'N'); assert.equal(data.execution_evidence.parameters[0].value, '20');
    assert.equal(data.execution_summary.method, 'execution-evidence-summary-v1'); assert.ok(data.execution_summary.refs.includes('accounting:net_profit'));
    assert.equal(JSON.stringify(quantState()), before); assert.equal(JSON.stringify([...storage.entries()]), saved);
    assert.equal((await invoke<{previewJson: string}>(path, 'POST', input)).previewJson, preview.previewJson);
    const mismatch = readExecutionPreview((await invoke<{previewJson: string}>(path, 'POST', {...input, document: localExecutionSamples.json.replace('LOCAL_EXECUTION_RECONCILED', 'LOCAL_EXECUTION_MISMATCH').replace('9990', '9980')})).previewJson);
    assert.equal(mismatch.execution_accounting.status, 'mismatch'); assert.equal(mismatch.execution_accounting.reconciliation.mismatches[0].ref, 'accounting:reconciliation:LOCAL_EXECUTION_MISMATCH');
    assert.ok(mismatch.execution_summary.refs.includes(mismatch.execution_accounting.reconciliation.mismatches[0].ref));
    const partial = readExecutionPreview((await invoke<{previewJson: string}>(path, 'POST', {...input, document: localExecutionSamples.html, executionAdapter: 'mt4-tester-html-v1'})).previewJson);
    assert.equal(partial.execution_evidence.parser_status, 'partial'); assert.equal(partial.execution_accounting.status, 'insufficient'); assert.equal(partial.execution_accounting.metrics.net_profit.value, null);
    const unmarked = readExecutionPreview((await invoke<{previewJson: string}>(path, 'POST', {...input, document: localExecutionSamples.json.replace('LOCAL_EXECUTION_RECONCILED', 'ordinary-record')})).previewJson);
    assert.equal(unmarked.execution_evidence.parser_status, 'unsupported'); assert.equal(unmarked.execution_accounting.status, 'insufficient'); assert.equal(unmarked.execution_accounting.metrics.net_profit.value, null);
    const csv = readExecutionPreview((await invoke<{previewJson: string}>(path, 'POST', {document: localExecutionSamples.csv, executionAdapter: 'standard-execution-csv-v1', executionOptionsJson: JSON.stringify({...localExecutionDefaultOptions, timezone: 'UTC', currency: 'USD', initial_balance: '10000', profit_basis: 'net', cash_flow_coverage: 'complete'})})).previewJson);
    assert.equal(csv.execution_accounting.status, 'reconciled'); assert.match(csv.execution_evidence.records[0].provenance.quote, /LOCAL_EXECUTION_RECONCILED/);
    const document = JSON.parse(localExecutionSamples.json);
    document.records = Array.from({length: 14}, (_, index) => ({...document.records[0], id: index === 0 ? 'LOCAL_EXECUTION_PARTIAL' : `event-${index}`, profit: index === 13 ? '-900' : '1'}));
    const negative = readExecutionPreview((await invoke<{previewJson: string}>(path, 'POST', {...input, document: JSON.stringify(document)})).previewJson);
    assert.equal(negative.execution_evidence.records.length, 14); assert.equal(negative.execution_summary.omitted_records, 2);
    assert.ok((negative.execution_summary.sample_records as {id: string}[]).some(row => row.id === 'event-13'));
    assert.equal((await invoke<Response>(path, 'POST', {...input, document: localExecutionSamples.json.replace('LOCAL_EXECUTION_RECONCILED', 'LOCAL_EXECUTION_INVALID')})).status, 400);
    assert.equal((await invoke<Response>(path, 'POST', {...input, document: '{broken'})).status, 400);
    assert.equal((await invoke<Response>(path, 'POST', {...input, executionOptionsJson: JSON.stringify({...localExecutionDefaultOptions, currency: 'EUR'})})).status, 400);
    assert.equal((await invoke<Response>(path, 'POST', {...input, executionOptionsJson: JSON.stringify({...localExecutionDefaultOptions, balance_tolerance: '1.0000000000000000001'})})).status, 400);
    assert.equal((await invoke<Response>(path, 'POST', {...input, document: '中'.repeat(350000)})).status, 400);
    document.records = Array.from({length: 2001}, (_, index) => ({...document.records[0], id: `event-${index}`}));
    assert.equal((await invoke<Response>(path, 'POST', {...input, document: JSON.stringify(document)})).status, 400);
    assert.equal((await invoke<Response>(path, 'POST', input, false)).status, 403);
    setScenario('slow'); assert.equal((await invoke<{previewJson: string}>(path, 'POST', input)).previewJson, preview.previewJson);
    setScenario('error'); assert.equal((await invoke<Response>(path, 'POST', input)).status, 503);
    setScenario('empty'); assert.equal((await invoke<Response>(path, 'POST', input)).status, 404);
});

test('v3执行反馈独立重新冻结原文与口径，报告和实验方案引用核算，不造四组旧quote或任务', async () => {
    const {localExecutionSamples, localExecutionDefaultOptions} = await import('./platformEvidence.ts');
    const {readExecutionPreview, readComputedExecution} = await import('../../utils/quantPlatformEvidence.ts');
    type Source = import('../../types/api/quant.ts').QuantSource;
    type Candidate = import('../../types/api/quant.ts').QuantFactorCandidate;
    const {entry} = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'execution_feedback_source01', title: '执行证据研究', code: 'input int N=20;', language: 'mql4'});
    entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; const path = `${base}entries/${entry.id}/`; const original = await invoke<QuantEntryDetail>(path);
    const target = original.sources![0], factor = (await invoke<{items: Candidate[]}>(`${base}factors/?entryId=${entry.id}`)).items[0];
    const document = JSON.parse(localExecutionSamples.json); document.records[0].id = 'LOCAL_EXECUTION_MISMATCH'; document.records[0].balance = '9980';
    document.parameters.push({name: 'Magic_Number_原名', value: '001.20', unit: ''});
    const input = {requestKey: 'execution_feedback_request01', title: '人工差异报告', targetSourceId: target.id, factorId: factor.id, experimentResultId: '',
        mode: 'backtest', documentFormat: 'json', document: JSON.stringify(document, null, 2), platform: '用户声明MT4', notes: '仅为人工样例', analyze: true, modelId: '', executionAdapter: 'standard-execution-json-v1', executionOptionsJson: JSON.stringify(localExecutionDefaultOptions)};
    const forged = {previewJson: '{"status":"reconciled","net_profit":"999999"}', executionPreviewJson: 'untrusted'};
    const saved = await invoke<{source: Source}>(path + 'feedback/', 'POST', {...input, ...forged});
    assert.equal(saved.source.payload.feedbackVersion, 3); assert.equal(saved.source.payload.document, input.document); assert.equal(saved.source.payload.platform, input.platform); assert.equal(saved.source.payload.notes, input.notes);
    const frozen = saved.source.payload.executionPreviewJson!, frozenData = readExecutionPreview(frozen);
    assert.equal(frozenData.execution_accounting.status, 'mismatch'); assert.equal(frozenData.execution_evidence.options.currency, ''); assert.equal(frozenData.execution_evidence.metadata.currency, 'USD');
    assert.equal(frozenData.execution_evidence.parameters[1].name, 'Magic_Number_原名'); assert.equal(frozenData.execution_evidence.parameters[1].value, '001.20'); assert.doesNotMatch(frozen, /999999/);
    const duplicate = await invoke<{source: Source}>(path + 'feedback/', 'POST', {...input, previewJson: 'changed forged preview', executionOptionsJson: JSON.stringify(localExecutionDefaultOptions, null, 2)});
    assert.equal(duplicate.source.id, saved.source.id);
    const owner = quantState().entries.find(row => row.id === entry.id)!, run = owner.runs.find(row => row.sourceId === saved.source.id)!;
    run.createdAt = '2020-01-01T00:00:00Z'; const completed = await invoke<QuantEntryDetail>(path);
    const result = run.result.feedback!, report = completed.reports!.find(row => row.runId === run.id)!;
    assert.deepEqual([result.reportedParameters, result.reportedMetrics, result.supportingEvidence, result.counterEvidence], [[], [], [], []]);
    assert.ok(result.executionAssessment!.findings.some(row => row.kind === 'counters' && row.refs.includes('accounting:reconciliation:LOCAL_EXECUTION_MISMATCH')));
    const computed = readComputedExecution(result.computedExecutionJson!);
    assert.equal(computed.execution_summary.accounting_hash, frozenData.execution_accounting.content_hash); assert.equal(computed.execution_parameter_comparison.rows[1].name, 'Magic_Number_原名');
    assert.match(report.originalMarkdown, /结构化执行证据与核算/); assert.match(report.originalMarkdown, /accounting:reconciliation:LOCAL_EXECUTION_MISMATCH/);
    assert.equal(report.data.computedExecutionJson, result.computedExecutionJson); assert.ok(report.proposal);
    const proposal = JSON.parse(report.proposal!.dataJson); assert.ok(proposal.evidence_refs.includes('accounting:reconciliation:LOCAL_EXECUTION_MISMATCH')); assert.equal(proposal.feedback_evidence_hash, result.evidenceHash);
    const runCount = owner.runs.length, experimentCount = quantState().experiments.length;
    resetQuantStateForTests(); const restored = await invoke<QuantEntryDetail>(path);
    assert.equal(restored.sources!.find(row => row.id === saved.source.id)!.payload.executionPreviewJson, frozen); assert.equal(restored.reports!.find(row => row.id === report.id)!.data.computedExecutionJson, result.computedExecutionJson);
    await invoke(path + 'feedback/', 'POST', input); assert.equal(restored.runs.length, runCount); assert.equal(quantState().experiments.length, experimentCount);
    assert.equal((await invoke<Response>(path + 'feedback/', 'POST', {...input, document: input.document + '\n'})).status, 409);
    assert.equal((await invoke<Response>(path + 'feedback/', 'POST', {...input, requestKey: 'execution_wrong_config01', mode: 'configuration'})).status, 400);
    assert.equal((await invoke<Response>(path + 'feedback/', 'POST', {...input, requestKey: 'execution_wrong_format01', documentFormat: 'csv'})).status, 400);
    const large = input.document + '\n' + ' '.repeat(65000);
    const largeSaved = await invoke<{source: Source}>(path + 'feedback/', 'POST', {...input, requestKey: 'execution_large_document01', document: large, analyze: false});
    assert.equal(largeSaved.source.payload.document, large); assert.equal((await invoke<Response>(path + 'feedback/', 'POST', {...input, executionAdapter: undefined, executionOptionsJson: undefined, requestKey: 'execution_old_limit01', document: large})).status, 400);
    const partial = await invoke<{source: Source}>(path + 'feedback/', 'POST', {...input, requestKey: 'execution_partial_case01', document: localExecutionSamples.html, documentFormat: 'html', executionAdapter: 'mt4-tester-html-v1'});
    const partialRun = quantState().entries.find(row => row.id === entry.id)!.runs.find(row => row.sourceId === partial.source.id)!; partialRun.createdAt = '2020-01-01T00:00:00Z'; await invoke(path);
    assert.ok(partialRun.result.feedback!.executionAssessment!.findings.some(row => row.kind === 'limitation'));
});

test('同一实现保存版本冻结完整来源并预览明确基线，历史捕获不回滚当前材料，预览只读可刷新', async () => {
    type Preview = import('../../types/api/quantSourceImpact.ts').QuantSourceImpactPreview;
    const {readSourceImpact} = await import('../../utils/quantSourceImpact.ts');
    const created = await invoke<QuantEntryDetail>(base + 'entries/', 'POST', {title: '同材料来源影响', kind: 'factor', content: '', tags: [], sourceUrl: ''});
    const path = `${base}entries/${created.id}/`;
    const oldCode = '# 本地 momentum 示例函数\ndef momentum(close, lookback=20):\n    return close.pct_change(lookback)\n';
    const implementation = await invoke<QuantImplementation>(path + 'implementations/', 'POST', {name: '稳定实现', language: 'python', languageVersion: '3.11', dependencies: 'pandas==2', parameters: 'lookback=20', code: oldCode, note: '原始版本'});
    const firstVersion = implementation.versions[0];
    const beforeAnalysis = await invoke<QuantEntryDetail>(path);
    const originalSource = beforeAnalysis.sources!.find(row => row.codeVersionId === firstVersion.id)!;
    assert.equal(originalSource.materialId, implementation.id); assert.equal(originalSource.materialCurrentSourceId, originalSource.id); assert.match(originalSource.contentHash!, /^local-demo-source-/);
    assert.equal(originalSource.payload.languageVersion, '3.11'); assert.equal(originalSource.payload.dependencies, 'pandas==2'); assert.equal(originalSource.payload.parameters, 'lookback=20'); assert.equal(originalSource.payload.note, '原始版本'); assert.equal(originalSource.payload.provenance, 'code_version');
    const baselineRun = await invoke<QuantAIRun>(path + 'runs/', 'POST', {kind: 'analyze', sourceId: originalSource.id, requestKey: 'impact_static_baseline01'});
    baselineRun.createdAt = '2020-01-01T00:00:00Z';
    const analyzed = await invoke<QuantEntryDetail>(path);
    const report = analyzed.reports!.find(row => row.runId === baselineRun.id)!;
    const originalPayload = JSON.stringify(originalSource.payload), originalReport = JSON.stringify(report);
    const nextCode = '# 开头新增说明\n# 本地 momentum 示例函数\ndef momentum(close, lookback=30):\n    return close / close.shift(lookback) - 1\n';
    const current = await invoke<QuantCodeVersion>(`${path}implementations/${implementation.id}/versions/`, 'POST', {code: nextCode, language: 'python', languageVersion: '3.12', dependencies: 'pandas==3', parameters: 'lookback=30', note: '修正公式', sourceVersionId: firstVersion.id});
    const updated = await invoke<QuantEntryDetail>(path);
    const target = updated.sources!.find(row => row.codeVersionId === current.id)!;
    assert.equal(target.materialId, originalSource.materialId); assert.equal(target.materialCurrentSourceId, target.id); assert.notEqual(target.contentHash, originalSource.contentHash);
    assert.equal(updated.sources!.find(row => row.id === originalSource.id)!.materialCurrentSourceId, target.id);
    assert.equal(JSON.stringify(updated.sources!.find(row => row.id === originalSource.id)!.payload), originalPayload);
    const stored = quantState().entries.find(row => row.id === created.id)!;
    const {captureMockVersion} = await import('./sourceSnapshots.ts');
    captureMockVersion(stored, stored.implementations[0], firstVersion);
    assert.equal(quantState().materialCurrentSources[implementation.id], target.id);
    const url = `${path}source-impact/?sourceId=${target.id}&reportId=${report.id}`;
    const stateBefore = JSON.stringify(quantState()), savedBefore = JSON.stringify([...storage.entries()]);
    const response = await invoke<{impactJson: string}>(url), result = readSourceImpact(response.impactJson, {sourceId: target.id, reportId: report.id, baselineSourceId: originalSource.id});
    assert.equal(result.relationship, 'same_material'); assert.equal(result.baseline.report_id, report.id); assert.equal(result.target.source_hash, target.contentHash); assert.equal(result.baseline.source_hash, originalSource.contentHash);
    assert.equal(result.local_demo, true); assert.deepEqual(result.impact.recommendation.can_reuse_stages, false); assert.equal(result.impact.recommendation.start_stage, 'normalize');
    assert.ok(result.impact.changed_fields.includes('code') && result.impact.changed_fields.includes('dependencies') && result.impact.changed_fields.includes('language_version'));
    assert.equal(result.impact.code.hunks[0].old_text, oldCode); assert.equal(result.impact.code.hunks[0].new_text, nextCode); assert.equal(result.impact.code.hunks[0].old_truncated, false);
    assert.equal(result.impact.parameters[0].quotes[0].quote, '本地 momentum 示例函数'); assert.equal(result.impact.parameters[0].quotes[0].status, 'moved');
    assert.equal(result.impact.factors[0].quotes[0].quote, oldCode); assert.equal(result.impact.factors[0].quotes[0].status, 'missing');
    assert.equal((await invoke<{impactJson: string}>(url)).impactJson, response.impactJson); assert.equal(JSON.stringify(quantState()), stateBefore); assert.equal(JSON.stringify([...storage.entries()]), savedBefore);
    assert.equal(JSON.stringify(stored.reports!.find(row => row.id === report.id)), originalReport);
    resetQuantStateForTests(); assert.equal((await invoke<{impactJson: string}>(url)).impactJson, response.impactJson);
    const reopened = await invoke<QuantEntryDetail>(path); assert.equal(reopened.sources!.find(row => row.id === originalSource.id)!.materialCurrentSourceId, target.id);
    const unchanged = JSON.parse((await invoke<{impactJson: string}>(`${path}source-impact/?sourceId=${originalSource.id}&reportId=${report.id}`)).impactJson) as Preview;
    assert.equal(unchanged.relationship, 'same_source'); assert.equal(unchanged.impact.status, 'identical'); assert.equal(unchanged.impact.recommendation.can_reuse_stages, false);
    const restoredVersion = await invoke<QuantCodeVersion>(`${path}implementations/${implementation.id}/versions/`, 'POST', {code: firstVersion.code, languageVersion: firstVersion.languageVersion, dependencies: firstVersion.dependencies, parameters: firstVersion.parameters, note: '恢复旧版为新版本', sourceVersionId: firstVersion.id});
    const afterRestore = await invoke<QuantEntryDetail>(path);
    const restoredSource = afterRestore.sources!.find(row => row.codeVersionId === restoredVersion.id)!;
    assert.equal(afterRestore.sources!.find(row => row.id === originalSource.id)!.materialCurrentSourceId, restoredSource.id); assert.equal(restoredSource.payload.code, oldCode); assert.notEqual(restoredSource.id, originalSource.id);
    setScenario('slow'); assert.equal((await invoke<{impactJson: string}>(url)).impactJson, response.impactJson);
    setScenario('error'); assert.equal((await invoke<Response>(url)).status, 503);
    setScenario('empty'); assert.equal((await invoke<Response>(url)).status, 404);
});

test('来源影响不猜同名实现或最新报告，显式异材料参考与静态基线权限边界', async () => {
    type Preview = import('../../types/api/quantSourceImpact.ts').QuantSourceImpactPreview;
    const {entry} = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'impact_intake_reference01', title: '同名材料', code: 'def signal(close): return close', language: 'python'});
    entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; const baseline = await invoke<QuantEntryDetail>(`${base}entries/${entry.id}/`);
    const source = baseline.sources![0], report = baseline.reports![0], path = `${base}entries/${entry.id}/`;
    const implementation = await invoke<QuantImplementation>(path + 'implementations/', 'POST', {name: '同名材料', language: 'python', languageVersion: '3.11', code: 'def signal(close): return close', note: '', dependencies: '', parameters: ''});
    const updated = await invoke<QuantEntryDetail>(path), target = updated.sources!.find(row => row.codeVersionId === implementation.currentVersionId)!;
    const currentIntake = updated.sources!.find(row => row.id === source.id)!;
    assert.equal(currentIntake.materialCurrentSourceId, source.id); assert.notEqual(target.materialId, source.materialId);
    const result = JSON.parse((await invoke<{impactJson: string}>(`${path}source-impact/?sourceId=${target.id}&reportId=${report.id}`)).impactJson) as Preview;
    assert.equal(result.relationship, 'different_material'); assert.equal(result.impact.recommendation.action, 'full_reanalysis');
    assert.equal((await invoke<Response>(`${path}source-impact/?sourceId=${target.id}`)).status, 400);
    assert.equal((await invoke<Response>(`${path}source-impact/?reportId=${report.id}`)).status, 400);
    assert.equal((await invoke<Response>(`${path}source-impact/?sourceId=missing&reportId=${report.id}`)).status, 404);
    assert.equal((await invoke<Response>(`${path}source-impact/?sourceId=${target.id}&reportId=missing`)).status, 404);
    assert.equal((await invoke<Response>(`${entryBase}source-impact/?sourceId=${target.id}&reportId=${report.id}`)).status, 404);
    assert.equal((await invoke<Response>(`${path}source-impact/?sourceId=${target.id}&reportId=${report.id}`, 'GET', undefined, false)).status, 403);
    assert.equal((await invoke<Response>(`${path}source-impact/?sourceId=${target.id}&reportId=${report.id}`, 'POST', {})).status, 405);
    const feedback = await invoke<{source: import('../../types/api/quant.ts').QuantSource}>(path + 'feedback/', 'POST', {requestKey: 'impact_feedback_static01', title: '外部反馈', targetSourceId: source.id, factorId: '', experimentResultId: '', mode: 'backtest', documentFormat: 'text', document: 'N=20 net=-3%', platform: 'Python', notes: '', analyze: true});
    const stateEntry = quantState().entries.find(row => row.id === entry.id)!;
    stateEntry.runs.find(row => row.sourceId === feedback.source.id)!.createdAt = '2020-01-01T00:00:00Z'; await invoke(path);
    const feedbackReport = stateEntry.reports!.find(row => row.sourceId === feedback.source.id)!;
    assert.equal((await invoke<Response>(`${path}source-impact/?sourceId=${target.id}&reportId=${feedbackReport.id}`)).status, 400);
    assert.equal((await invoke<Response>(`${path}source-impact/?sourceId=${feedback.source.id}&reportId=${report.id}`)).status, 400);
    const frozen = JSON.stringify(stateEntry.reports!.find(row => row.id === report.id));
    const storageKey = 'odoc:local:quant:v1:sample', old = JSON.parse(storage.get(storageKey)!) as Record<string, unknown>;
    delete old.materialCurrentSources; storage.set(storageKey, JSON.stringify(old)); resetQuantStateForTests();
    const restored = await invoke<QuantEntryDetail>(path);
    assert.equal(restored.sources!.find(row => row.id === target.id)!.materialCurrentSourceId, target.id); assert.equal(restored.sources!.find(row => row.id === source.id)!.materialCurrentSourceId, source.id);
    assert.equal(JSON.stringify(restored.reports!.find(row => row.id === report.id)), frozen);
});

test('旧schema1影响预览不伪造参数与因子，过长差异保留真实行数和明确截断标志', async () => {
    const {readSourceImpact} = await import('../../utils/quantSourceImpact.ts');
    const {entry} = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'impact_legacy_reference01', code: 'def signal(close):\n    return close\n', language: 'python'});
    entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; const path = `${base}entries/${entry.id}/`;
    const current = await invoke<QuantEntryDetail>(path), baseline = current.sources![0];
    // Reads a historical report fixture through the same saved-state path used on refresh.
    const key = 'odoc:local:quant:v1:sample', saved = JSON.parse(storage.get(key)!) as {entries: QuantEntryDetail[]};
    const owner = saved.entries.find(row => row.id === entry.id)!;
    const legacy = {...owner.reports![0], id: 'local-legacy-explanation', schemaVersion: 1, data: {title: '旧版代码解释', format: 'legacy_explanation'}};
    owner.reports!.push(legacy); storage.set(key, JSON.stringify(saved)); resetQuantStateForTests();
    const longCode = '# 明确截断的本地长文本\n' + '# padding\n'.repeat(1200);
    const implementation = await invoke<QuantImplementation>(path + 'implementations/', 'POST', {name: '长文本新材料', language: 'python', code: longCode, languageVersion: '', dependencies: '', parameters: '', note: ''});
    const updated = await invoke<QuantEntryDetail>(path), target = updated.sources!.find(row => row.codeVersionId === implementation.currentVersionId)!;
    const before = JSON.stringify(quantState());
    const result = readSourceImpact((await invoke<{impactJson: string}>(`${path}source-impact/?sourceId=${target.id}&reportId=${legacy.id}`)).impactJson);
    assert.equal(result.baseline.source_id, baseline.id); assert.equal(result.impact.status, 'limited'); assert.equal(result.impact.code.status, 'limited');
    assert.equal(result.impact.code.new_line_count, 1201); assert.equal(result.impact.code.hunks[0].new_truncated, true); assert.equal(result.impact.code.hunks[0].new_text.length, 8000);
    assert.equal(result.impact.code.hunks[0].old_truncated, false); assert.deepEqual(result.impact.parameters, []); assert.deepEqual(result.impact.factors, []);
    assert.equal(result.impact.recommendation.can_reuse_stages, false); assert.equal(JSON.stringify(quantState()), before);
});

test('显式人工对照冻结实际参数与完整证据，重复请求可刷新且不执行历史行情', async () => {
    const {readComparison} = await import('../../utils/quantComparison.ts');
    type Candidate = import('../../types/api/quant.ts').QuantFactorCandidate;
    type Comparison = import('../../types/api/quantComparison.ts').QuantComparison;
    type Input = import('../../types/api/quantComparison.ts').QuantComparisonInput;
    const collect = async (key: string, marker: string) => {
        const {entry} = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: key, title: key, code: `# ${marker}\n# LOCAL_PARAMETER_DOMAIN\nclose.pct_change(20)`, language: 'python'});
        entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; await invoke(`${base}entries/${entry.id}/`);
        return (await invoke<{items: Candidate[]}>(`${base}factors/?entryId=${entry.id}`)).items[0];
    };
    const left = await collect('comparison_source_A_01', 'LOCAL_COMPARISON_PASS'), right = await collect('comparison_source_B_01', 'LOCAL_COMPARISON_PASS');
    const csvText = 'timestamp,open,high,low,close,volume\n' + Array.from({length: 90}, (_, index) => `${new Date(Date.UTC(2024, 0, index + 1)).toISOString()},100,103,99,102,1000`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: '人工对照行情', symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', source: '人工构造', priceAdjustment: '不适用', csvText});
    const side = (candidate: Candidate, value: number) => ({candidateId: candidate.id, bindings: [{name: 'close', column: 'close' as const}], parameters: [{name: 'lookback', value}]});
    const input: Input = {requestKey: 'comparison_frozen_input01', name: '冻结对照', datasetId: dataset.id, left: side(left, 15), right: side(right, 25), policy: {absoluteTolerance: 1e-8, relativeTolerance: 1e-8, warmupBars: 20}};
    const first = await invoke<Comparison>(`${base}comparisons/`, 'POST', input);
    const parsed = readComparison(first);
    assert.equal(parsed.result.status, 'pass'); assert.deepEqual(parsed.plan.left.parameters, {lookback: 15}); assert.deepEqual(parsed.plan.right.parameters, {lookback: 25});
    assert.equal(parsed.result.counts.total_rows, 90); assert.equal(parsed.result.counts.warmup_rows, 20); assert.equal(parsed.result.counts.compared_rows, 70);
    assert.equal(parsed.result.comparison_start, '2024-01-21T00:00:00.000Z'); assert.equal(parsed.result.local_demo, true);
    assert.match(parsed.result.limitations.join(' '), /人工.*未计算历史行情/);
    assert.match(parsed.plan.left.source_hash, /^local-demo/); assert.match(parsed.plan.right.report_hash, /^local-demo/);
    assert.equal(JSON.parse(first.datasetJson!).row_count, 90);
    assert.equal((await invoke<Comparison>(`${base}comparisons/`, 'POST', input)).id, first.id);
    assert.equal((await invoke<Response>(`${base}comparisons/`, 'POST', {...input, name: '不同内容'})).status, 409);
    const original = JSON.stringify([left.data, right.data]);
    await invoke(`${base}factors/${left.id}/`, 'PATCH', {expectedRevisionId: left.currentRevisionId, data: {...left.curation, name: '新整理名称', aliases: ['旧别名']}});
    assert.equal((await invoke<Comparison>(`${base}comparisons/${first.id}/`)).planJson, first.planJson);
    assert.equal(JSON.stringify([(await invoke<Candidate>(`${base}factors/${left.id}/`)).data, (await invoke<Candidate>(`${base}factors/${right.id}/`)).data]), original);
    const listed = await invoke<{total: number; items: Comparison[]}>(`${base}comparisons/?factorId=${right.id}`);
    assert.equal(listed.total, 1); assert.equal(listed.items[0].planJson, undefined); assert.equal(listed.items[0].datasetJson, undefined);
    resetQuantStateForTests(); const restored = await invoke<Comparison>(`${base}comparisons/${first.id}/`);
    assert.equal(restored.planJson, first.planJson); assert.equal(restored.resultJson, first.resultJson); assert.equal(restored.datasetJson, first.datasetJson);
    assert.equal((await invoke<Response>(`${base}comparisons/`, 'POST', {...input, requestKey: 'comparison_bad_parameter', left: side(left, 7)})).status, 400);
    assert.equal((await invoke<Response>(`${base}comparisons/`, 'POST', {...input, requestKey: 'comparison_same_candidate', right: input.left})).status, 400);
    assert.equal((await invoke<Response>(`${base}comparisons/`, 'POST', {...input, requestKey: 'comparison_bad_tolerance', policy: {...input.policy, relativeTolerance: .01}})).status, 400);
    assert.equal((await invoke<Response>(`${base}comparisons/`, 'POST', {...input, requestKey: 'comparison_bad_warmup', policy: {...input.policy, warmupBars: 61}})).status, 400);
    assert.equal((await invoke<Response>(`${base}comparisons/`, 'GET', undefined, false)).status, 403);
    setScenario('slow'); assert.equal((await invoke<Comparison>(`${base}comparisons/${first.id}/`)).id, first.id);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}comparisons/`)).status, 503);
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}comparisons/`)).total, 0); assert.equal((await invoke<{total: number}>(`${base}factor-merges/`)).total, 0);
});

test('合并仅接受直接通过对照，桥接撤销拆组且保留原候选、证据、别名和历史', async () => {
    type Candidate = import('../../types/api/quant.ts').QuantFactorCandidate;
    type Comparison = import('../../types/api/quantComparison.ts').QuantComparison;
    type Merge = import('../../types/api/quantComparison.ts').QuantFactorMerge;
    type Group = import('../../types/api/quantComparison.ts').QuantFactorMergeList;
    const collect = async (key: string, marker: string) => {
        const {entry} = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: key, title: key, code: `# ${marker}\nclose.pct_change(20)`, language: 'python'});
        entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; await invoke(`${base}entries/${entry.id}/`);
        return (await invoke<{items: Candidate[]}>(`${base}factors/?entryId=${entry.id}`)).items[0];
    };
    const [a, b, c, d, e] = await Promise.all([collect('comparison_merge_A_01', 'LOCAL_COMPARISON_PASS'), collect('comparison_merge_B_01', 'LOCAL_COMPARISON_PASS'), collect('comparison_merge_C_01', 'LOCAL_COMPARISON_PASS'), collect('comparison_merge_D_01', 'LOCAL_COMPARISON_FAIL'), collect('comparison_merge_E_01', 'LOCAL_COMPARISON_FULLY_MISSING')]);
    const csvText = 'timestamp,open,high,low,close\n' + Array.from({length: 60}, (_, index) => `${new Date(Date.UTC(2024, 0, index + 1)).toISOString()},100,103,99,102`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: '人工合并行情', symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', source: '人工构造', priceAdjustment: '不适用', csvText});
    const side = (candidate: Candidate) => ({candidateId: candidate.id, bindings: [{name: 'close', column: 'close'}], parameters: [{name: 'lookback', value: 20}]});
    const compare = (left: Candidate, right: Candidate, requestKey: string) => invoke<Comparison>(`${base}comparisons/`, 'POST', {requestKey, name: '人工对照', datasetId: dataset.id, left: side(left), right: side(right), policy: {absoluteTolerance: 0, relativeTolerance: 0, warmupBars: 20}});
    const ab = await compare(a, b, 'comparison_merge_AB_01'), bc = await compare(b, c, 'comparison_merge_BC_01'), ad = await compare(a, d, 'comparison_merge_AD_01'), ae = await compare(a, e, 'comparison_merge_AE_01');
    assert.equal(ad.verdict, 'fail'); assert.equal(ae.verdict, 'inconclusive');
    assert.equal(JSON.parse(ae.resultJson!).counts.both_missing, 40); assert.equal(JSON.parse(ae.resultJson!).counts.common_valid, 0);
    const make = (comparisonId: string, requestKey: string) => ({requestKey, comparisonId, name: '可撤销组', reason: '人工确认固定样本证据'});
    assert.equal((await invoke<Response>(`${base}factor-merges/`, 'POST', make(ad.id, 'merge_failed_evidence_01'))).status, 400);
    assert.equal((await invoke<Response>(`${base}factor-merges/`, 'POST', make(ae.id, 'merge_missing_evidence_01'))).status, 400);
    await invoke(`${base}factors/${b.id}/`, 'PATCH', {expectedRevisionId: b.currentRevisionId, data: {...b.curation, name: '冻结旧名', aliases: ['冻结别名']}});
    const originalA = await invoke<Candidate>(`${base}factors/${a.id}/`), originalC = await invoke<Candidate>(`${base}factors/${c.id}/`);
    const edge1 = await invoke<Merge>(`${base}factor-merges/`, 'POST', make(ab.id, 'merge_direct_AB_01'));
    const edge2 = await invoke<Merge>(`${base}factor-merges/`, 'POST', make(bc.id, 'merge_direct_BC_01'));
    assert.equal((await invoke<Merge>(`${base}factor-merges/`, 'POST', make(ab.id, 'merge_direct_AB_01'))).id, edge1.id);
    assert.equal((await invoke<Response>(`${base}factor-merges/`, 'POST', {...make(ab.id, 'merge_direct_AB_01'), name: '冲突'})).status, 409);
    assert.equal((await invoke<Response>(`${base}factor-merges/`, 'POST', make(ab.id, 'merge_duplicate_edge_01'))).status, 409);
    const bNow = await invoke<Candidate>(`${base}factors/${b.id}/`);
    await invoke(`${base}factors/${b.id}/`, 'PATCH', {expectedRevisionId: bNow.currentRevisionId, data: {...bNow.curation, name: '当前名', aliases: ['当前别名'], family: 'trend'}});
    const group = (await invoke<Group>(`${base}factor-merges/?factorId=${a.id}`)).group!;
    assert.deepEqual(group.memberIds, [a.id, b.id, c.id].sort()); assert.equal(group.id, `merged:${group.memberIds[0]}`);
    assert.ok(group.names.includes('冻结旧名') && group.names.includes('当前名')); assert.deepEqual(group.aliases, ['冻结别名', '当前别名'].sort());
    type GroupedList = {total: number; occurrenceTotal: number; items: Candidate[]};
    for (const q of ['可撤销组', '冻结别名', '当前名']) {
        const result = await invoke<GroupedList>(`${base}factors/?groupBy=merged&q=${encodeURIComponent(q)}`);
        assert.equal(result.total, 1); assert.equal(result.occurrenceTotal, 3); assert.equal(result.items[0].occurrenceCount, 3);
        assert.deepEqual(result.items[0].mergedGroup, group);
    }
    const onlyOneMemberMatches = await invoke<GroupedList>(`${base}factors/?groupBy=merged&family=trend&q=${encodeURIComponent('冻结别名')}&entryId=${b.entryId}`);
    assert.equal(onlyOneMemberMatches.total, 1); assert.equal(onlyOneMemberMatches.occurrenceTotal, 3); assert.equal(onlyOneMemberMatches.items[0].occurrenceCount, 3);
    assert.deepEqual(onlyOneMemberMatches.items[0].mergedGroup!.memberIds, [a.id, b.id, c.id].sort());
    const occurrences = await invoke<{total: number}>(`${base}factors/${a.id}/occurrences/?groupBy=merged`); assert.equal(occurrences.total, 3);
    const graph = await invoke<import('../../types/api/quantGraph.ts').QuantGraph>(`${base}graph/?candidateId=${c.id}`);
    assert.ok(graph.edges.some(row => row.kind === 'sample_equivalent' && row.comparisonId === bc.id));
    assert.ok(graph.edges.some(row => row.kind === 'merged_group' && row.mergeId === edge2.id));
    assert.ok(!graph.edges.some(row => row.kind === 'sample_equivalent' && [row.from, row.to].includes(`factor:${a.id}`)));
    const withdrawal = {requestKey: 'withdraw_merge_BC_01', reason: '拆开桥接关系'};
    const removed = await invoke<Merge>(`${base}factor-merges/${edge2.id}/withdraw/`, 'POST', withdrawal);
    assert.equal(removed.active, false); assert.equal((await invoke<Merge>(`${base}factor-merges/${edge2.id}/withdraw/`, 'POST', withdrawal)).withdrawal!.id, removed.withdrawal!.id);
    assert.equal((await invoke<Response>(`${base}factor-merges/${edge1.id}/withdraw/`, 'POST', withdrawal)).status, 409);
    assert.equal((await invoke<Response>(`${base}factor-merges/${edge2.id}/withdraw/`, 'POST', {...withdrawal, reason: '改变理由'})).status, 409);
    assert.deepEqual((await invoke<Group>(`${base}factor-merges/?factorId=${c.id}`)).group!.memberIds, [c.id]);
    assert.deepEqual((await invoke<Group>(`${base}factor-merges/?factorId=${a.id}`)).group!.memberIds, [a.id, b.id].sort());
    const graphAfter = await invoke<import('../../types/api/quantGraph.ts').QuantGraph>(`${base}graph/?candidateId=${c.id}`);
    assert.ok(graphAfter.edges.some(row => row.kind === 'sample_equivalent' && row.comparisonId === bc.id)); assert.ok(!graphAfter.edges.some(row => row.kind === 'merged_group' && row.mergeId === edge2.id));
    assert.deepEqual(await invoke<Candidate>(`${base}factors/${a.id}/`), originalA); assert.deepEqual(await invoke<Candidate>(`${base}factors/${c.id}/`), originalC);
    assert.equal((await invoke<Comparison>(`${base}comparisons/${bc.id}/`)).resultJson, bc.resultJson);
    resetQuantStateForTests(); assert.equal((await invoke<Group>(`${base}factor-merges/?factorId=${c.id}`)).items.find(row => row.id === edge2.id)!.active, false);
    assert.equal((await invoke<{total: number}>(`${base}comparisons/`)).total, 4);
    quantState().collections.push({...quantState().collections[0], collId: 'other-quant', type: 'quant'});
    assert.equal((await invoke<Response>(`/api/quant/other-quant/comparisons/${ab.id}/`)).status, 404);
    assert.equal((await invoke<Response>(`/api/quant/other-quant/factor-merges/${edge1.id}/withdraw/`, 'POST', {requestKey: 'withdraw_outside_scope01', reason: ''})).status, 404);
    assert.equal((await invoke<Response>(`/api/quant/other-quant/comparisons/`, 'POST', {requestKey: 'comparison_outside_scope', name: '跨文集拒绝', datasetId: dataset.id, left: side(a), right: side(b), policy: {absoluteTolerance: 0, relativeTolerance: 0, warmupBars: 0}})).status, 400);
    setScenario('slow'); assert.equal((await invoke<Group>(`${base}factor-merges/?factorId=${c.id}`)).items.find(row => row.id === edge2.id)!.active, false);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}factor-merges/`)).status, 503);
});

test('原文或表达式相同不产生通过证据，超时未知数不造零，旧local状态兼容新增集合', async () => {
    const {readComparison} = await import('../../utils/quantComparison.ts');
    type Candidate = import('../../types/api/quant.ts').QuantFactorCandidate;
    type Comparison = import('../../types/api/quantComparison.ts').QuantComparison;
    const collect = async (key: string, code: string) => {
        const {entry} = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: key, title: key, code, language: 'python'});
        entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; await invoke(`${base}entries/${entry.id}/`);
        return (await invoke<{items: Candidate[]}>(`${base}factors/?entryId=${entry.id}`)).items[0];
    };
    const a = await collect('comparison_unmarked_A01', 'close.pct_change(20)'), b = await collect('comparison_unmarked_B01', 'close.pct_change(20)');
    const timeout = await collect('comparison_timeout_C01', '# LOCAL_COMPARISON_TIMEOUT\nclose.pct_change(20)');
    assert.equal(a.fingerprints.raw, b.fingerprints.raw); assert.equal(a.fingerprints.expression, b.fingerprints.expression);
    const csvText = 'open,date,high,low,close\n' + Array.from({length: 60}, (_, index) => `100,${new Date(Date.UTC(2024, 0, index + 1)).toISOString()},103,99,102`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: '显式时间列', symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', source: '', priceAdjustment: '', csvText});
    const side = (candidate: Candidate) => ({candidateId: candidate.id, bindings: [{name: 'close', column: 'close'}], parameters: [{name: 'lookback', value: 20}]});
    const input = {requestKey: 'comparison_unmarked_01', name: '未知输出', datasetId: dataset.id, left: side(a), right: side(b), policy: {absoluteTolerance: 0, relativeTolerance: 0, warmupBars: 20}};
    const unknown = await invoke<Comparison>(`${base}comparisons/`, 'POST', input);
    assert.equal(unknown.verdict, 'inconclusive'); assert.equal(JSON.parse(unknown.resultJson!).counts.common_valid, 0);
    const interrupted = await invoke<Comparison>(`${base}comparisons/`, 'POST', {...input, requestKey: 'comparison_timeout_01', right: side(timeout)});
    const result = readComparison(interrupted).result;
    assert.equal(result.evaluation_status, 'timed_out'); assert.equal(result.counts.compared_rows, 40); assert.equal(result.counts.value_mismatches, null); assert.equal(result.counts.both_missing, null);
    assert.equal(result.output_hashes.left, ''); assert.equal(result.max_abs_error, null); assert.equal(result.comparison_start, '2024-01-21T00:00:00.000Z');
    const report = quantState().entries.find(row => row.id === b.entryId)!.reports!.find(row => row.id === b.reportId)!;
    const originalExpression = report.data.factors![0].expression;
    report.data.factors![0].expression = {op: 'eval', args: []};
    assert.equal((await invoke<Response>(`${base}comparisons/`, 'POST', {...input, requestKey: 'comparison_invalid_ir_01'})).status, 400);
    report.data.factors![0].expression = originalExpression;
    assert.equal((await invoke<Response>(`${base}comparisons/`, 'POST', {...input, requestKey: 'comparison_invalid_win_01', left: {...side(a), parameters: [{name: 'lookback', value: 0}]}})).status, 400);
    // Simulates a pre-feature saved state; existing reports and experiments are not migrated or rewritten.
    const key = 'odoc:local:quant:v1:sample';
    const stored = JSON.parse(storage.get(key)!) as Record<string, unknown>;
    const frozenEntries = JSON.stringify(stored.entries);
    delete stored.comparisons; delete stored.factorMerges; storage.set(key, JSON.stringify(stored)); resetQuantStateForTests();
    assert.deepEqual(quantState().comparisons, []); assert.deepEqual(quantState().factorMerges, []); assert.equal(JSON.stringify(quantState().entries), frozenEntries);
    assert.equal((await invoke<{total: number}>(`${base}comparisons/`)).total, 0);
});

test('跨来源历史记忆冻结实验失败和反馈声明，模型判断引用可刷新且尊重文集', async () => {
    const {readResearchMemory, researchMemoryReference} = await import('../../utils/quantResearchMemory.ts');
    const {buildSeed, initialSeed} = await import('../../components/Quant/experiments/plan.ts');
    type Factor = import('../../types/api/quant.ts').QuantFactorCandidate;
    type Experiment = import('../../types/api/quantExperiment.ts').QuantExperiment;
    const collect = async (key: string) => {
        const {entry} = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: key, title: key, code: 'def momentum(close): return close.pct_change(20)', language: 'python'});
        entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
        await invoke(`${base}entries/${entry.id}/`);
        return entry;
    };
    const earlier = await collect('memory_history_source_01'), current = await collect('memory_current_source_01');
    const factors = (await invoke<{items: Factor[]}>(`${base}factors/?groupBy=none`)).items;
    const oldFactor = factors.find(row => row.entryId === earlier.id)!;
    const currentFactor = factors.find(row => row.entryId === current.id)!;
    const csvText = 'timestamp,open,high,low,close,volume\n' + Array.from({length: 90}, (_, index) => `${new Date(Date.UTC(2024, 0, index + 1)).toISOString()},100,102,99,101,1000`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Memory demo', csvText, symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: '人工样例'});
    const historical = await invoke<Experiment>(`${base}experiments/`, 'POST', {requestKey: 'memory_historical_test_01', name: '历史失败条件 · 人工样例', datasetId: dataset.id,
        seeds: [buildSeed(oldFactor, initialSeed(oldFactor), true)], config: {seed: 42, maxCandidates: 4, generations: 2, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 30}});
    quantState().experiments.find(row => row.data.id === historical.id)!.data.createdAt = '2024-01-01T00:00:00Z';
    await invoke(`${base}experiments/${historical.id}/`);
    const oldFeedback = await invoke<{source: import('../../types/api/quant.ts').QuantSource}>(`${base}entries/${earlier.id}/feedback/`, 'POST', {
        requestKey: 'memory_historical_feedback', title: '旧反馈 · 未独立验证', targetSourceId: oldFactor.sourceId, factorId: oldFactor.id, experimentResultId: '',
        mode: 'paper', documentFormat: 'text', document: 'N=20; ' + '原文'.repeat(2500) + '完整反馈末尾', platform: 'Pine', notes: '', analyze: true, modelId: ''});
    oldFeedback.source.createdAt = '2024-01-01T00:00:00Z';
    const historicalFeedbackRun = earlier.runs.find(row => row.sourceId === oldFeedback.source.id)!;
    historicalFeedbackRun.createdAt = '2020-01-01T00:00:00Z';
    await invoke(`${base}entries/${earlier.id}/`);
    historicalFeedbackRun.result.feedback!.counterEvidence.push({claim: '模型历史判断，不能代替原文极性', quote: '人工样例'});
    const hugeFeedback = await invoke<{source: import('../../types/api/quant.ts').QuantSource}>(`${base}entries/${earlier.id}/feedback/`, 'POST', {
        requestKey: 'memory_oversized_feedback', title: '超长反馈应整条省略', targetSourceId: oldFactor.sourceId, factorId: oldFactor.id, experimentResultId: '',
        mode: 'paper', documentFormat: 'text', document: '原'.repeat(33000) + '超长原始末尾', platform: 'Pine', notes: '', analyze: false, modelId: ''});
    hugeFeedback.source.createdAt = '2024-01-01T00:00:00Z';
    const other = structuredClone(earlier); other.id = 'memory-other-collection'; other.collId = 'private-other';
    other.sources!.filter(row => row.payload.provenance === 'external_feedback').forEach(row => row.id = 'private-feedback-do-not-include');
    quantState().entries.push(other);
    const started = await invoke<Experiment>(`${base}experiments/`, 'POST', {requestKey: 'memory_current_test_01', name: '当前复核 · 人工样例', datasetId: dataset.id,
        seeds: [buildSeed(currentFactor, initialSeed(currentFactor), true)], config: {seed: 42, maxCandidates: 4, generations: 2, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 30}});
    quantState().experiments.find(row => row.data.id === started.id)!.data.createdAt = '2024-02-01T00:00:00Z';
    const reviewing = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    const run = current.runs.find(row => row.experimentResultId === reviewing.reviewContext!.experimentResultId)!;
    const frozen = run.researchMemoryJson!, memory = readResearchMemory(frozen)!;
    const {freezeMockResearchMemory} = await import('./researchMemory.ts');
    const legacy = {...run, researchMemoryJson: '{"version":99,"legacy_frozen":true}'};
    freezeMockResearchMemory(legacy, current);
    assert.equal(legacy.researchMemoryJson, '{"version":99,"legacy_frozen":true}');
    assert.throws(() => readResearchMemory(legacy.researchMemoryJson), /无法读取/);
    assert.equal(run.status, 'pending');
    assert.ok(memory.items.some(row => row.id === `result-${historical.id}` && row.hasNegativeEvidence === true));
    assert.ok(memory.items.some(row => row.id === oldFeedback.source.id && row.hasNegativeEvidence === null));
    const feedbackEvidence = memory.items.find(row => row.id === oldFeedback.source.id)!.evidence.feedback as Record<string, unknown>;
    assert.equal(feedbackEvidence.document, oldFeedback.source.payload.document);
    assert.ok(!memory.items.some(row => row.id === hugeFeedback.source.id));
    assert.equal(memory.omittedForSize, 1);
    const experimentEvidence = memory.items.find(row => row.id === `result-${historical.id}`)!.evidence;
    const attemptFacts = experimentEvidence.attempts as {id: string; actual_parameters: Record<string, unknown>; metrics: Record<string, unknown>}[];
    assert.equal(attemptFacts.length, JSON.parse(quantState().experiments.find(row => row.data.id === historical.id)!.data.attemptsJson!).length);
    assert.equal(attemptFacts[0].actual_parameters.lookback, 20);
    assert.equal(attemptFacts[1].actual_parameters.lookback, 0);
    assert.ok(attemptFacts.every(row => Object.keys(row.metrics).every(key => ['train', 'validation'].includes(key))));
    assert.ok('train' in attemptFacts[0].metrics && 'validation' in attemptFacts[0].metrics);
    assert.equal('result' in experimentEvidence, false);
    assert.equal(experimentEvidence.historical_holdout_exposed, true);
    assert.ok(memory.items.every(row => row.entryId !== other.id));
    assert.ok(!memory.items.some(row => row.id === reviewing.reviewContext!.experimentResultId));
    const refs = memory.items.map(researchMemoryReference);
    historical.name = '后来改名'; oldFeedback.source.payload.document = '后来编辑，不应改已固定上下文';
    assert.equal(run.researchMemoryJson, frozen);
    run.createdAt = '2020-01-01T00:00:00Z';
    const completed = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    const review = completed.reviews![0];
    assert.deepEqual(review.run.result.review!.memoryAssessment!.flatMap(row => row.evidenceRefs), refs);
    assert.match(review.report!.markdown, /历史研究依据与判断/);
    assert.ok(JSON.parse(review.proposal!.dataJson).evidence_refs.some((ref: string) => refs.includes(ref)));
    resetQuantStateForTests();
    const restored = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    assert.equal(restored.reviews![0].run.researchMemoryJson, frozen);
    const feedback = await invoke<{source: import('../../types/api/quant.ts').QuantSource}>(`${base}entries/${current.id}/feedback/`, 'POST', {
        requestKey: 'memory_current_feedback01', title: '当前反馈', targetSourceId: currentFactor.sourceId, factorId: currentFactor.id, experimentResultId: '',
        mode: 'backtest', documentFormat: 'text', document: 'N=20 net=-4%', platform: 'Pine', notes: '', analyze: true, modelId: ''});
    const owner = quantState().entries.find(row => row.id === current.id)!;
    const feedbackRun = owner.runs.find(row => row.sourceId === feedback.source.id)!;
    assert.ok(readResearchMemory(feedbackRun.researchMemoryJson)!.items.length);
    feedbackRun.createdAt = '2020-01-01T00:00:00Z';
    await invoke(`${base}entries/${current.id}/`);
    assert.ok(feedbackRun.result.feedback?.memoryAssessment?.length);
    const feedbackReport = owner.reports!.find(row => row.runId === feedbackRun.id)!;
    assert.ok(JSON.parse(feedbackReport.proposal!.dataJson).evidence_refs.some((ref: string) => ref.startsWith('memory:')));
    setScenario('error'); assert.equal((await invoke<Response>(`${base}experiments/${started.id}/`)).status, 503);
    setScenario('slow'); assert.equal((await invoke<Experiment>(`${base}experiments/${started.id}/`)).reviews![0].run.researchMemoryJson, frozen);
    setScenario('empty'); assert.equal((await invoke<Response>(`${base}experiments/${started.id}/`)).status, 404);
    setScenario('sample'); assert.equal((await invoke<Response>(`${base}experiments/${started.id}/`, 'GET', undefined, false)).status, 403);
});

test('阶段失败后继续复用成功结果，证据接口与刷新保留状态', async () => {
    const collected = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'workflow_sample_collect', code: '// LOCAL_WORKFLOW_FAIL_RESEARCH\nN=20', language: 'python'});
    const entry = collected.entry, path = `${base}entries/${entry.id}/runs/`;
    const old = entry.runs[0];
    old.createdAt = new Date(Date.now() - 2500).toISOString();
    await invoke(`${path}${old.id}/`);
    assert.equal(old.workflow?.stages[3].status, 'running');
    assert.ok(old.workflow?.stages.slice(4).every(row => row.status === 'waiting'));
    old.createdAt = '2020-01-01T00:00:00Z';
    await invoke(`${path}${old.id}/`);
    assert.equal(old.status, 'failed');
    assert.deepEqual(old.workflow?.stages.slice(0, 4).map(row => row.status), ['completed', 'completed', 'completed', 'failed']);
    assert.equal(entry.reports?.length, 0);
    const evidence = await invoke<import('../../types/api/quantWorkflow').QuantStageEvidence>(`${path}${old.id}/workflow/parameters/`);
    assert.match(evidence.outcomeJson, /人工 local/);
    assert.equal((await invoke<Response>(`${path}${old.id}/workflow/publish/`)).status, 404);
    assert.equal((await invoke<Response>(`${path}${old.id}/workflow/parameters/`, 'GET', undefined, false)).status, 403);
    setScenario('error');
    assert.equal((await invoke<Response>(`${path}${old.id}/workflow/parameters/`)).status, 503);
    setScenario('sample');
    const input = {kind: 'analyze', sourceId: old.sourceId, resumeRunId: old.id, modelId: old.modelId, requestKey: 'workflow_sample_retry'};
    const next = await invoke<QuantAIRun>(path, 'POST', input);
    assert.equal((await invoke<QuantAIRun>(path, 'POST', input)).id, next.id);
    next.createdAt = '2020-01-01T00:00:00Z';
    await invoke(`${path}${next.id}/`);
    assert.equal(next.status, 'completed');
    assert.deepEqual(next.workflow?.stages.slice(0, 3).map(row => row.status), ['reused', 'reused', 'reused']);
    assert.equal(next.workflow?.stages[1].reusedFrom, old.workflow?.stages[1].outcomeId);
    assert.equal(entry.reports?.length, 1);
    resetQuantStateForTests();
    const restored = await invoke<QuantAIRun>(`${path}${next.id}/`);
    assert.equal(restored.workflow?.stages[1].status, 'reused');
});

test('已完成研究从实验设计重跑，前序复用、历史报告和重跑起点刷新保留', async () => {
    const collected = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'targeted_sample_collect', code: 'N=20', language: 'python'});
    const entry = collected.entry, path = `${base}entries/${entry.id}/runs/`, old = entry.runs[0];
    const input = {kind: 'analyze', sourceId: old.sourceId, resumeRunId: old.id, restartStage: 'plan', modelId: old.modelId, requestKey: 'targeted_sample_plan'};
    assert.equal((await invoke<Response>(path, 'POST', input)).status, 400);
    old.createdAt = '2020-01-01T00:00:00Z';
    await invoke(`${path}${old.id}/`);
    const original = JSON.stringify(entry.reports?.[0]);
    assert.equal((await invoke<Response>(path, 'POST', {...input, resumeRunId: ''})).status, 400);
    assert.equal((await invoke<Response>(path, 'POST', {...input, restartStage: 'unknown'})).status, 400);
    assert.equal((await invoke<Response>(path, 'POST', {...input, restartStage: ''})).status, 400);
    assert.equal((await invoke<Response>(path, 'POST', input, false)).status, 403);
    setScenario('error');
    assert.equal((await invoke<Response>(path, 'POST', input)).status, 503);
    setScenario('sample');
    const next = await invoke<QuantAIRun>(path, 'POST', input);
    assert.equal((await invoke<QuantAIRun>(path, 'POST', input)).id, next.id);
    assert.equal((await invoke<Response>(path, 'POST', {...input, restartStage: 'review'})).status, 409);
    next.createdAt = '2020-01-01T00:00:00Z';
    await invoke(`${path}${next.id}/`);
    assert.equal(next.status, 'completed');
    assert.deepEqual(next.workflow?.stages.map(row => row.status), [...Array(8).fill('reused'), 'completed', 'completed']);
    const structure = await invoke<import('../../types/api/quantWorkflow').QuantStageEvidence>(`${path}${next.id}/workflow/normalize/`);
    assert.equal(structure.structure?.localDemo, true);
    assert.equal(structure.sourceCode, 'N=20');
    assert.equal(structure.structure?.slices[0].startLine, 1);
    assert.equal((await invoke<Response>(`${path}${next.id}/workflow/normalize/`, 'GET', undefined, false)).status, 403);
    assert.equal(entry.reports?.length, 2);
    assert.equal(JSON.stringify(entry.reports?.[1]), original);
    resetQuantStateForTests();
    const restored = await invoke<QuantAIRun>(`${path}${next.id}/`);
    assert.equal(restored.workflow?.restartStage, 'plan');
    const restoredStructure = await invoke<import('../../types/api/quantWorkflow').QuantStageEvidence>(`${path}${next.id}/workflow/normalize/`);
    assert.deepEqual(restoredStructure.structure, structure.structure);
    assert.equal(restored.workflow?.stages[6].reusedFrom, old.workflow?.stages[6].outcomeId);
});

test('批量收集依次分析、停止重试及归档幂等，与成功报告分开保留', async () => {
    const path = `${base}intake-batches/`;
    const input: QuantBatchInput = {requestKey: 'local_batch_request_01', name: '六份源码', analyze: true, modelId: '', wallSeconds: 1800,
        items: Array.from({length: 6}, (_, index) => ({...emptyMaterial(), title: `代码 ${index + 1}`, code: 'def momentum(close): return close.pct_change(20)'}))};
    const batch = await invoke<QuantBatch>(path, 'POST', input);
    assert.equal(batch.items.length, 6);
    assert.equal((await invoke<QuantBatch>(path, 'POST', input)).id, batch.id);
    for (let index = 0; index < 2; index++) {
        await invoke(`${path}${batch.id}/`);
        const item = batch.items[index], entry = quantState().entries.find(row => row.id === item.entryId)!;
        entry.runs.find(row => row.id === item.runId)!.createdAt = '2020-01-01T00:00:00Z';
        await invoke(`${path}${batch.id}/`);
    }
    assert.equal(batch.completed, 2);
    const count = quantState().entries.length;
    const stopped = await invoke<QuantBatch>(`${path}${batch.id}/cancel/`, 'POST');
    assert.equal(stopped.status, 'cancelled');
    const retry = {requestKey: 'local_batch_retry_0001', modelId: '', wallSeconds: 300};
    const next = await invoke<QuantBatch>(`${path}${batch.id}/retry/`, 'POST', retry);
    assert.equal(next.items.length, 4);
    assert.deepEqual(next.plan.sources, batch.plan.sources.slice(2));
    assert.equal(quantState().entries.length, count);
    assert.equal((await invoke<QuantBatch>(`${path}${batch.id}/retry/`, 'POST', retry)).id, next.id);
    for (let index = 0; index < 4; index++) {
        await invoke(`${path}${next.id}/`);
        const item = next.items[index], entry = quantState().entries.find(row => row.id === item.entryId)!;
        entry.runs.find(row => row.id === item.runId)!.createdAt = '2020-01-01T00:00:00Z';
        await invoke(`${path}${next.id}/`);
    }
    assert.equal(next.status, 'completed');
    assert.ok(next.items.every(item => item.reportId));
    resetQuantStateForTests();
    assert.equal((await invoke<QuantBatch>(`${path}${next.id}/`)).status, 'completed');
    assert.equal((await invoke<Response>(path, 'POST', {...input, name: 'changed'})).status, 409);
});

test('批次路由覆盖无模型、空、慢请求、失败、授权和非法输入', async () => {
    const path = `${base}intake-batches/`;
    const input: QuantBatchInput = {requestKey: 'batch_states_request01', name: '等待配置', analyze: true, modelId: 'unknown', wallSeconds: 300, items: [{...emptyMaterial(), description: '作者说明'}]};
    assert.equal((await invoke<QuantBatch>(path, 'POST', input)).status, 'waiting_model');
    assert.equal((await invoke<Response>(path, 'POST', {...input, requestKey: 'invalid_materials_01', items: [emptyMaterial()]})).status, 400);
    assert.equal((await invoke<Response>(path, 'GET', undefined, false)).status, 403);
    assert.equal((await invoke<Response>('/api/quant/not-owned/intake-batches/')).status, 404);
    setScenario('empty'); assert.equal((await invoke<{total: number}>(path)).total, 0);
    setScenario('slow'); assert.equal((await invoke<{total: number}>(path)).total, 1);
    setScenario('error'); assert.equal((await invoke<Response>(path)).status, 503);
    setScenario('sample'); assert.equal((await invoke<{total: number}>(path)).total, 1);
});

test('源码文件支持明确编码，拒绝二进制与超额批次', () => {
    const text = 'input int 周期 = 20;';
    const raw = new Uint16Array([0xfeff, ...Array.from(text).map(char => char.charCodeAt(0))]);
    const decoded = decodeSourceFile(raw.buffer, '趋势.mq4');
    assert.equal(decoded.code, text); assert.equal(decoded.language, 'mql4');
    assert.equal(decodeSourceFile(new TextEncoder().encode('# 作者说明').buffer, '来源.md').description, '# 作者说明');
    assert.throws(() => decodeSourceFile(new Uint8Array([0, 1]).buffer, 'bad.py'), /二进制/);
    assert.throws(() => decodeSourceFile(new TextEncoder().encode('x').buffer, 'bad.exe'), /请选择/);
    assert.throws(() => decodeSourceFile(new Uint8Array([0xff]).buffer, 'bad.py'), /编码/);
    assert.match(validateMaterials(Array.from({length: 21}, () => ({...emptyMaterial(), code: 'x'}))), /20/);
    assert.match(validateMaterials([{...emptyMaterial(), url: 'file:///etc/passwd'}]), /HTTP/);
});

test('参数约束 local 流程覆盖读取、准备拒绝和失败尝试，状态不越过 mock', async () => {
    const entry = await invoke<QuantEntryDetail>(entryBase);
    entry.sources![0].payload.code = '// LOCAL_PARAMETER_DOMAIN\nlookback = input.int(20, minval=5, maxval=30, step=5)';
    await invoke(`${entryBase}runs/`, 'POST', {kind: 'analyze', sourceId: entry.sources![0].id, requestKey: 'parameter_domain_local001'});
    entry.runs.find(row => row.kind === 'analyze')!.createdAt = '2020-01-01T00:00:00Z';
    await invoke(entryBase);
    const factors = await invoke<{items: import('../../types/api/quant.ts').QuantFactorCandidate[]}>(`${base}factors/`);
    const candidate = factors.items.find(row => row.entryId === entry.id && row.data.parameters[0]?.domain)!;
    assert.equal(candidate.data.parameters[0].domain!.maximum, 30);
    const bundle = await invoke<import('../../types/api/quantExport.ts').QuantExportBundle>(`${base}factors/${candidate.id}/export/?target=python`);
    assert.equal(JSON.parse(bundle.manifestJson).parameter_domains[0].domain.step_origin, 0);
    const {buildSeed, initialSeed} = await import('../../components/Quant/experiments/plan.ts');
    const csvText = 'timestamp,open,high,low,close,volume\n' + Array.from({length: 90}, (_, index) => `${new Date(Date.UTC(2024, 0, index + 1)).toISOString()},100,102,99,101,1000`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Domain fixture', csvText, symbol: 'TEST', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'synthetic'});
    const input: import('../../types/api/quantExperiment.ts').QuantExperimentInput = {requestKey: 'domain_experiment_local01', name: '约束样例', datasetId: dataset.id,
        seeds: [buildSeed(candidate, initialSeed(candidate), false)], config: {seed: 1, maxCandidates: 8, generations: 1, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 5}};
    input.seeds[0].parameters[0].value = 31;
    assert.equal((await invoke<Response>(`${base}experiments/`, 'POST', input)).status, 400);
    input.seeds[0].parameters[0].value = 20;
    input.seeds[0].variants = [[{name: 'lookback', value: 31}]];
    const created = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', input);
    quantState().experiments.find(row => row.data.id === created.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const finished = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/${created.id}/`);
    assert.match(finished.attemptsJson!, /大于声明上限/);
    assert.equal(finished.derivedCandidates?.length, 0);
    resetQuantStateForTests();
    assert.equal((await invoke<import('../../types/api/quant.ts').QuantFactorCandidate>(`${base}factors/${candidate.id}/`)).data.parameters[0].domain!.step, 5);
    setScenario('slow'); assert.ok((await invoke<{items: unknown[]}>(`${base}factors/`)).items.length);
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}factors/`)).total, 0);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}factors/`)).status, 503);
});

test('条件约束 local 流程拒绝违规组合、导出重命名并保留恢复和四态', async () => {
    const entry = await invoke<QuantEntryDetail>(entryBase);
    entry.sources![0].payload.code = '// LOCAL_PARAMETER_CONDITION\nif enabled: assert lookback < slow';
    await invoke(`${entryBase}runs/`, 'POST', {kind: 'analyze', sourceId: entry.sources![0].id, requestKey: 'parameter_domain_local001'});
    entry.runs.find(row => row.kind === 'analyze')!.createdAt = '2020-01-01T00:00:00Z';
    await invoke(entryBase);
    const factors = await invoke<{items: import('../../types/api/quant.ts').QuantFactorCandidate[]}>(`${base}factors/`);
    const candidate = factors.items.find(row => row.entryId === entry.id && row.data.parameters[0]?.domain)!;
    assert.equal(candidate.data.parameters[0].domain!.version, 2);
    const bundle = await invoke<import('../../types/api/quantExport.ts').QuantExportBundle>(`${base}factors/${candidate.id}/export/?target=python`);
    const exported = JSON.parse(bundle.manifestJson).parameter_domains[0].domain;
    assert.equal(exported.conditions[0].when.left.parameter, 'p0');
    assert.equal(exported.conditions[0].require.left.parameter, 'p1');
    assert.equal(exported.conditions[0].require.right.parameter, 'p2');
    const {buildSeed, initialSeed} = await import('../../components/Quant/experiments/plan.ts');
    const csvText = 'timestamp,open,high,low,close,volume\n' + Array.from({length: 90}, (_, index) => `${new Date(Date.UTC(2024, 0, index + 1)).toISOString()},100,102,99,101,1000`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Domain fixture', csvText, symbol: 'TEST', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'synthetic'});
    const input: import('../../types/api/quantExperiment.ts').QuantExperimentInput = {requestKey: 'domain_experiment_local01', name: '约束样例', datasetId: dataset.id,
        seeds: [buildSeed(candidate, initialSeed(candidate), false)], config: {seed: 1, maxCandidates: 8, generations: 1, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 5}};
    input.seeds[0].parameters[0].value = 35;
    assert.equal((await invoke<Response>(`${base}experiments/`, 'POST', input)).status, 400);
    input.seeds[0].parameters[0].value = 20;
    input.seeds[0].variants = [input.seeds[0].parameters.map(row => row.name === 'lookback' ? {...row, value: 35} : {...row})];
    const created = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', input);
    quantState().experiments.find(row => row.data.id === created.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const finished = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/${created.id}/`);
    assert.match(finished.attemptsJson!, /条件约束不满足/);
    assert.equal(finished.derivedCandidates?.length, 0);
    resetQuantStateForTests();
    assert.equal((await invoke<import('../../types/api/quant.ts').QuantFactorCandidate>(`${base}factors/${candidate.id}/`)).data.parameters[0].domain!.step, 5);
    setScenario('slow'); assert.ok((await invoke<{items: unknown[]}>(`${base}factors/`)).items.length);
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}factors/`)).total, 0);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}factors/`)).status, 503);
});

test('SET 文件编码、预览、配置归档、AI 依据与恢复保持分离', async () => {
    const text = '; 参数配置\nN=10\nN,F=1\nN,1=5\nN,2=5\nN,3=30';
    const utf16 = new Uint8Array(2 + text.length * 2); utf16[0] = 0xff; utf16[1] = 0xfe;
    for (let i = 0; i < text.length; i++) {utf16[2 + i*2] = text.charCodeAt(i) & 255; utf16[3 + i*2] = text.charCodeAt(i) >> 8;}
    assert.equal(decodeFeedbackFile(utf16.buffer, 'expert.set').document, text);
    assert.equal(decodeFeedbackFile(new TextEncoder().encode(text).buffer, 'expert.SET').documentFormat, 'mql_set');
    assert.throws(() => decodeFeedbackFile(new Uint8Array([255, 255, 0]).buffer, 'bad.set'));
    const entry = await invoke<QuantEntryDetail>(entryBase);
    const source = entry.sources![0]; source.payload.language = 'mql4'; source.payload.code = 'input int N=20;';
    const count = entry.sources!.length;
    const preview = await invoke<import('../../types/api/quantParameters.ts').QuantConfigurationPreview>(`${entryBase}parameters/preview/`, 'POST', {targetSourceId: source.id, document: text});
    assert.equal(preview.configuration.parameters[0].rawValue, '10');
    assert.equal(preview.configuration.parameters[0].optimization!.step, '5');
    assert.equal(preview.comparison.rows[0].status, 'different');
    assert.equal(entry.sources!.length, count);
    const input: import('../../types/api/quantFeedback.ts').QuantFeedbackInput = {requestKey: 'set_config_local_0001', title: 'expert.set', targetSourceId: source.id, factorId: '', experimentResultId: '',
        mode: 'configuration', documentFormat: 'mql_set', document: text, platform: 'MT4', notes: '', analyze: true, modelId: ''};
    const saved = await invoke<{source: import('../../types/api/quant.ts').QuantSource}>(`${entryBase}feedback/`, 'POST', input);
    assert.equal(saved.source.payload.feedbackVersion, 2);
    assert.equal(saved.source.payload.parameterComparison!.rows[0].status, 'different');
    const run = entry.runs.find(row => row.sourceId === saved.source.id)!; run.createdAt = '2020-01-01T00:00:00Z';
    const finished = await invoke<QuantEntryDetail>(entryBase);
    assert.deepEqual(run.result.feedback!.reportedMetrics, []);
    assert.equal(finished.reports!.find(row => row.runId === run.id)!.data.parameterComparison!.rows[0].status, 'different');
    assert.equal((await invoke<Response>(`${entryBase}feedback/`, 'POST', {...input, requestKey: 'set_wrong_mode_00001', mode: 'live'})).status, 400);
    assert.equal((await invoke<Response>(`${entryBase}parameters/preview/`, 'POST', {targetSourceId: source.id, document: 'N=1\nN=2'})).status, 400);
    resetQuantStateForTests();
    assert.equal((await invoke<QuantEntryDetail>(entryBase)).sources!.find(row => row.id === saved.source.id)!.payload.parameterConfiguration!.parameters[0].rawValue, '10');
    assert.equal((await invoke<Response>(`${entryBase}parameters/preview/`, 'POST', {targetSourceId: source.id, document: text}, false)).status, 403);
    setScenario('error'); assert.equal((await invoke<Response>(`${entryBase}parameters/preview/`, 'POST', {targetSourceId: source.id, document: text})).status, 503);
    setScenario('empty'); assert.equal((await invoke<Response>(`${entryBase}parameters/preview/`, 'POST', {targetSourceId: source.id, document: text})).status, 404);
});

test('外部反馈自动分析、原文与人工修订保留，重放不会新增任务', async () => {
    const entry = await invoke<QuantEntryDetail>(entryBase);
    const path = `${entryBase}feedback/`;
    const input: import('../../types/api/quantFeedback.ts').QuantFeedbackInput = {requestKey: 'feedback_local_00001', title: '外部亏损报告', targetSourceId: entry.sources![0].id, factorId: '', experimentResultId: '',
        mode: 'live', documentFormat: 'text', document: 'N=10\nnet=-2%', platform: 'MT4 测试', notes: '', analyze: true, modelId: ''};
    const saved = await invoke<{source: import('../../types/api/quant.ts').QuantSource}>(path, 'POST', input);
    const run = entry.runs.find(row => row.kind === 'feedback_review')!;
    run.createdAt = '2020-01-01T00:00:00Z';
    const completed = await invoke<QuantEntryDetail>(entryBase);
    const report = completed.reports!.find(row => row.sourceId === saved.source.id)!;
    assert.equal(report.schemaVersion, 5);
    assert.equal(run.result.feedback!.reportedParameters[0].value, '10');
    assert.equal(run.result.feedback!.reportedMetrics[0].value, '-2%');
    assert.equal(report.data.totalScore, undefined);
    const original = report.originalMarkdown;
    await invoke(`${entryBase}reports/${report.id}/`, 'PATCH', {markdown: '人工核对：费用缺失', expectedRevisionId: ''});
    resetQuantStateForTests();
    const restored = await invoke<QuantEntryDetail>(entryBase);
    assert.equal(restored.reports!.find(row => row.id === report.id)!.originalMarkdown, original);
    assert.equal(restored.reports!.find(row => row.id === report.id)!.markdown, '人工核对：费用缺失');
    const count = restored.runs.length;
    await invoke(path, 'POST', input);
    assert.equal(restored.runs.length, count);
    assert.equal((await invoke<Response>(path, 'POST', {...input, document: 'changed'})).status, 409);
    assert.equal((await invoke<Response>(path, 'POST', {...input, requestKey: 'feedback_local_00002', documentFormat: 'json', document: '{bad'})).status, 400);
    assert.equal((await invoke<Response>(path, 'POST', {...input, targetSourceId: 'missing'})).status, 400);
    setScenario('error'); assert.equal((await invoke<Response>(path, 'POST', input)).status, 503);
    setScenario('empty'); assert.equal((await invoke<Response>(path, 'POST', input)).status, 404);
});

test('自动报告、人工修订、幂等与刷新持久化', async () => {
    const input = {requestKey: 'research_request_0001', code: 'def factor(close): return close.pct_change(20)', description: '作者说明'};
    const first = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', input);
    const duplicate = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', input);
    assert.equal(duplicate.entry.id, first.entry.id);
    assert.equal(first.entry.runs.length, 1);
    assert.equal((await invoke<Response>(`${base}intake/`, 'POST', {...input, url: 'https://example.com'})).status, 409);
    const entry = quantState().entries.find(row => row.id === first.entry.id)!;
    entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const path = `${base}entries/${entry.id}/`;
    const complete = await invoke<QuantEntryDetail>(path);
    assert.equal(complete.reports?.length, 1);
    assert.equal(complete.runs[0].result.analysis?.totalScore, 60);
    const report = structuredClone(complete.reports![0]);
    await invoke(`${path}reports/${report.id}/`, 'PATCH', {markdown: '人工补充', expectedRevisionId: ''});
    assert.equal((await invoke<Response>(`${path}reports/${report.id}/`, 'PATCH', {markdown: '旧编辑', expectedRevisionId: ''})).status, 409);
    resetQuantStateForTests();
    const restored = await invoke<QuantEntryDetail>(path);
    assert.equal(restored.reports?.length, 1);
    assert.equal(restored.reports![0].originalMarkdown, report.originalMarkdown);
    assert.equal(restored.reports![0].markdown, '人工补充');
    assert.equal(restored.sources![0].payload.description, '作者说明');
    assert.equal((await invoke<Response>(`${entryBase}runs/`, 'POST', {kind: 'analyze', sourceId: entry.sources![0].id, requestKey: 'cross_entry_000001'})).status, 404);
});

test('反馈自动匹配候选并生成可执行方案，固定依据且可进入连续研究', async () => {
    const imported = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'feedback_plan_source01', code: 'close / close.shift(N) - 1'});
    imported.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const path = `${base}entries/${imported.entry.id}/`;
    const entry = await invoke<QuantEntryDetail>(path);
    const sourceId = entry.sources![0].id;
    const source = await invoke<{source: import('../../types/api/quant.ts').QuantSource}>(`${path}feedback/`, 'POST', {
        requestKey: 'feedback_plan_first01', title: '失败反馈', targetSourceId: sourceId, mode: 'backtest', documentFormat: 'text', document: 'N=10\nnet=-2%', analyze: true,
    });
    const run = entry.runs.find(row => row.kind === 'feedback_review')!;
    assert.equal(run.feedbackMemory!.candidateIds.length, 1);
    assert.deepEqual(run.feedbackMemory!.historyIds, []);
    run.createdAt = '2020-01-01T00:00:00Z';
    const completed = await invoke<QuantEntryDetail>(path);
    const report = completed.reports!.find(row => row.sourceId === source.source.id)!;
    assert.equal(report.data.feedbackPlanningVersion, 1);
    const {readProposal} = await import('../../components/Quant/experiments/proposal.ts');
    const proposal = report.proposal!, plan = readProposal(proposal);
    assert.equal(plan.feedback, true); assert.equal(plan.initial, false);
    assert.equal(quantState().experiments.length, 0);
    const rows = Array.from({length: 90}, (_, i) => `${new Date(Date.UTC(2024, 0, i + 1)).toISOString()},100,102,99,101,500`);
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Feedback fixture', csvText: ['timestamp,open,high,low,close,volume', ...rows].join('\n'), symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'test'});
    const experiment = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', {
        requestKey: 'feedback_plan_run001', name: plan.name, proposalId: proposal.id, datasetId: dataset.id, seeds: plan.seeds, config: plan.config,
    });
    assert.equal(experiment.originProposal!.id, proposal.id);
    assert.equal(JSON.parse(experiment.planJson!).proposal_adapted, false);
    await invoke(`${base}experiments/${experiment.id}/cancel/`, 'POST');
    const campaign = await invoke<import('../../types/api/quantCampaign.ts').QuantCampaign>(`${base}campaigns/`, 'POST', {
        requestKey: 'feedback_plan_loop01', name: '反馈连续验证', proposalId: proposal.id, datasetIds: [dataset.id], maxRounds: 1, maxAttempts: 16, computeSeconds: 30, wallSeconds: 120, modelId: '',
    });
    assert.equal(campaign.status, 'pending');
    await invoke(`${base}campaigns/${campaign.id}/cancel/`, 'POST');
    resetQuantStateForTests();
    const restored = await invoke<QuantEntryDetail>(path);
    assert.equal(restored.reports!.find(row => row.id === report.id)!.proposal!.dataJson, proposal.dataJson);
    assert.deepEqual(restored.runs.find(row => row.id === run.id)!.feedbackMemory, run.feedbackMemory);
});

test('来源分析直接生成首轮方案，并可启动实验与连续研究', async () => {
    const imported = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'initial_plan_source_001', code: 'close / close.shift(N) - 1'});
    imported.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const path = `${base}entries/${imported.entry.id}/`;
    const detail = await invoke<QuantEntryDetail>(path);
    const proposal = detail.reports![0].proposal!;
    assert.equal(detail.reports![0].data.initialPlanningVersion, 1);
    assert.ok(proposal); assert.equal(quantState().experiments.length, 0);
    const {readProposal} = await import('../../components/Quant/experiments/proposal.ts');
    const plan = readProposal(proposal);
    assert.equal(plan.initial, true); assert.equal(plan.demo, true);
    assert.deepEqual(plan.seeds[0].parameters, [{name: 'lookback', value: 20}]);
    assert.deepEqual(plan.seeds[0].variants, [[{name: 'lookback', value: 15}], [{name: 'lookback', value: 25}]]);
    const rows = Array.from({length: 90}, (_, i) => `${new Date(Date.UTC(2024, 0, i + 1)).toISOString()},100,102,99,101,500`);
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Initial synthetic fixture', csvText: ['timestamp,open,high,low,close,volume', ...rows].join('\n'), symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'test'});
    const input = {requestKey: 'initial_plan_execute_01', name: plan.name, proposalId: proposal.id, datasetId: dataset.id, seeds: plan.seeds, config: plan.config};
    const experiment = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', input);
    assert.equal(JSON.parse(experiment.planJson!).proposal_adapted, false);
    assert.equal(experiment.originProposal!.id, proposal.id);
    await invoke(`${base}experiments/${experiment.id}/cancel/`, 'POST');
    const campaign = await invoke<import('../../types/api/quantCampaign.ts').QuantCampaign>(`${base}campaigns/`, 'POST', {
        requestKey: 'initial_plan_campaign01', name: '首轮连续研究', proposalId: proposal.id, datasetIds: [dataset.id], maxRounds: 1, maxAttempts: 16, computeSeconds: 30, wallSeconds: 120, modelId: '',
    });
    assert.equal(campaign.status, 'pending');
    const running = await invoke<import('../../types/api/quantCampaign.ts').QuantCampaign>(`${base}campaigns/${campaign.id}/`);
    assert.equal(running.rounds.length, 1);
    await invoke(`${base}campaigns/${campaign.id}/cancel/`, 'POST');
    resetQuantStateForTests();
    const restored = await invoke<QuantEntryDetail>(path);
    assert.equal(restored.reports![0].proposal!.dataJson, proposal.dataJson);
    assert.equal((await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/${experiment.id}/`)).originProposal!.id, proposal.id);
    const prose = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'initial_no_plan_text01', description: '只有说明，没有计算代码'});
    prose.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const noPlan = await invoke<QuantEntryDetail>(`${base}entries/${prose.entry.id}/`);
    assert.equal(noPlan.reports![0].proposal, null);
    assert.match(noPlan.reports![0].data.initialPlanningNote || '', /没有可计算/);
    setScenario('error'); assert.equal((await invoke<Response>(path)).status, 503);
    setScenario('empty'); assert.equal((await invoke<Response>(path)).status, 404);
});

test('跨来源候选在复盘排队时固定，并进入下一轮组合方案', async () => {
    const source = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'library_parent_source01', code: 'def momentum(close, lookback=20): return close.pct_change(lookback)'});
    const other = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'library_other_source001', code: '# LOCAL_LIBRARY_WINDOW_10\ndef momentum(close, lookback=10): return close.pct_change(lookback)'});
    for (const entry of [source.entry, other.entry]) {entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; await invoke(`${base}entries/${entry.id}/`);}
    const detail = await invoke<QuantEntryDetail>(`${base}entries/${source.entry.id}/`);
    const {readProposal} = await import('../../components/Quant/experiments/proposal.ts');
    const plan = readProposal(detail.reports![0].proposal!);
    const rows = Array.from({length: 90}, (_, i) => `${new Date(Date.UTC(2024, 0, i + 1)).toISOString()},100,102,99,101,500`);
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Cross source fixture', csvText: ['timestamp,open,high,low,close,volume', ...rows].join('\n'), symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'test'});
    const started = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', {requestKey: 'cross_source_run_0001', name: plan.name, datasetId: dataset.id, config: plan.config, seeds: plan.seeds});
    const record = quantState().experiments.find(row => row.data.id === started.id)!;
    record.data.createdAt = new Date(Date.now() - 5000).toISOString();
    const reviewing = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/${started.id}/`);
    const run = reviewing.reviews![0].run;
    assert.equal(run.libraryRetrieval!.candidates.length, 1);
    assert.equal(run.libraryRetrieval!.candidates[0].entryId, other.entry.id);
    const frozen = structuredClone(run.libraryRetrieval);
    // The queued task retains its snapshot after later changes in the library.
    other.entry.title = 'changed after queue';
    quantState().entries.find(row => row.id === run.entryId)!.runs.find(row => row.id === run.id)!.createdAt = new Date(Date.now() - 5000).toISOString();
    const completed = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/${started.id}/`);
    const proposal = completed.reviews![0].proposal!;
    const next = readProposal(proposal);
    assert.equal(next.seeds.length, 2);
    assert.equal(next.seeds[1].parameters[0].value, 10);
    assert.deepEqual(completed.reviews![0].run.libraryRetrieval, frozen);
    const adopted = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', {requestKey: 'cross_source_adopt_01', name: next.name, proposalId: proposal.id, datasetId: dataset.id, config: next.config, seeds: next.seeds});
    assert.equal(JSON.parse(adopted.planJson!).engine_version, 'quant-local-search-2');
    assert.equal(JSON.parse(adopted.planJson!).proposal_adapted, false);
    quantState().experiments.find(row => row.data.id === adopted.id)!.data.createdAt = new Date(Date.now() - 5000).toISOString();
    const combined = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/${adopted.id}/`);
    const attempts = JSON.parse(combined.attemptsJson!);
    assert.deepEqual(attempts.find((row: {operation: string}) => row.operation === 'mean').requested_parameters, {a_lookback: 20, b_lookback: 10});
    resetQuantStateForTests();
    const restored = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/${started.id}/`);
    assert.deepEqual(restored.reviews![0].run.libraryRetrieval, frozen);
    assert.equal(restored.reviews![0].proposal!.dataJson, proposal.dataJson);
});

test('无模型保留收集资料，空输入与接口故障不产生假报告', async () => {
    const archived = await invoke<{entry: QuantEntryDetail; notice: string}>(`${base}intake/`, 'POST', {requestKey: 'research_request_0002', description: '先保存说明', modelId: 'missing'});
    assert.equal(archived.entry.runs.length, 0);
    assert.ok(archived.notice);
    assert.equal((await invoke<Response>(`${base}intake/`, 'POST', {requestKey: 'research_request_0003'})).status, 400);
    setScenario('error');
    assert.equal((await invoke<Response>(`${base}intake/`, 'POST', {requestKey: 'research_request_0004', code: 'x=1'})).status, 503);
});

test('网址获取生成独立来源快照，失败时不生成虚假报告', async () => {
    const collected = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'url_request_00000001', url: 'https://example.invalid/source'});
    collected.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const path = `${base}entries/${collected.entry.id}/`;
    const detail = await invoke<QuantEntryDetail>(path);
    assert.equal(detail.sources?.length, 2);
    assert.equal(detail.sources![0].payload.fetchStatus, 'fetched');
    assert.equal(detail.sources![1].payload.fetchStatus, 'not_fetched');
    assert.equal(detail.reports![0].sourceId, detail.runs[0].resolvedSourceId);
    assert.ok(detail.sources!.every(row => row.materialCurrentSourceId === detail.runs[0].resolvedSourceId));
    assert.equal(detail.sources![0].materialId, detail.sources![1].materialId);
    resetQuantStateForTests();
    assert.equal((await invoke<QuantEntryDetail>(path)).sources![0].payload.webMarkdown, detail.sources![0].payload.webMarkdown);
    const failed = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'url_request_00000002', url: 'https://example.invalid/fetch-error'});
    failed.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const failure = await invoke<QuantEntryDetail>(`${base}entries/${failed.entry.id}/`);
    assert.equal(failure.runs[0].status, 'failed');
    assert.equal(failure.sources![0].payload.fetchStatus, 'failed');
    assert.ok(failure.sources!.every(row => row.materialCurrentSourceId === failure.sources![0].id));
    assert.equal(failure.reports?.length, 0);
    const key = 'odoc:local:quant:v1:sample', saved = JSON.parse(storage.get(key)!) as Record<string, unknown>;
    delete saved.materialCurrentSources; storage.set(key, JSON.stringify(saved)); resetQuantStateForTests();
    const legacy = await invoke<QuantEntryDetail>(path);
    assert.ok(legacy.sources!.every(row => row.materialCurrentSourceId === null));
});

test('首页保留已有文集，添加私密量化卡；访客不见量化详情', async () => {
    const list = await invoke<Anthology[]>('/api/anthology/list');
    assert.ok(list.some(row => row.collId === 'col_deploy_001'));
    assert.equal(list.find(row => row.type === 'quant')?.count, 3);
    const visitor = await invoke<Anthology[]>('/api/anthology/list', 'GET', undefined, false);
    assert.equal(visitor.some(row => row.type === 'quant'), false);
    assert.equal((await invoke<Response>(`${base}entries/`, 'GET', undefined, false)).status, 403);
});

test('模型接口使用全局路径且保持认证和场景边界', async () => {
    const models = await invoke<QuantModels>('/api/quant/models/');
    assert.ok(models.models.length > 0);
    assert.ok(models.models.some(row => row.id === models.defaultModelId));
    assert.equal((await invoke<Response>('/api/quant/models/', 'GET', undefined, false)).status, 403);
    assert.equal(await invoke(`${base}models/`), undefined);
    setScenario('empty');
    assert.deepEqual(await invoke('/api/quant/models/'), models);
    setScenario('error');
    assert.equal((await invoke<Response>('/api/quant/models/')).status, 503);
});

test('条目、代码版本、回测与验证状态可修改并在刷新后保留', async () => {
    const entry = await invoke<QuantEntry>(`${base}entries/`, 'POST', {title: '新因子'});
    const path = `${base}entries/${entry.id}/`;
    const impl = await invoke<QuantImplementation>(`${path}implementations/`, 'POST', {name: 'Python', language: 'python', code: 'value = 1'});
    const first = structuredClone(impl.versions[0]);
    const version = await invoke<QuantCodeVersion>(`${path}implementations/${impl.id}/versions/`, 'POST', {code: 'value = 2', note: '第二版'});
    assert.equal(impl.currentVersionId, version.id);
    assert.equal(first.code, 'value = 1');
    await invoke(`${path}backtests/`, 'POST', {name: '首版结果', versionId: first.id, metrics: [{name: '收益', value: ''}]});
    await invoke(`${path}versions/${version.id}/verification/`, 'PATCH', {compileCheck: 'passed', runCheck: 'pending', resultCheck: 'pending'});
    resetQuantStateForTests();
    const detail = await invoke<QuantEntryDetail>(path);
    assert.equal(detail.implementations[0].versions.length, 2);
    assert.equal(detail.implementations[0].versions[1].code, 'value = 1');
    assert.equal(detail.backtests[0].versionId, first.id);
    assert.equal(detail.implementations[0].versions[0].compileCheck, 'passed');
});

test('任务重复提交及采用幂等，候选保存新实现且不覆盖来源代码', async () => {
    const input = {kind: 'convert', sourceVersionId: 'local-quant-version-2', targetLanguage: 'pine', targetVersion: '6', requestKey: 'quant-request-1'};
    const run = await invoke<QuantAIRun>(`${entryBase}runs/`, 'POST', input);
    const repeat = await invoke<QuantAIRun>(`${entryBase}runs/`, 'POST', input);
    assert.equal(run.id, repeat.id);
    assert.equal((await invoke<Response>(`${entryBase}runs/`, 'POST', {...input, targetLanguage: 'mql4'})).status, 409);
    assert.equal((await invoke<Response>(`${entryBase}runs/${run.id}/adopt/`, 'POST')).status, 409);
    quantState().entries[0].runs.find(row => row.id === run.id)!.createdAt = '2020-01-01T00:00:00Z';
    const completed = await invoke<QuantAIRun>(`${entryBase}runs/${run.id}/`);
    assert.equal(completed.status, 'completed');
    const adopted = await invoke<{implementation: QuantImplementation}>(`${entryBase}runs/${run.id}/adopt/`, 'POST');
    const duplicate = await invoke<{implementation: QuantImplementation}>(`${entryBase}runs/${run.id}/adopt/`, 'POST');
    assert.equal(adopted.implementation.id, duplicate.implementation.id);
    assert.equal(adopted.implementation.versions[0].resultCheck, 'pending');
    assert.equal(quantState().entries[0].implementations[0].language, 'python');
});

test('回测修改版本不能与已有附件证据冲突，失败不写入且刷新后状态不变', async () => {
    const versionId = 'local-quant-version-1';
    const backtestPath = `${entryBase}backtests/local-quant-backtest/`;
    const attached = await invoke<QuantAttachment>(`${entryBase}attachments/`, 'POST', {
        assetId: 'local-quant-report', backtestId: 'local-quant-backtest', versionId,
    });
    const before = structuredClone(await invoke<QuantEntryDetail>(entryBase));
    const response = await invoke<Response>(backtestPath, 'PATCH', {name: '不应保存', versionId: 'local-quant-version-2'});
    assert.equal(response.status, 400);
    assert.match((await response.json() as {msg: string}).msg, /附件已关联其他代码版本/);
    resetQuantStateForTests();
    assert.deepEqual(await invoke(entryBase), before);
    await invoke(backtestPath, 'PATCH', {versionId: null});
    assert.equal((await invoke<Response>(backtestPath, 'PATCH', {versionId: 'local-quant-version-2'})).status, 400);
    await invoke(backtestPath, 'PATCH', {versionId});
    await invoke(backtestPath, 'PATCH', {name: '保留原版本'});
    assert.equal((await invoke<QuantEntryDetail>(entryBase)).backtests.find(row => row.id === 'local-quant-backtest')!.versionId, versionId);
    await invoke(`${entryBase}attachments/${attached.id}/`, 'DELETE');
    await invoke(backtestPath, 'PATCH', {versionId: 'local-quant-version-2'});
    assert.equal((await invoke<QuantEntryDetail>(entryBase)).backtests.find(row => row.id === 'local-quant-backtest')!.versionId, 'local-quant-version-2');
});

test('取消任务保持取消；空数据和模拟错误不退到真实接口', async () => {
    const run = await invoke<QuantAIRun>(`${entryBase}runs/`, 'POST', {kind: 'explain', sourceVersionId: 'local-quant-version-2', requestKey: 'cancel'});
    await invoke(`${entryBase}runs/${run.id}/cancel/`, 'POST');
    assert.equal((await invoke<QuantAIRun>(`${entryBase}runs/${run.id}/`)).status, 'cancelled');
    setScenario('empty');
    assert.deepEqual(await invoke(`${base}entries/`), []);
    const newEntry = await invoke<QuantEntry>(`${base}entries/`, 'POST', {title: '空状态新增'});
    assert.equal((await invoke<QuantEntry[]>(`${base}entries/`))[0].id, newEntry.id);
    setScenario('error');
    assert.equal((await invoke<Response>('/api/quant/models/')).status, 503);
    setScenario('sample');
    assert.equal(await invoke('/api/quant/local-quant/not-implemented/'), undefined);
});

test('上传附件、下载、脚本读取及软删后的引用保护', async () => {
    const form = new FormData(); form.append('source_type', 'quant'); form.append('file', new File(['value = 1'], 'factor.py', {type: 'text/plain'}));
    const uploaded = await resolveQuantRoute(new Request('http://localhost/api/resource/upload', {method: 'POST', headers: {Authorization: 'Token local-demo-token'}, body: form})) as {id: string};
    const ref = await invoke<QuantAttachment>(`${entryBase}attachments/`, 'POST', {assetId: uploaded.id});
    const text = await invoke<{code: string; language: string}>(`${entryBase}attachments/${ref.id}/text/`);
    assert.equal(text.code, 'value = 1'); assert.equal(text.language, 'python');
    const download = await invoke<Response>(`/api/resource/download/${uploaded.id}`);
    assert.equal(await download.text(), 'value = 1');
    assert.equal((await invoke<Response>(`${entryBase}attachments/`, 'POST', {assetId: uploaded.id, versionId: 'foreign'})).status, 400);
    await invoke(entryBase, 'DELETE');
    assert.equal((await invoke<Response>(`/api/resource/delete/${uploaded.id}`, 'DELETE')).status, 409);
});

test('重置样例仅清理当前量化mock前缀，保留真实与本地登录数据', () => {
    storage.set('odoc:local:quant:v1:sample', 'sample-state');
    storage.set('odoc:local:quant:v1:empty', 'empty-state');
    storage.set('token', 'real-login');
    storage.set('odoc:local:token', 'local-login');
    storage.set('odoc:local:quant:v2:future', 'another-version');
    clearQuantMockData();
    assert.equal(storage.has('odoc:local:quant:v1:sample'), false);
    assert.equal(storage.has('odoc:local:quant:v1:empty'), false);
    assert.equal(storage.get('token'), 'real-login');
    assert.equal(storage.get('odoc:local:token'), 'local-login');
    assert.equal(storage.get('odoc:local:quant:v2:future'), 'another-version');
    assert.equal(quantState().entries.length, 3);
});

test('候选导出覆盖四个平台、归属及 local 错误空数据路径', async () => {
    const collected = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'factor_export_local01', code: 'close / close.shift(20) - 1'});
    collected.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const factors = await invoke<{items: import('../../types/api/quant').QuantFactorCandidate[]}>(`${base}factors/`);
    const candidate = factors.items[0], path = `${base}factors/${candidate.id}/export/`;
    for (const target of ['python', 'pine', 'mql4', 'tongdaxin']) {
        const result = await invoke<import('../../types/api/quantExport').QuantExportBundle>(`${path}?target=${target}`);
        assert.ok(result.code); assert.ok(result.filename.startsWith('factor-'));
        assert.equal(JSON.parse(result.manifestJson).local_demo, true);
        assert.equal(JSON.parse(result.manifestJson).candidate_id, candidate.id);
    }
    assert.equal((await invoke<Response>(`${path}?target=unknown`)).status, 400);
    assert.equal((await invoke<Response>(path, 'GET', undefined, false)).status, 403);
    setScenario('error'); assert.equal((await invoke<Response>(path)).status, 503);
    setScenario('empty'); assert.equal((await invoke<Response>(path)).status, 404);
});

test('因子自动入库、筛选、来源、重复读取与恢复', async () => {
    const collected = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'factor_request_00001', code: 'def factor(close): return close.pct_change(20)'});
    collected.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const url = `${base}factors/`;
    type Listing = {total: number; items: import('../../types/api/quant').QuantFactorCandidate[]};
    const listed = await invoke<Listing>(url);
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0].sourceId, collected.entry.sources![0].id);
    assert.equal(listed.items[0].reportId, collected.entry.reports![0].id);
    assert.equal((await invoke<Listing>(url + '?role=display')).total, 0);
    assert.equal((await invoke<Listing>(url + '?q=不存在的因子')).total, 0);
    assert.equal((await invoke<Listing>(url + '?family=momentum')).total, 1);
    assert.equal((await invoke<Response>(url + '?limit=101')).status, 400);
    resetQuantStateForTests();
    assert.equal((await invoke<Listing>(url)).total, 1);
    assert.equal((await invoke<import('../../types/api/quant').QuantFactorCandidate>(url + listed.items[0].id + '/')).id, listed.items[0].id);
    assert.equal((await invoke<Response>(url, 'GET', undefined, false)).status, 403);
    assert.equal((await invoke<Response>('/api/quant/foreign/factors/')).status, 404);
    await invoke(`${base}entries/${collected.entry.id}/`, 'DELETE');
    assert.equal((await invoke<Listing>(url)).total, 0);
    assert.equal((await invoke<Response>(url + listed.items[0].id + '/')).status, 404);
});

test('候选去重展示与可追溯人工修订', async () => {
    for (const requestKey of ['factor_curate_0000001', 'factor_curate_0000002']) {
        const collected = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey, code: 'def factor(close): return close.pct_change(20)', language: 'python'});
        collected.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    }
    type Candidate = import('../../types/api/quant').QuantFactorCandidate;
    type Listing = {total: number; occurrenceTotal: number; items: Candidate[]};
    const list = await invoke<Listing>(`${base}factors/?groupBy=expression`);
    assert.equal(list.total, 1);
    assert.equal(list.occurrenceTotal, 2);
    assert.equal(list.items[0].occurrenceCount, 2);
    const candidate = list.items[0], path = `${base}factors/${candidate.id}/`;
    assert.equal((await invoke<Listing>(path + 'occurrences/?groupBy=expression&limit=1')).total, 2);
    const data = {...candidate.curation, name: '我的研究候选', tags: ['动量', '动量', ' ＲＳＩ '], aliases: ['区间涨幅'], note: '检查费用敏感度'};
    const edited = await invoke<Candidate>(path, 'PATCH', {data, expectedRevisionId: ''});
    assert.deepEqual(edited.curation.tags, ['动量', 'RSI']);
    assert.equal(edited.data.name, candidate.data.name);
    assert.equal(edited.revisions.length, 1);
    assert.equal((await invoke<Response>(path, 'PATCH', {data, expectedRevisionId: ''})).status, 409);
    assert.equal((await invoke<Listing>(`${base}factors/?q=区间涨幅`)).total, 1);
    resetQuantStateForTests();
    assert.equal((await invoke<Candidate>(path)).curation.note, data.note);
    assert.equal((await invoke<Listing>(`${base}factors/?groupBy=expression`)).total, 1);
    assert.equal((await invoke<Listing>(`${base}factors/?groupBy=none`)).total, 2);
});

test('图谱来源、自动索引、取消与只读访问保持本地闭环', async () => {
    type Graph = import('../../types/api/quantGraph').QuantGraph;
    type Index = import('../../types/api/quantGraph').QuantIndexStatus;
    for (const requestKey of ['graph_mock_00000001', 'graph_mock_00000002']) {
        const collected = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey, code: 'def factor(close): return close.pct_change(20)', language: 'python'});
        collected.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    }
    const graph = await invoke<Graph>(`${base}graph/`);
    assert.equal(graph.nodes.filter(row => row.kind === 'factor').length, 2);
    assert.ok(graph.edges.some(edge => edge.kind === 'same_expression'));
    assert.equal(graph.index.jobs.length, 2);
    const pending = graph.index.jobs[0];
    await invoke(`${base}graph/index/${pending.id}/cancel/`, 'POST');
    assert.equal((await invoke<Index>(`${base}graph/index/`)).jobs[0].status, 'cancelled');
    const state = quantState().graph;
    state.jobs.filter(job => job.status === 'running').forEach(job => {job.createdAt = '2020-01-01T00:00:00Z';});
    const after = await invoke<Index>(`${base}graph/index/`);
    assert.equal(after.ready, 1);
    const count = state.jobs.length;
    await invoke(`${base}graph/`);
    assert.equal(state.jobs.length, count);
    await invoke(`${base}graph/index/`, 'POST');
    assert.equal(state.jobs.length, count + 1);
    assert.equal((await invoke<Response>(`${base}graph/?candidateId=missing`)).status, 404);
    assert.equal((await invoke<Response>(`${base}graph/`, 'GET', undefined, false)).status, 403);
    setScenario('empty');
    assert.equal((await invoke<Graph>(`${base}graph/`)).nodes.length, 0);
    setScenario('no-embedding');
    assert.equal((await invoke<Graph>(`${base}graph/`)).index.configured, false);
    assert.equal((await invoke<Response>(`${base}graph/index/`, 'POST')).status, 400);
    setScenario('error');
    assert.equal((await invoke<Response>(`${base}graph/`)).status, 503);
});

test('行情样例、导入校验、重复提交和本地恢复', async () => {
    type Dataset = import('../../types/api/quantDataset').QuantDataset;
    const input = {name: '行情验收', csvText: 'date,open,high,low,close\n2024-01-01,10,12,9,11\n2024-01-02,11,13,10,12', symbol: 'TEST', timeframe: '1d', timezone: 'Asia/Shanghai', source: '', priceAdjustment: ''};
    const created = await invoke<Dataset>(`${base}datasets/`, 'POST', input);
    assert.equal(created.rowCount, 2);
    assert.equal(created.missingVolume, 2);
    assert.equal(created.start, '2023-12-31T16:00:00.000Z');
    assert.equal((await invoke<Dataset>(`${base}datasets/`, 'POST', input)).id, created.id);
    const listed = await invoke<{total: number; items: Dataset[]}>(`${base}datasets/`);
    assert.equal(listed.total, 2);
    assert.equal((await invoke<Dataset>(`${base}datasets/${created.id}/`)).name, input.name);
    assert.equal((await invoke<Response>(`${base}datasets/`, 'POST', {...input, csvText: input.csvText.replace('2024-01-02', '2024-01-01')})).status, 400);
    assert.equal((await invoke<Response>(`${base}datasets/?limit=100`)).status, 400);
    resetQuantStateForTests();
    assert.equal((await invoke<Dataset>(`${base}datasets/${created.id}/`)).rowCount, 2);
    assert.equal((await invoke<Response>(`${base}datasets/`, 'GET', undefined, false)).status, 403);
    setScenario('empty');
    assert.equal((await invoke<{total: number}>(`${base}datasets/`)).total, 0);
    setScenario('error');
    assert.equal((await invoke<Response>(`${base}datasets/`)).status, 503);
});

test('实验接口保留参数大小写、幂等、取消和独立本地恢复', async () => {
    const imported = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'experiment_demo_source_01', code: 'close / close.shift(N) - 1', description: '演示来源'});
    imported.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    await invoke(`${base}entries/${imported.entry.id}/`);
    const candidates = await invoke<{items: import('../../types/api/quant.ts').QuantFactorCandidate[]}>(`${base}factors/`);
    const candidate = candidates.items[0];
    const csvText = 'timestamp,open,high,low,close,volume\n' + Array.from({length: 90}, (_, index) => `${new Date(Date.UTC(2024, 0, index + 1)).toISOString()},100,102,99,101,1000`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Synthetic experiment data', csvText, symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'test fixture'});
    const input: import('../../types/api/quantExperiment.ts').QuantExperimentInput = {
        requestKey: 'experiment_mock_request_01', name: '演示参数实验', datasetId: dataset.id,
        seeds: [{candidateId: candidate.id, bindings: candidate.data.inputs.map(row => ({name: row.name, column: 'close'})), parameters: candidate.data.parameters.map(row => ({name: row.name, value: 5})), variants: []}],
        config: {seed: 42, maxCandidates: 8, generations: 2, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 10},
    };
    const first = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', input);
    assert.equal(first.status, 'pending');
    assert.equal(JSON.parse(first.planJson!).seeds[0].parameters[candidate.data.parameters[0].name], 5);
    assert.equal((await invoke<{id: string}>(`${base}experiments/`, 'POST', input)).id, first.id);
    assert.equal((await invoke<Response>(`${base}experiments/`, 'POST', {...input, name: 'different'})).status, 409);
    assert.equal((await invoke<Response>(`${base}experiments/`, 'POST', {...input, requestKey: 'experiment_invalid_0001', config: {...input.config, maxCandidates: 99}})).status, 400);
    const path = `${base}experiments/${first.id}/`;
    assert.equal((await invoke<{status: string}>(path + 'cancel/', 'POST')).status, 'cancelled');
    resetQuantStateForTests();
    assert.equal((await invoke<{status: string}>(path)).status, 'cancelled');
    assert.equal((await invoke<{total: number}>(`${base}experiments/`)).total, 1);
    assert.equal((await invoke<Response>(path + 'cancel/')).status, 405);
    assert.equal((await invoke<Response>(path, 'GET', undefined, false)).status, 403);
    assert.equal((await invoke<Response>(`${base}experiments/?limit=99`)).status, 400);
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}experiments/`)).total, 0);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}experiments/`)).status, 503);
    setScenario('sample');
    const next = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', {...input, requestKey: 'experiment_with_review_01', seeds: input.seeds.map(seed => ({...seed, variants: [seed.parameters.map(row => ({...row, value: 3}))]}))});
    quantState().experiments.find(row => row.data.id === next.id)!.data.createdAt = new Date(Date.now() - 5000).toISOString();
    const reviewing = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/${next.id}/`);
    const {readSensitivity} = await import('../../utils/quantSensitivity.ts');
    assert.equal(readSensitivity(reviewing.sensitivityJson)?.version, 1);
    assert.equal(readSensitivity(reviewing.sensitivityJson)?.families[0].axes[0].regions.length, 0);
    assert.equal(reviewing.reviewStatus, 'pending');
    assert.equal(reviewing.derivedCandidates?.length, 1);
    const derivedId = reviewing.derivedCandidates![0].id;
    const derived = await invoke<import('../../types/api/quant.ts').QuantFactorCandidate>(`${base}factors/${derivedId}/`);
    assert.equal(derived.data.derivation?.requestId, next.id);
    assert.equal(derived.evidenceStatus, 'local_simulation_unverified_platform');
    assert.deepEqual(derived.data.evidence, []);
    assert.equal(derived.data.parameters[0].defaultValue, '3');
    assert.equal(derived.fingerprints.raw, '');
    const derivedGraph = await invoke<import('../../types/api/quantGraph.ts').QuantGraph>(`${base}graph/?candidateId=${derivedId}`);
    assert.ok(derivedGraph.edges.some(row => row.kind === 'derived_from'));
    assert.ok(!derivedGraph.edges.some(row => row.kind === 'extracted_from' && row.to === `factor:${derivedId}`));
    const {initialSeed, buildSeed} = await import('../../components/Quant/experiments/plan.ts');
    const followup = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', {...input, requestKey: 'derived_followup_demo_01', seeds: [buildSeed(derived, initialSeed(derived), false)]});
    assert.equal(JSON.parse(followup.planJson!).seeds[0].id, derivedId);
    assert.equal((await invoke<{status: string}>(`${base}experiments/${followup.id}/cancel/`, 'POST')).status, 'cancelled');
    resetQuantStateForTests();
    assert.equal((await invoke<import('../../types/api/quant.ts').QuantFactorCandidate>(`${base}factors/${derivedId}/`)).data.derivation?.requestId, next.id);
    assert.ok(reviewing.reviewContext);
    const owner = quantState().entries.find(row => row.id === reviewing.reviewContext!.entryId)!;
    owner.runs.find(row => row.experimentResultId === reviewing.reviewContext!.experimentResultId)!.createdAt = new Date(Date.now() - 5000).toISOString();
    const reviewed = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/${next.id}/`);
    const report = reviewed.reviews![0].report!;
    assert.equal(reviewed.reviewStatus, 'completed');
    assert.equal(report.schemaVersion, 4);
    assert.equal(report.data.totalScore, null);
    assert.match(report.markdown, /本地界面样例/);
    const proposal = reviewed.reviews![0].proposal!;
    assert.ok(proposal);
    const {readProposal} = await import('../../components/Quant/experiments/proposal.ts');
    const design = readProposal(proposal);
    assert.equal(design.demo, true);
    assert.ok(design.seeds[0].variants.length);
    const proposalInput = {...input, name: design.name, config: design.config, seeds: design.seeds, proposalId: proposal.id, requestKey: 'ai_proposal_mock_adopt_01'};
    const adopted = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', proposalInput);
    assert.equal(JSON.parse(adopted.planJson!).version, 2);
    assert.equal(JSON.parse(adopted.planJson!).proposal_adapted, false);
    assert.equal((await invoke<{id: string}>(`${base}experiments/`, 'POST', proposalInput)).id, adopted.id);
    const adjusted = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', {...proposalInput, requestKey: 'ai_proposal_mock_adjust_01', config: {...design.config, feeBps: 7}});
    assert.equal(JSON.parse(adjusted.planJson!).proposal_adapted, true);
    assert.equal((await invoke<Response>(`${base}experiments/`, 'POST', {...proposalInput, requestKey: 'ai_proposal_mock_invalid01', proposalId: 'missing'})).status, 400);
    await invoke(`${base}experiments/${adopted.id}/cancel/`, 'POST');
    await invoke(`${base}experiments/${adjusted.id}/cancel/`, 'POST');
    resetQuantStateForTests();
    const restored = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/${next.id}/`);
    assert.equal(restored.reviews![0].proposal!.dataJson, proposal.dataJson);
    const secondDataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Second campaign fixture', csvText: csvText.replace(/2024-/g, '2020-'), symbol: 'SECOND', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'test'});
    const campaignInput = {requestKey: 'campaign_mock_start_01', name: '连续研究样例', proposalId: proposal.id, datasetIds: [dataset.id, secondDataset.id], maxRounds: 2, maxAttempts: 64, computeSeconds: 120, wallSeconds: 600, modelId: ''};
    const campaign = await invoke<import('../../types/api/quantCampaign.ts').QuantCampaign>(`${base}campaigns/`, 'POST', campaignInput);
    assert.equal(campaign.status, 'pending');
    assert.equal((await invoke<{id: string}>(`${base}campaigns/`, 'POST', campaignInput)).id, campaign.id);
    const campaignPath = `${base}campaigns/${campaign.id}/`;
    for (let index = 0; index < 2; index++) {
        const running = await invoke<import('../../types/api/quantCampaign.ts').QuantCampaign>(campaignPath);
        assert.equal(running.rounds.length, index + 1);
        const experiment = quantState().experiments.find(row => row.data.id === running.rounds[index].experiment.id)!;
        experiment.data.createdAt = new Date(Date.now() - 5000).toISOString();
        await invoke(campaignPath);
        for (const entry of quantState().entries) for (const run of entry.runs) if (run.experimentResultId === experiment.data.reviewContext?.experimentResultId) run.createdAt = new Date(Date.now() - 5000).toISOString();
        await invoke(campaignPath);
    }
    const finished = await invoke<import('../../types/api/quantCampaign.ts').QuantCampaign>(campaignPath);
    assert.equal(finished.status, 'completed'); assert.equal(finished.reason, 'round_budget'); assert.equal(finished.modelCalls, 2);
    assert.equal(finished.rounds.length, 2); assert.equal(finished.reservedAttempts, design.config.maxCandidates * 2);
    const stopped = await invoke<import('../../types/api/quantCampaign.ts').QuantCampaign>(`${base}campaigns/`, 'POST', {...campaignInput, requestKey: 'campaign_mock_stop_001'});
    const started = await invoke<import('../../types/api/quantCampaign.ts').QuantCampaign>(`${base}campaigns/${stopped.id}/`);
    assert.equal((await invoke<{status: string}>(`${base}campaigns/${stopped.id}/cancel/`, 'POST')).status, 'cancelled');
    assert.equal((await invoke<{status: string}>(`${base}experiments/${started.rounds[0].experiment.id}/`)).status, 'cancelled');
    resetQuantStateForTests();
    assert.equal((await invoke<{reason: string}>(campaignPath)).reason, 'round_budget');
    assert.equal((await invoke<Response>(`${base}campaigns/`, 'POST', {...campaignInput, requestKey: 'campaign_invalid_0001', maxRounds: 99})).status, 400);
    assert.equal((await invoke<Response>(`${base}campaigns/missing/`)).status, 404);
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}campaigns/`)).total, 0);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}campaigns/`)).status, 503);
    setScenario('sample');
    const revision = await invoke<import('../../types/api/quant.ts').QuantReport>(`${base}entries/${owner.id}/reports/${report.id}/`, 'PATCH', {markdown: '人工修改实验解读', expectedRevisionId: ''});
    assert.equal(revision.markdown, '人工修改实验解读');
    assert.match(revision.originalMarkdown, /本地界面样例/);
    const retry = await invoke<QuantAIRun>(`${base}entries/${owner.id}/runs/`, 'POST', {kind: 'experiment_review', ...reviewing.reviewContext, requestKey: 'experiment_review_retry_01'});
    assert.equal(retry.status, 'pending');
    assert.equal((await invoke<QuantAIRun>(`${base}entries/${owner.id}/runs/${retry.id}/cancel/`, 'POST')).status, 'cancelled');
    const invalid = await invoke<Response>(`${base}entries/${owner.id}/runs/`, 'POST', {kind: 'experiment_review', ...reviewing.reviewContext, experimentResultId: 'missing', requestKey: 'experiment_review_bad_01'});
    assert.equal(invalid.status, 400);
});


test('混合检索展示词法/语义依据，尊重文集、筛选、错误与空状态', async () => {
    const entry = await invoke<QuantEntryDetail>(entryBase);
    await invoke(`${entryBase}runs/`, 'POST', {kind: 'analyze', sourceId: entry.sources![0].id, requestKey: 'hybrid_search_local_001'});
    const run = entry.runs.find(row => row.kind === 'analyze')!; run.createdAt = '2020-01-01T00:00:00Z';
    await invoke(entryBase);
    const path = `${base}factors/search/`;
    const result = await invoke<import('../../types/api/quantRetrieval.ts').QuantSearchResult>(path, 'POST', {q: '上涨强度', groupBy: 'expression'});
    assert.ok(result.items.length > 0);
    assert.equal(result.search.semanticStatus, 'local_demo');
    assert.ok(result.items.every(row => row.searchMatch!.semanticSimilarity === .82));
    const empty = await invoke<import('../../types/api/quantRetrieval.ts').QuantSearchResult>(path, 'POST', {q: '上涨强度', role: 'display'});
    assert.equal(empty.total, 0);
    assert.equal((await invoke<Response>(path, 'POST', {q: ''})).status, 400);
    assert.equal((await invoke<Response>(path, 'POST', {q: '上涨强度'}, false)).status, 403);
    assert.equal((await invoke<Response>('/api/quant/foreign/factors/search/', 'POST', {q: '上涨强度'})).status, 404);
    setScenario('error'); assert.equal((await invoke<Response>(path, 'POST', {q: '上涨强度'})).status, 503);
    setScenario('empty'); assert.equal((await invoke<import('../../types/api/quantRetrieval.ts').QuantSearchResult>(path, 'POST', {q: '上涨强度'})).total, 0);
});

test('公式演化 local 链路保留变换、回库、AI 下一轮配置和刷新记录', async () => {
    const source = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'evolution_source_0001', code: 'def momentum(close, lookback=20): return close.pct_change(lookback)'});
    source.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const detail = await invoke<QuantEntryDetail>(`${base}entries/${source.entry.id}/`);
    const {readProposal} = await import('../../components/Quant/experiments/proposal.ts');
    const {readExperiment} = await import('../../components/Quant/experiments/readout.ts');
    const {defaultEvolution} = await import('../../utils/quantEvolution.ts');
    const plan = readProposal(detail.reports![0].proposal!);
    plan.config.evolution = {...defaultEvolution, operators: ['lag']};
    const rows = Array.from({length: 90}, (_, i) => `${new Date(Date.UTC(2024, 0, i + 1)).toISOString()},100,102,99,101,500`);
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Evolution fixture', csvText: ['timestamp,open,high,low,close,volume', ...rows].join('\n'), symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'test'});
    const input = {requestKey: 'evolution_run_00001', name: plan.name, datasetId: dataset.id, config: plan.config, seeds: plan.seeds};
    type Experiment = import('../../types/api/quantExperiment.ts').QuantExperiment;
    const started = await invoke<Experiment>(`${base}experiments/`, 'POST', input);
    quantState().experiments.find(row => row.data.id === started.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const completed = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    assert.equal(readExperiment(completed).engineVersion, 'quant-local-search-3');
    assert.ok(readExperiment(completed).attempts.some(row => row.transformation?.operator === 'lag'));
    const derived = await invoke<import('../../types/api/quant.ts').QuantFactorCandidate>(`${base}factors/${completed.derivedCandidates![0].id}/`);
    assert.equal(derived.data.derivation!.transformation?.operator, 'lag');
    assert.equal(derived.data.expression!.op, 'lag');
    const run = completed.reviews![0].run;
    quantState().entries.find(row => row.id === run.entryId)!.runs.find(row => row.id === run.id)!.createdAt = '2020-01-01T00:00:00Z';
    const reviewed = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    const proposal = reviewed.reviews![0].proposal!;
    const next = readProposal(proposal);
    assert.deepEqual(next.config.evolution, plan.config.evolution);
    const adopted = await invoke<Experiment>(`${base}experiments/`, 'POST', {...input, requestKey: 'evolution_next_00001', name: next.name, proposalId: proposal.id, config: next.config, seeds: next.seeds});
    assert.equal(JSON.parse(adopted.planJson!).proposal_adapted, false);
    assert.equal(readExperiment(adopted).evolution!.maxNodes, 96);
    resetQuantStateForTests();
    assert.equal(readExperiment(await invoke<Experiment>(`${base}experiments/${started.id}/`)).attempts.filter(row => row.transformation).length, 1);
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}experiments/`)).total, 0);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}experiments/${started.id}/`)).status, 503);
});

test('门控回库继承双方条件参数、输入绑定，可作为排序实验父代并刷新恢复', async () => {
    type Candidate = import('../../types/api/quant.ts').QuantFactorCandidate;
    type Experiment = import('../../types/api/quantExperiment.ts').QuantExperiment;
    const {buildSeed, initialSeed} = await import('../../components/Quant/experiments/plan.ts');
    const {defaultEvolution} = await import('../../utils/quantEvolution.ts');
    const {readExperiment} = await import('../../components/Quant/experiments/readout.ts');
    const parents: Candidate[] = [];
    for (const [index, marker] of ['', '// LOCAL_BOOLEAN_FILTER'].entries()) {
        const source = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {
            requestKey: `gate_source_local_000${index}`, code: `// LOCAL_PARAMETER_CONDITION\n${marker}\nclose / close[20] - 1`});
        source.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
        const detail = await invoke<QuantEntryDetail>(`${base}entries/${source.entry.id}/`);
        const list = await invoke<{items: Candidate[]}>(`${base}factors/?groupBy=none`);
        parents.push(list.items.find(row => row.reportId === detail.reports![0].id)!);
    }
    assert.equal(parents[1].data.outputType, 'boolean_series');
    const rows = Array.from({length: 90}, (_, i) => `${new Date(Date.UTC(2024, 0, i + 1)).toISOString()},100,102,99,101,500`);
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Gate fixture', csvText: ['timestamp,open,high,low,close,volume', ...rows].join('\n'), symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'test'});
    const input: import('../../types/api/quantExperiment.ts').QuantExperimentInput = {requestKey: 'gate_run_local_00001', name: '条件门控', datasetId: dataset.id,
        seeds: parents.map(row => buildSeed(row, initialSeed(row), false)),
        config: {seed: 42, maxCandidates: 16, generations: 3, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 30, evolution: {...defaultEvolution, operators: ['gate']}}};
    const started = await invoke<Experiment>(`${base}experiments/`, 'POST', input);
    quantState().experiments.find(row => row.data.id === started.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const completed = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    const child = await invoke<Candidate>(`${base}factors/${completed.derivedCandidates![0].id}/`);
    assert.deepEqual(child.data.derivation!.parentCandidateIds, parents.map(row => row.id));
    assert.equal(child.data.expression!.op, 'gate');
    assert.deepEqual(child.data.inputs.map(row => row.name), ['close']);
    assert.deepEqual(child.data.parameters.map(row => row.name).sort(), ['a_enabled', 'a_lookback', 'a_slow', 'b_enabled', 'b_lookback', 'b_slow']);
    const draft = initialSeed(child);
    const seed = buildSeed(child, draft, false);
    for (const prefix of ['a_', 'b_']) assert.throws(() => buildSeed(child, {...draft, parameters: {...draft.parameters, [`${prefix}lookback`]: '35'}}, false), /条件约束/);
    const next = await invoke<Experiment>(`${base}experiments/`, 'POST', {...input, requestKey: 'gate_rank_next_00001', seeds: [seed], config: {...input.config, evolution: {...defaultEvolution, operators: ['ts_rank']}}});
    quantState().experiments.find(row => row.data.id === next.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const ranked = await invoke<Experiment>(`${base}experiments/${next.id}/`);
    const grandchild = await invoke<Candidate>(`${base}factors/${ranked.derivedCandidates![0].id}/`);
    assert.equal(grandchild.data.expression!.op, 'ts_rank');
    assert.equal(grandchild.data.units, 'dimensionless');
    assert.deepEqual(grandchild.data.parameters, child.data.parameters);
    buildSeed(grandchild, initialSeed(grandchild), false);
    resetQuantStateForTests();
    assert.equal(readExperiment(await invoke<Experiment>(`${base}experiments/${next.id}/`)).attempts.find(row => row.transformation)?.transformation?.operator, 'ts_rank');
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}factors/`)).total, 0);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}factors/${child.id}/`)).status, 503);
    setScenario('slow'); assert.equal((await invoke<Candidate>(`${base}factors/${child.id}/`)).id, child.id);
});

test('公式交叉 local 保存路径与双方参数，结果、回库和刷新可读', async () => {
    type Candidate = import('../../types/api/quant.ts').QuantFactorCandidate;
    type Experiment = import('../../types/api/quantExperiment.ts').QuantExperiment;
    const {buildSeed, initialSeed} = await import('../../components/Quant/experiments/plan.ts');
    const {defaultEvolution} = await import('../../utils/quantEvolution.ts');
    const {readExperiment} = await import('../../components/Quant/experiments/readout.ts');
    const parents: Candidate[] = [];
    for (const index of [0, 1]) {
        const source = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: `crossover_local_source${index}`, code: `# parent ${index}\nclose / close.shift(20) - 1`});
        source.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
        const detail = await invoke<QuantEntryDetail>(`${base}entries/${source.entry.id}/`);
        const list = await invoke<{items: Candidate[]}>(`${base}factors/?groupBy=none`);
        parents.push(list.items.find(row => row.reportId === detail.reports![0].id)!);
    }
    const csvText = 'timestamp,open,high,low,close,volume\n' + Array.from({length: 90}, (_, i) => `${new Date(Date.UTC(2024, 0, i + 1)).toISOString()},100,102,99,101,500`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Crossover fixture', csvText, symbol: 'TEST', timeframe: '1d', timezone: 'UTC', source: 'synthetic', priceAdjustment: ''});
    const input: import('../../types/api/quantExperiment.ts').QuantExperimentInput = {requestKey: 'crossover_local_run001', name: '片段交叉', datasetId: dataset.id,
        seeds: parents.map(row => buildSeed(row, initialSeed(row), false)),
        config: {seed: 42, maxCandidates: 16, generations: 3, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 30, evolution: {...defaultEvolution, version: 3, operators: ['crossover']}}};
    const started = await invoke<Experiment>(`${base}experiments/`, 'POST', input);
    quantState().experiments.find(row => row.data.id === started.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const completed = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    const mutation = readExperiment(completed).attempts.find(row => row.transformation)!;
    assert.equal(mutation.status, 'evaluated');
    assert.deepEqual(mutation.transformation!.recipientPath, [0]);
    assert.deepEqual(mutation.transformation!.donorPath, []);
    const child = await invoke<Candidate>(`${base}factors/${completed.derivedCandidates![0].id}/`);
    assert.deepEqual(child.data.derivation!.transformation!.recipientPath, [0]);
    assert.deepEqual(child.data.derivation!.parentCandidateIds, parents.map(row => row.id));
    assert.deepEqual(child.data.parameters.map(row => row.name).sort(), ['a_lookback', 'b_lookback']);
    buildSeed(child, initialSeed(child), false);
    resetQuantStateForTests();
    assert.deepEqual(readExperiment(await invoke<Experiment>(`${base}experiments/${started.id}/`)).attempts.find(row => row.transformation)!.transformation, mutation.transformation);
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}experiments/`)).total, 0);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}experiments/${started.id}/`)).status, 503);
    setScenario('slow'); assert.equal((await invoke<Experiment>(`${base}experiments/${started.id}/`)).id, started.id);
});

test('滚动验证 local 链路保留逐折结果、末折回库与后续方案', async () => {
    const source = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'temporal_source_0001', code: 'def momentum(close, lookback=20): return close.pct_change(lookback)'});
    source.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const detail = await invoke<QuantEntryDetail>(`${base}entries/${source.entry.id}/`);
    const {readProposal} = await import('../../components/Quant/experiments/proposal.ts');
    const {readExperiment} = await import('../../components/Quant/experiments/readout.ts');
    const {defaultEvolution} = await import('../../utils/quantEvolution.ts');
    const plan = readProposal(detail.reports![0].proposal!);
    plan.config.evolution = {...defaultEvolution, operators: ['lag']};
    const {defaultWalkForward} = await import('../../utils/quantTemporal.ts');
    plan.config.walkForward = {...defaultWalkForward};
    plan.config.maxCandidates = 24;
    const rows = Array.from({length: 90}, (_, i) => `${new Date(Date.UTC(2024, 0, i + 1)).toISOString()},100,102,99,101,500`);
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Evolution fixture', csvText: ['timestamp,open,high,low,close,volume', ...rows].join('\n'), symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'test'});
    const input = {requestKey: 'temporal_run_00001', name: plan.name, datasetId: dataset.id, config: plan.config, seeds: plan.seeds};
    type Experiment = import('../../types/api/quantExperiment.ts').QuantExperiment;
    const started = await invoke<Experiment>(`${base}experiments/`, 'POST', input);
    quantState().experiments.find(row => row.data.id === started.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const completed = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    assert.equal(readExperiment(completed).engineVersion, 'quant-local-search-4');
    assert.ok(readExperiment(completed).attempts.some(row => row.transformation?.operator === 'lag'));
    const derived = await invoke<import('../../types/api/quant.ts').QuantFactorCandidate>(`${base}factors/${completed.derivedCandidates![0].id}/`);
    assert.equal(readExperiment(completed).temporal!.folds.length, 3);
    assert.equal(readExperiment(completed).attempts.find(row => row.id === derived.data.derivation!.attemptId)!.fold, 3);
    assert.equal(derived.data.derivation!.transformation?.operator, 'lag');
    assert.equal(derived.data.expression!.op, 'lag');
    const run = completed.reviews![0].run;
    quantState().entries.find(row => row.id === run.entryId)!.runs.find(row => row.id === run.id)!.createdAt = '2020-01-01T00:00:00Z';
    const reviewed = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    const proposal = reviewed.reviews![0].proposal!;
    const next = readProposal(proposal);
    assert.deepEqual(next.config.walkForward, plan.config.walkForward);
    assert.deepEqual(next.config.evolution, plan.config.evolution);
    const adopted = await invoke<Experiment>(`${base}experiments/`, 'POST', {...input, requestKey: 'temporal_next_00001', name: next.name, proposalId: proposal.id, config: next.config, seeds: next.seeds});
    assert.equal(JSON.parse(adopted.planJson!).proposal_adapted, false);
    assert.equal(readExperiment(adopted).evolution!.maxNodes, 96);
    resetQuantStateForTests();
    assert.equal(readExperiment(await invoke<Experiment>(`${base}experiments/${started.id}/`)).attempts.filter(row => row.transformation).length, 3);
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}experiments/`)).total, 0);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}experiments/${started.id}/`)).status, 503);
});


test('字符串枚举 local 从报告到实验保留文字值，导出提供模式参数预览', async () => {
    const entry = await invoke<QuantEntryDetail>(entryBase);
    entry.sources![0].payload.code = '// LOCAL_STRING_PARAMETER';
    await invoke(`${entryBase}runs/`, 'POST', {kind: 'analyze', sourceId: entry.sources![0].id, requestKey: 'string_parameter_local001'});
    entry.runs.find(row => row.kind === 'analyze')!.createdAt = '2020-01-01T00:00:00Z';
    await invoke(entryBase);
    const factors = await invoke<{items: import('../../types/api/quant.ts').QuantFactorCandidate[]}>(`${base}factors/`);
    const candidate = factors.items.find(row => row.entryId === entry.id && row.data.parameters.some(p => p.name === 'mode'))!;
    assert.equal(candidate.data.parameters[1].domain?.version, 3);
    for (const target of ['python', 'pine', 'mql4', 'tongdaxin']) {
        const exported = await invoke<import('../../types/api/quantExport').QuantExportBundle>(`${base}factors/${candidate.id}/export/?target=${target}`);
        const manifest = JSON.parse(exported.manifestJson);
        assert.equal(manifest.local_demo, true);
        assert.equal(manifest.verification, 'platform_compile_and_equivalence_pending');
        if (target === 'tongdaxin') {
            assert.deepEqual(manifest.categorical_encoding.values, [{code: 1, value: 'reverse'}, {code: 2, value: 'trend'}]);
            assert.match(exported.code, /P1:=2/);
        } else assert.match(exported.code, /"trend"/);
    }
    const {buildSeed, initialSeed} = await import('../../components/Quant/experiments/plan.ts');
    const {readProposal} = await import('../../components/Quant/experiments/proposal.ts');
    const report = entry.reports!.find(row => row.sourceId === candidate.sourceId)!;
    const suggested = readProposal(report.proposal!);
    assert.equal(suggested.drafts[candidate.id].parameters.mode, '"trend"');
    const csvText = 'timestamp,open,high,low,close,volume\n' + Array.from({length: 90}, (_, index) => `${new Date(Date.UTC(2024, 0, index + 1)).toISOString()},100,102,99,101,1000`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'String fixture', csvText, symbol: 'TEST', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'synthetic'});
    const input: import('../../types/api/quantExperiment.ts').QuantExperimentInput = {requestKey: 'string_experiment_local01', name: '字符串样例', datasetId: dataset.id,
        seeds: [buildSeed(candidate, initialSeed(candidate), false)], config: {seed: 1, maxCandidates: 8, generations: 1, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 5}};
    input.seeds[0].parameters.find(row => row.name === 'mode')!.value = 'UNKNOWN';
    assert.equal((await invoke<Response>(`${base}experiments/`, 'POST', input)).status, 400);
    input.seeds[0].parameters.find(row => row.name === 'mode')!.value = 'reverse';
    const created = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/`, 'POST', input);
    quantState().experiments.find(row => row.data.id === created.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const finished = await invoke<import('../../types/api/quantExperiment.ts').QuantExperiment>(`${base}experiments/${created.id}/`);
    assert.match(finished.attemptsJson!, /reverse/);
    const {readExperiment} = await import('../../components/Quant/experiments/readout.ts');
    assert.equal(readExperiment(finished).seeds[0].parameters.find(([name]) => name === 'mode')?.[1], 'reverse');
    resetQuantStateForTests();
    assert.deepEqual((await invoke<import('../../types/api/quant.ts').QuantFactorCandidate>(`${base}factors/${candidate.id}/`)).data.parameters[1].domain?.choices, ['trend', 'reverse']);
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}factors/`)).total, 0);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}factors/`)).status, 503);
});

test('算术参数 local 从收集到报告、合规方案与导出完整保留v4规则，非法手工变体留痕', async () => {
    type Candidate = import('../../types/api/quant.ts').QuantFactorCandidate;
    type Experiment = import('../../types/api/quantExperiment.ts').QuantExperiment;
    const {readProposal} = await import('../../components/Quant/experiments/proposal.ts');
    const {buildSeed, initialSeed} = await import('../../components/Quant/experiments/plan.ts');
    const {conditionReferences, evaluateParameterCondition} = await import('../../utils/quantParameterConditions.ts');
    const code = '# LOCAL_ARITHMETIC_PARAMETERS\nlookback=20\nslow=30\nenabled=True\n# enabled=true -> lookback*2+slow <= 80';
    const collected = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'arithmetic_local_source_01', code, language: 'python'});
    collected.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const entry = await invoke<QuantEntryDetail>(`${base}entries/${collected.entry.id}/`);
    const report = entry.reports![0];
    assert.deepEqual(report.data.factors![0].parameters.map(row => [row.name, row.defaultValue]), [['lookback', '20'], ['slow', '30'], ['enabled', 'true']]);
    assert.match(report.markdown, /lookback × 2/);
    assert.match(report.markdown, /\| slow \| 30/);
    assert.match(report.markdown, /\| enabled \| true/);
    const candidate = (await invoke<{items: Candidate[]}>(`${base}factors/?groupBy=none`)).items.find(row => row.reportId === report.id)!;
    assert.equal(candidate.data.parameters[0].domain!.version, 4);
    assert.equal(candidate.data.parameters[0].domain!.evidence[0].quote, code);
    const frozen = JSON.stringify(candidate.data.parameters);
    const plan = readProposal(report.proposal!);
    assert.deepEqual(plan.seeds[0].variants.map(group => group.find(row => row.name === 'lookback')!.value), [15, 25]);
    assert.ok(!plan.seeds[0].variants.some(group => group.some(row => row.name === 'lookback' && row.value === 30)));
    assert.throws(() => buildSeed(candidate, {...initialSeed(candidate), parameters: {...initialSeed(candidate).parameters, lookback: '30'}}, false), /条件约束/);
    for (const target of ['python', 'pine', 'mql4', 'tongdaxin']) {
        const bundle = await invoke<import('../../types/api/quantExport').QuantExportBundle>(`${base}factors/${candidate.id}/export/?target=${target}`);
        const manifest = JSON.parse(bundle.manifestJson);
        const domain = manifest.parameter_domains[0].domain;
        assert.equal(domain.version, 4);
        assert.equal(domain.evidence[0].quote, code);
        assert.deepEqual(conditionReferences(domain.conditions[0].require).sort(), ['p1', 'p2']);
        assert.equal(evaluateParameterCondition(domain.conditions[0].require, {p0: true, p1: 25, p2: 30}, 4), true);
        assert.equal(evaluateParameterCondition(domain.conditions[0].require, {p0: true, p1: 30, p2: 30}, 4), false);
        assert.equal(manifest.verification, 'platform_compile_and_equivalence_pending');
    }
    const csvText = 'timestamp,open,high,low,close,volume\n' + Array.from({length: 90}, (_, index) => `${new Date(Date.UTC(2024, 0, index + 1)).toISOString()},100,102,99,101,1000`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Arithmetic artificial data', csvText, symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', priceAdjustment: '', source: 'synthetic'});
    const validInput = {requestKey: 'arithmetic_valid_experiment', name: '完整合规算术参数组 · 人工样例', datasetId: dataset.id, seeds: [structuredClone(plan.seeds[0])], config: plan.config};
    const validStarted = await invoke<Experiment>(`${base}experiments/`, 'POST', validInput);
    quantState().experiments.find(row => row.data.id === validStarted.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const validCompleted = await invoke<Experiment>(`${base}experiments/${validStarted.id}/`);
    type Attempt = {status: string; reason: string; requested_parameters: {lookback: number; slow: number; enabled: boolean}};
    const validAttempts = JSON.parse(validCompleted.attemptsJson!) as Attempt[];
    assert.equal(validAttempts.length, 3);
    assert.deepEqual(validAttempts.map(row => row.requested_parameters), [{lookback: 20, slow: 30, enabled: true}, {lookback: 15, slow: 30, enabled: true}, {lookback: 25, slow: 30, enabled: true}]);
    assert.ok(validAttempts.every(row => row.status === 'evaluated'));
    const frozenCompleted = validCompleted.attemptsJson;
    const input = {...structuredClone(validInput), requestKey: 'arithmetic_local_experiment', name: '手工追加非法算术变体 · 人工样例'};
    input.seeds[0].variants.push(input.seeds[0].parameters.map(row => row.name === 'lookback' ? {...row, value: 30} : {...row}));
    const invalid = structuredClone(input); invalid.seeds[0].parameters.find(row => row.name === 'lookback')!.value = 30;
    assert.equal((await invoke<Response>(`${base}experiments/`, 'POST', invalid)).status, 400);
    const started = await invoke<Experiment>(`${base}experiments/`, 'POST', input);
    quantState().experiments.find(row => row.data.id === started.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const completed = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    const attempts = JSON.parse(completed.attemptsJson!) as Attempt[];
    assert.equal(attempts.length, 4);
    assert.deepEqual(attempts.map(row => row.requested_parameters.lookback), [20, 15, 25, 30]);
    assert.deepEqual(attempts.map(row => row.status), ['evaluated', 'evaluated', 'evaluated', 'rejected']);
    assert.match(attempts[3].reason, /条件约束/);
    assert.ok(attempts.every(row => row.requested_parameters.slow === 30 && row.requested_parameters.enabled === true));
    resetQuantStateForTests();
    assert.equal(JSON.stringify((await invoke<Candidate>(`${base}factors/${candidate.id}/`)).data.parameters), frozen);
    assert.equal((await invoke<Experiment>(`${base}experiments/${validStarted.id}/`)).attemptsJson, frozenCompleted);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}factors/${candidate.id}/`)).status, 503);
    setScenario('slow'); assert.equal((await invoke<Candidate>(`${base}factors/${candidate.id}/`)).data.parameters[0].domain!.version, 4);
    setScenario('empty'); assert.equal((await invoke<{items: Candidate[]}>(`${base}factors/`)).items.length, 0);
});

test('联合参数 local 四点组合、读取边界、刷新和四态贯通', async () => {
    type Candidate = import('../../types/api/quant.ts').QuantFactorCandidate;
    type Experiment = import('../../types/api/quantExperiment.ts').QuantExperiment;
    const {readJointSensitivity} = await import('../../utils/quantJointSensitivity.ts');
    const {readExperiment} = await import('../../components/Quant/experiments/readout.ts');
    const source = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'joint_local_source_001', code: '# LOCAL_JOINT_PARAMETERS\nlookback=20\nthreshold=0.01'});
    source.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const detail = await invoke<QuantEntryDetail>(`${base}entries/${source.entry.id}/`);
    const factors = await invoke<{items: Candidate[]}>(`${base}factors/?groupBy=none`);
    const parent = factors.items.find(row => row.reportId === detail.reports![0].id)!;
    assert.equal(JSON.parse(detail.reports![0].proposal!.dataJson).seeds[0].variants.length, 3);
    const csvText = 'timestamp,open,high,low,close,volume\n' + Array.from({length: 90}, (_, i) => `${new Date(Date.UTC(2024, 0, i + 1)).toISOString()},100,102,99,101,500`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Joint fixture', csvText, symbol: 'TEST', timeframe: '1d', timezone: 'UTC', source: 'synthetic', priceAdjustment: ''});
    const parameters = (n: number, t: number) => [{name: 'lookback', value: n}, {name: 'threshold', value: t}];
    const input: import('../../types/api/quantExperiment.ts').QuantExperimentInput = {requestKey: 'joint_local_experiment001', name: '联合参数四点', datasetId: dataset.id,
        seeds: [{candidateId: parent.id, bindings: [{name: 'close', column: 'close'}], parameters: parameters(20, .01), variants: [parameters(20, .02), parameters(30, .01), parameters(30, .02)]}],
        config: {seed: 42, maxCandidates: 4, generations: 1, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 30}};
    const started = await invoke<Experiment>(`${base}experiments/`, 'POST', input);
    quantState().experiments.find(row => row.data.id === started.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const completed = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    const analysis = readExperiment(completed).jointSensitivity!;
    const group = analysis.families[0].contexts[0];
    assert.equal(group.compared_points, 4);
    assert.equal(group.regions.length, 1);
    assert.deepEqual(group.regions[0].sampled_values, {lookback: [20, 30], threshold: [.01, .02]});
    assert.match(analysis.limitations[0], /人工/);
    const queued = quantState().entries.find(row => row.id === source.entry.id)!.runs.find(row => row.kind === 'experiment_review')!;
    queued.createdAt = '2020-01-01T00:00:00Z';
    const reviewed = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    assert.equal(reviewed.reviewStatus, 'completed');
    assert.match(reviewed.reviews![0].report!.markdown, /parameter_joint_sensitivity/);
    assert.equal(JSON.parse(reviewed.reviews![0].proposal!.dataJson).seeds[0].variants.length, 3);

    assert.equal(readJointSensitivity(undefined), undefined);
    const corrupt = structuredClone(analysis); corrupt.families[0].contexts[0].regions[0].attempt_ids.pop();
    assert.throws(() => readJointSensitivity(JSON.stringify(corrupt)), /联合参数/);
    const version = structuredClone(analysis) as {version: number}; version.version = 2;
    assert.throws(() => readJointSensitivity(JSON.stringify(version)), /联合参数/);
    resetQuantStateForTests();
    assert.deepEqual(readExperiment(await invoke<Experiment>(`${base}experiments/${started.id}/`)).jointSensitivity, analysis);
    const listed = await invoke<{items: Experiment[]}>(`${base}experiments/`);
    assert.equal(listed.items.find(row => row.id === started.id)!.jointSensitivityJson, undefined);
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}experiments/`)).total, 0);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}experiments/${started.id}/`)).status, 503);
    setScenario('slow'); assert.equal(readExperiment(await invoke<Experiment>(`${base}experiments/${started.id}/`)).jointSensitivity!.families[0].contexts[0].regions.length, 1);
});

test('策略 local 首轮AI方案→显式配置→账本→复核下一轮，旧引擎与四态保持', async () => {
    type Experiment = import('../../types/api/quantExperiment.ts').QuantExperiment;
    const {readProposal} = await import('../../components/Quant/experiments/proposal.ts');
    const {readExperiment} = await import('../../components/Quant/experiments/readout.ts');
    const source = await invoke<{entry: QuantEntryDetail}>(`${base}intake/`, 'POST', {requestKey: 'strategy_local_source001', code: '# LOCAL_STRATEGY\nlookback=20'});
    source.entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    const detail = await invoke<QuantEntryDetail>(`${base}entries/${source.entry.id}/`);
    const original = detail.reports![0].proposal!;
    const prepared = readProposal(original);
    assert.equal(prepared.config.strategy!.positionFraction, .5);
    const csvText = 'timestamp,open,high,low,close,volume\n' + Array.from({length: 90}, (_, i) => `${new Date(Date.UTC(2024, 0, i + 1)).toISOString()},100,102,99,101,500`).join('\n');
    const dataset = await invoke<{id: string}>(`${base}datasets/`, 'POST', {name: 'Strategy fixture', csvText, symbol: 'TEST', timeframe: '1d', timezone: 'UTC', source: 'synthetic', priceAdjustment: ''});
    const input = {requestKey: 'strategy_local_experiment', name: prepared.name, datasetId: dataset.id, seeds: prepared.seeds, config: prepared.config, proposalId: original.id};
    const bad = structuredClone(input); bad.config.strategy!.positionFraction = 0;
    assert.equal((await invoke<Response>(`${base}experiments/`, 'POST', bad)).status, 400);
    const started = await invoke<Experiment>(`${base}experiments/`, 'POST', input);
    quantState().experiments.find(row => row.data.id === started.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const complete = await invoke<Experiment>(`${base}experiments/${started.id}/`), readout = readExperiment(complete);
    assert.equal(readout.engineVersion, 'quant-local-search-5'); assert.equal(readout.demo, true);
    assert.equal(readout.final!.execution!.trades!.length, 2); assert.equal(readout.baseline!.execution!.baseline, true);
    assert.equal(readout.attempts[0].train!.execution!.ledgerScope, 'summary_only');
    assert.deepEqual(readout.strategy, prepared.config.strategy);
    const queued = quantState().entries.find(row => row.id === source.entry.id)!.runs.find(row => row.kind === 'experiment_review')!;
    queued.createdAt = '2020-01-01T00:00:00Z';
    const reviewed = await invoke<Experiment>(`${base}experiments/${started.id}/`);
    const next = reviewed.reviews?.find(row => row.proposal)?.proposal;
    assert.ok(next); assert.deepEqual(readProposal(next).config.strategy, prepared.config.strategy);
    const {readVerification} = await import('../../utils/quantVerification.ts');
    const verification = await invoke<import('../../types/api/quantVerification.ts').QuantVerification>(`${base}factors/${prepared.seeds[0].candidateId}/verification/`);
    assert.ok(verification.items.length); verification.items.forEach(row => readVerification(row.dataJson));
    const {readStrategyExport} = await import('../../utils/quantStrategyExport.ts');
    const exportPath = `${base}experiments/${started.id}/strategy-export/`;
    const before = (await invoke<QuantEntryDetail>(`${base}entries/${source.entry.id}/`)).implementations.length;
    const preview = await invoke<import('../../types/api/quantStrategyExport.ts').QuantStrategyExport>(exportPath + '?attemptId=attempt-1');
    const native = readStrategyExport(preview.manifestJson);
    assert.equal(native.context.attempt_id, 'attempt-1'); assert.equal(native.local_demo, true);
    assert.match(preview.code, /NON-EXECUTING ARTIFICIAL/); assert.doesNotMatch(preview.code, /OrderSend/);
    assert.equal((await invoke<QuantEntryDetail>(`${base}entries/${source.entry.id}/`)).implementations.length, before);
    const archived = await invoke<import('../../types/api/quantStrategyExport.ts').QuantStrategyArtifact>(exportPath, 'POST', {attemptId: 'attempt-1'});
    assert.equal((await invoke<typeof archived>(exportPath, 'POST', {attemptId: 'attempt-1'})).id, archived.id);
    const archiveEntry = await invoke<QuantEntryDetail>(`${base}entries/${archived.entryId}/`);
    const nativeVersion = archiveEntry.implementations.flatMap(row => row.versions).find(row => row.id === archived.versionId)!;
    assert.equal(nativeVersion.strategyArtifactId, archived.id); assert.equal(nativeVersion.compileCheck, 'pending');
    const nativeGraph = await invoke<import('../../types/api/quantGraph.ts').QuantGraph>(`${base}graph/?candidateId=${prepared.seeds[0].candidateId}`);
    assert.ok(nativeGraph.nodes.some(row => row.kind === 'strategy' && row.id === `strategy:${archived.id}`));
    assert.equal((await invoke<Response>(exportPath + '?attemptId=attempt-2')).status, 400);
    const decoded = JSON.parse(preview.manifestJson);
    for (const change of [{verification: 'verified'}, {artifact_kind: 'indicator'}, {native_inputs: {}}, {code_sha256: 'wrong'}]) assert.throws(() => readStrategyExport(JSON.stringify({...decoded, ...change})));
    resetQuantStateForTests();
    assert.equal((await invoke<import('../../types/api/quantStrategyExport.ts').QuantStrategyExport>(exportPath)).artifacts[0].id, archived.id);
    const rolling = structuredClone(input); rolling.requestKey = 'strategy_local_rolling001'; rolling.proposalId = '';
    rolling.config.walkForward = {version: 1, mode: 'expanding', folds: 2, trainBars: 20, validationBars: 5, testBars: 5, warmupBars: 0};
    const multi = await invoke<Experiment>(`${base}experiments/`, 'POST', rolling);
    quantState().experiments.find(row => row.data.id === multi.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const rolled = readExperiment(await invoke<Experiment>(`${base}experiments/${multi.id}/`));
    assert.equal(rolled.engineVersion, 'quant-local-search-6'); assert.equal(rolled.temporal!.folds[0].final!.execution!.ledgerScope, 'full_trades');
    setScenario('empty'); assert.equal((await invoke<{total: number}>(`${base}experiments/`)).total, 0); assert.equal((await invoke<Response>(exportPath)).status, 404);
    setScenario('error'); assert.equal((await invoke<Response>(`${base}experiments/${started.id}/`)).status, 503); assert.equal((await invoke<Response>(exportPath)).status, 503);
    setScenario('slow'); assert.equal(readExperiment(await invoke<Experiment>(`${base}experiments/${started.id}/`)).strategy!.version, 1); assert.equal((await invoke<import('../../types/api/quantStrategyExport.ts').QuantStrategyExport>(exportPath)).artifacts[0].id, archived.id);
});
