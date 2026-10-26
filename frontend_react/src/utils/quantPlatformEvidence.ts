import type {QuantComputedExecution, QuantExecutionAdapter, QuantExecutionOptions, QuantExecutionPreview, QuantExecutionParameterComparison} from '../types/api/quantPlatformEvidence';

export const executionAdapters: Record<QuantExecutionAdapter, string> = {'standard-execution-json-v1': '标准执行 JSON v1', 'standard-execution-csv-v1': '标准执行 CSV v1', 'mt4-tester-html-v1': 'MT4 测试器 HTML v1'};
export const executionFormats = {'standard-execution-json-v1': 'json', 'standard-execution-csv-v1': 'csv', 'mt4-tester-html-v1': 'html'} as const;
export const executionStatuses = {reconciled: '已提供数据按声明口径一致', mismatch: '发现核算差异', insufficient: '信息不足，部分核算不可用'};
export const executionMetricLabels = {closed_trades: '已平仓事件数', wins: '盈利事件', losses: '亏损事件', breakeven: '持平事件', reported_profit_sum: '报告利润合计', net_profit: '交易净利润', gross_profit: '盈利交易合计', gross_loss: '亏损交易合计', win_rate: '胜率（比例）', profit_factor: '盈利因子', expectancy: '每笔期望净额', net_cash_flow: '外部净现金流', final_reconstructed_balance: '重建期末余额', balance_drawdown_amount: '余额回撤金额', balance_drawdown_fraction: '余额回撤比例', equity_drawdown_amount: '净值采样回撤金额', equity_drawdown_fraction: '净值采样回撤比例'};
export const defaultExecutionOptions = (): QuantExecutionOptions => ({version: 1, timezone: '', currency: '', initial_balance: '', balance_tolerance: '0.01', profit_basis: 'unknown', cash_flow_coverage: 'unknown'});
export const executionDocumentBytes = (document: string) => new TextEncoder().encode(document).byteLength;
export const executionPreviewKey = (collection: string, entryId: string, document: string, adapter: string, optionsJson: string, context: string) => JSON.stringify([collection, entryId, document, adapter, optionsJson, context]);

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const decimal = (value: unknown): value is string => text(value) && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value);
const nullableDecimal = (value: unknown) => value === null || decimal(value);
const timestamp = (value: unknown) => value === null || text(value);
const counts = (value: unknown) => object(value) && ['records', 'trades', 'cash_flows', 'equity', 'operations'].every(key => integer(value[key])) && Number(value.trades) + Number(value.cash_flows) + Number(value.equity) + Number(value.operations) === value.records;
const provenance = (value: unknown) => object(value) && ['json', 'csv', 'html'].includes(String(value.format)) && ['path', 'quote', 'content_hash'].every(key => text(value[key])) && ['line', 'table', 'row'].every(key => value[key] === null || integer(value[key]));
const valueRow = (value: unknown) => object(value) && ['name', 'value', 'unit', 'ref'].every(key => text(value[key])) && provenance(value.provenance);
const issue = (value: unknown) => object(value) && ['code', 'message', 'ref'].every(key => text(value[key]));
const parameterValue = (value: unknown) => object(value) && ['unknown', 'int', 'float', 'bool', 'string'].includes(String(value.kind)) && (value.value === null || ['string', 'boolean'].includes(typeof value.value) || typeof value.value === 'number' && Number.isFinite(value.value));
const declaration = (value: unknown) => object(value) && ['name', 'type', 'default_raw', 'quote'].every(key => text(value[key])) && integer(value.line);
const sourceScalar=(value:unknown):boolean=>object(value) && (
    value.kind==='unknown'?value.value===null:value.kind==='bool'?typeof value.value==='boolean':
    value.kind==='string'?typeof value.value==='string':value.kind==='int'?typeof value.value==='number' && Number.isSafeInteger(value.value):
    value.kind==='float' && typeof value.value==='number' && Number.isFinite(value.value));
function sourceDeclaration(value:unknown,language:unknown):boolean {
    if(!declaration(value) || !object(value))return false;
    if(language==='mql4')return true;
    if(!['exposed_input','function_default','module_literal','transformed_input','unresolved_write'].includes(String(value.binding_kind)) || !text(value.scope) || !sourceScalar(value.default_value) || !['input_declaration','annotation_hint','literal_syntax'].includes(String(value.type_basis)) || !object(value.declared_constraints))return false;
    return Object.entries(value.declared_constraints).every(([key,item])=>object(item) && text(item.raw) && (
        ['minval','maxval','step'].includes(key)?sourceScalar(item.literal):key==='options' && (item.literals===null || Array.isArray(item.literals) && item.literals.length<=32 && item.literals.every(sourceScalar))));
}

export function readExecutionOptions(json?: string): QuantExecutionOptions {
    if (!json) return defaultExecutionOptions();
    const value: unknown = JSON.parse(json);
    if (!object(value) || value.version !== 1 || !['timezone', 'currency', 'initial_balance', 'balance_tolerance'].every(key => text(value[key])) || !['net', 'gross', 'unknown'].includes(String(value.profit_basis)) || !['complete', 'unknown'].includes(String(value.cash_flow_coverage))) throw new Error('执行核算口径无法读取');
    return value as unknown as QuantExecutionOptions;
}
function comparison(value: unknown): value is QuantExecutionParameterComparison {
    if(!object(value) || ![1,2].includes(Number(value.version)) || typeof value.version!=='number' || !text(value.source_id) || !text(value.source_hash) || !Array.isArray(value.rows) || value.rows.length>300 || !Array.isArray(value.missing) || value.missing.length>300 || !strings(value.limitations))return false;
    const modern=value.version===2;
    if(modern?(value.parser!=='source-parameters-2' || !text(value.source_language) || !['partial','limited','unparsed','unsupported'].includes(String(value.parser_status))):('parser' in value || 'source_language' in value || 'parser_status' in value))return false;
    if(modern && (!text(value.ref) || !strings(value.refs) || value.refs.length>601 || new Set(value.refs).size!==value.refs.length || value.refs.some(ref=>ref.length>160 || !ref) || value.refs[0]!==value.ref || JSON.stringify(value.refs)!==JSON.stringify([value.ref,...value.rows.map(row=>object(row)?row.ref:null),...value.missing.map(row=>object(row)?row.ref:null)])))return false;
    const readDeclaration=(row:unknown)=>modern?sourceDeclaration(row,value.source_language):declaration(row);
    const readScalar=modern?sourceScalar:parameterValue;
    const statuses=['same','different','type_mismatch','default_unknown','unknown_type','unmatched','ambiguous',...(modern?['unresolved','constraint_mismatch','literal_same','literal_differs']:[])];
    return value.rows.every(row=>object(row) && text(row.name) && readScalar(row.configured) && (row.declaration===null || readDeclaration(row.declaration)) && (row.default===null || readScalar(row.default)) && statuses.includes(String(row.status))) && value.missing.every(readDeclaration);
}
function summary(value: unknown) {
    if (!object(value) || value.version !== 1 || value.method !== 'execution-evidence-summary-v1' || !text(value.evidence_hash) || !text(value.accounting_hash) || !['reconciled', 'mismatch', 'insufficient'].includes(String(value.status)) || !object(value.metadata) || !counts(value.counts) || !object(value.counts) || !integer(value.counts.known_net_trades) || !integer(value.counts.negative_net_trades) || !object(value.metrics) || !Array.isArray(value.parameters) || !Array.isArray(value.reported_comparison) || !Array.isArray(value.sample_records) || value.sample_records.length > 12 || !integer(value.omitted_records) || value.sample_records.length + value.omitted_records !== value.counts.records || !strings(value.limitations) || !strings(value.refs) || new Set(value.refs).size !== value.refs.length) return false;
    if (!value.parameters.every(row => object(row) && ['name', 'value', 'unit', 'ref'].every(key => text(row[key]))) || !value.reported_comparison.every(row => object(row) && ['name', 'reported', 'ref'].every(key => text(row[key])) && nullableDecimal(row.computed) && nullableDecimal(row.difference) && ['matched', 'mismatch', 'unmapped', 'unavailable', 'not_numeric'].includes(String(row.status))) || !value.sample_records.every(row => object(row) && text(row.id) && text(row.ref) && integer(row.sequence) && timestamp(row.timestamp) && ['trade', 'cash_flow', 'equity', 'operation'].includes(String(row.kind)))) return false;
    const metricValues = Object.keys(executionMetricLabels).map(key => (value.metrics as Record<string, unknown>)[key]);
    if (!metricValues.every(row => object(row) && nullableDecimal(row.value) && ['unit', 'reason', 'ref'].every(key => text(row[key])) && ['computed', 'unavailable'].includes(String(row.status)) && (row.status === 'unavailable') === (row.value === null))) return false;
    const reconciled = value.reconciliation, anomalies = value.anomalies;
    if (!object(reconciled) || !['checked_rows', 'unknown_rows', 'mismatch_count', 'omitted'].every(key => integer(reconciled[key])) || !Array.isArray(reconciled.examples) || reconciled.examples.length > 12 || reconciled.examples.length + Number(reconciled.omitted) !== reconciled.mismatch_count || !reconciled.examples.every(row => object(row) && text(row.id) && text(row.ref) && ['expected', 'reported', 'difference'].every(key => decimal(row[key]))) || !object(anomalies) || !integer(anomalies.total) || !integer(anomalies.omitted) || !object(anomalies.by_code) || !Object.values(anomalies.by_code).every(integer) || !Array.isArray(anomalies.examples) || anomalies.examples.length > 12 || anomalies.examples.length + anomalies.omitted !== anomalies.total || !anomalies.examples.every(row => issue(row) && object(row) && text(row.record_id))) return false;
    const allowed = new Set(['execution:metadata', ...[...value.parameters, ...value.reported_comparison, ...value.sample_records, ...metricValues, ...reconciled.examples, ...anomalies.examples].map(row => (row as Record<string, unknown>).ref)]);
    return allowed.size === value.refs.length && value.refs.every(ref => allowed.has(ref));
}

export function readExecutionPreview(json: string, expectedAdapter?: QuantExecutionAdapter): QuantExecutionPreview {
    const fail = (): never => {throw new Error('执行证据包版本或核算结构无法读取');};
    let value: unknown; try {value = JSON.parse(json);} catch {return fail();}
    if (!object(value) || value.local_demo !== undefined && typeof value.local_demo !== 'boolean' || !object(value.execution_evidence) || !object(value.execution_accounting) || !summary(value.execution_summary)) return fail();
    const evidence = value.execution_evidence, accounting = value.execution_accounting;
    if (evidence.version !== 1 || evidence.method !== 'execution-evidence-v1' || !Object.prototype.hasOwnProperty.call(executionAdapters, String(evidence.adapter)) || expectedAdapter && evidence.adapter !== expectedAdapter || !text(evidence.document_hash) || !text(evidence.content_hash) || !['parsed', 'partial', 'unsupported'].includes(String(evidence.parser_status)) || !counts(evidence.counts) || !strings(evidence.limitations)) return fail();
    try {readExecutionOptions(JSON.stringify(evidence.options));} catch {return fail();}
    if (!object(evidence.metadata) || !['timezone', 'currency', 'balance_tolerance'].every(key => text(evidence.metadata && (evidence.metadata as Record<string, unknown>)[key])) || !nullableDecimal(evidence.metadata.initial_balance) || !['net', 'gross', 'unknown'].includes(String(evidence.metadata.profit_basis)) || !['complete', 'unknown'].includes(String(evidence.metadata.cash_flow_coverage))) return fail();
    if (!Array.isArray(evidence.parameters) || !evidence.parameters.every(valueRow) || !Array.isArray(evidence.reported_metrics) || !evidence.reported_metrics.every(valueRow) || !Array.isArray(evidence.warnings) || !evidence.warnings.every(issue) || !Array.isArray(evidence.records) || evidence.records.length > 2000 || evidence.records.length !== Number((evidence.counts as Record<string, unknown>).records)) return fail();
    for (const row of evidence.records) {
        if (!object(row) || !['id', 'raw_timestamp', 'ref'].every(key => text(row[key])) || !integer(row.sequence) || !timestamp(row.timestamp) || !provenance(row.provenance) || !['trade', 'cash_flow', 'equity', 'operation'].includes(String(row.kind))) return fail();
        if (row.kind === 'trade' && (!decimal(row.profit) || !['net', 'gross', 'unknown'].includes(String(row.profit_basis)) || !['commission', 'swap', 'fees', 'balance', 'volume'].every(key => nullableDecimal(row[key])) || !['symbol', 'side', 'order_id', 'operation'].every(key => text(row[key])))) return fail();
        if (row.kind === 'cash_flow' && (!decimal(row.amount) || !nullableDecimal(row.balance)) || row.kind === 'equity' && (!decimal(row.equity) || !nullableDecimal(row.balance)) || row.kind === 'operation' && (!['operation', 'order_id'].every(key => text(row[key])) || !['volume', 'price', 'profit', 'balance'].every(key => nullableDecimal(row[key])))) return fail();
    }
    if (accounting.version !== 1 || accounting.method !== 'execution-accounting-v1' || accounting.evidence_hash !== evidence.content_hash || !text(accounting.content_hash) || !['reconciled', 'mismatch', 'insufficient'].includes(String(accounting.status)) || !counts(accounting.counts) || !object(accounting.counts) || !integer(accounting.counts.known_net_trades) || !integer(accounting.counts.negative_net_trades) || !object(accounting.metrics) || !strings(accounting.limitations)) return fail();
    const metrics = accounting.metrics;
    for (const key of Object.keys(executionMetricLabels)) {
        const metric = metrics[key];
        if (!object(metric) || !nullableDecimal(metric.value) || !['unit', 'reason', 'ref'].every(key => text(metric[key])) || !['computed', 'unavailable'].includes(String(metric.status)) || (metric.status === 'unavailable') !== (metric.value === null)) return fail();
    }
    const reconciliation = accounting.reconciliation;
    if (!object(reconciliation) || !integer(reconciliation.checked_rows) || !integer(reconciliation.unknown_rows) || !Array.isArray(reconciliation.mismatches) || !reconciliation.mismatches.every(row => object(row) && text(row.id) && text(row.ref) && ['expected', 'reported', 'difference'].every(key => decimal(row[key])))) return fail();
    if (!Array.isArray(accounting.reported_comparison) || !accounting.reported_comparison.every(row => object(row) && ['name', 'reported', 'ref'].every(key => text(row[key])) && nullableDecimal(row.computed) && nullableDecimal(row.difference) && ['matched', 'mismatch', 'unmapped', 'unavailable', 'not_numeric'].includes(String(row.status))) || !Array.isArray(accounting.anomalies) || !accounting.anomalies.every(row => issue(row) && object(row) && text(row.record_id)) || !Array.isArray(accounting.balance_path) || !accounting.balance_path.every(row => object(row) && text(row.id) && timestamp(row.timestamp) && decimal(row.value) && text(row.ref))) return fail();
    const projection = value.execution_summary as Record<string, unknown>;
    if (projection.evidence_hash !== evidence.content_hash || projection.accounting_hash !== accounting.content_hash || projection.status !== accounting.status) return fail();
    return value as unknown as QuantExecutionPreview;
}

export function readComputedExecution(json: string): QuantComputedExecution {
    let value: unknown; try {value = JSON.parse(json);} catch {throw new Error('固定执行核算依据无法读取');}
    if (!object(value) || !summary(value.execution_summary) || !comparison(value.execution_parameter_comparison)) throw new Error('固定执行核算依据无法读取');
    return value as unknown as QuantComputedExecution;
}
