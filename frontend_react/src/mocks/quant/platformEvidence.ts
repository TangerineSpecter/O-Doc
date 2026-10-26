import {mockSourceParameterComparison} from './sourceParameterComparison';
/** Explicit artificial fixtures for the execution evidence UI, never a trading/accounting engine. */
import {HttpResponse} from 'msw';
import type {QuantSource} from '../../types/api/quant';
import type {QuantExecutionAccounting, QuantExecutionAdapter, QuantExecutionCounts, QuantExecutionEvidence, QuantExecutionMetricKey, QuantExecutionOptions, QuantExecutionParameterComparison, QuantExecutionPreview, QuantExecutionProvenance, QuantExecutionRecord, QuantExecutionValue} from '../../types/api/quantPlatformEvidence';
import {mockSourceHash} from './sourceSnapshots';
export const localExecutionAdapters = ['standard-execution-json-v1', 'standard-execution-csv-v1', 'mt4-tester-html-v1'] as const;
export interface MockExecutionInput {document: string; executionAdapter?: string; executionOptionsJson?: string; documentFormat?: string}
type ObjectValue = Record<string, unknown>;
export const localExecutionDefaultOptions: QuantExecutionOptions = {version: 1, timezone: '', currency: '', initial_balance: '', balance_tolerance: '0.01', profit_basis: 'unknown', cash_flow_coverage: 'unknown'};
export const localExecutionSamples = {
    json: JSON.stringify({version: 1, metadata: {currency: 'USD', timezone: 'UTC', initial_balance: '10000', profit_basis: 'net', cash_flow_coverage: 'complete'},
        parameters: [{name: 'N', value: '20', unit: ''}], reported_metrics: [{name: 'net_profit', value: '-10', unit: 'USD'}],
        records: [{kind: 'trade', id: 'LOCAL_EXECUTION_RECONCILED', timestamp: '2026-01-01T00:00:00Z', profit: '-10', balance: '9990'}]}, null, 2),
    csv: 'kind,id,timestamp,profit,balance\ntrade,LOCAL_EXECUTION_RECONCILED,2026-01-01T00:00:00Z,-10,9990\n',
    html: '<!-- LOCAL_EXECUTION_PARTIAL: 人工MT4流程样例，不能代替真实测试报告核算 -->\n<table><tr><td>Initial deposit</td><td>10000</td></tr><tr><td>Total net profit</td><td>-10</td></tr></table>',
};
const object = (value: unknown): value is ObjectValue => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: ObjectValue, allowed: string[], required: string[] = []) => {
    if (Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !(key in value))) throw new Error('结构化执行证据含未知字段或缺少必要字段');
};
const text = (value: unknown, maximum = 200) => {
    if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) throw new Error('执行证据文本含非法字符或超过字段上限');
    return value;
};
export const localExecutionHash = (value: unknown) => {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    let hash = 2166136261;
    for (const char of raw) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return `local-demo-noncryptographic-${(hash >>> 0).toString(16)}`;
};
function amount(value: unknown, nullable = false): string | null {
    if (nullable && (value === undefined || value === null || value === '')) return null;
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) throw new Error('金额须是有界十进制字符串或安全有限数值');
    if (!['string', 'number'].includes(typeof value)) throw new Error('金额须是有界十进制字符串或安全有限数值');
    const raw = String(value).trim(), match = raw.match(/^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d{1,3}))?$/);
    if (!match || raw.length > 120) throw new Error('金额不是有界十进制数值');
    const [whole = '', fraction = ''] = match[2].split('.');
    const coefficient = (whole + fraction).replace(/^0+/, '') || '0', scale = fraction.length - Number(match[3] || 0);
    if (coefficient.length > 100 || Math.abs(scale) > 30 || coefficient.length - scale > 101) throw new Error('金额超过精度或指数上限');
    const fixed = scale <= 0 ? coefficient + '0'.repeat(-scale) : coefficient.padStart(scale + 1, '0').slice(0, -scale) + '.' + coefficient.padStart(scale + 1, '0').slice(-scale);
    const normalized = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
    return BigInt(coefficient) === 0n ? '0' : (match[1] === '-' ? '-' : '') + normalized;
}
function options(json?: string): typeof localExecutionDefaultOptions {
    if (json !== undefined && (typeof json !== 'string' || json.length > 4000)) throw new Error('执行选项须为最多4000字符的JSON对象');
    let value: unknown;
    try {value = JSON.parse(json || '{}');} catch {throw new Error('执行选项必须是完整JSON对象');}
    if (!object(value)) throw new Error('执行选项必须是完整JSON对象');
    keys(value, Object.keys(localExecutionDefaultOptions));
    const result = {...localExecutionDefaultOptions, ...value};
    if (result.version !== 1) throw new Error('执行选项版本无效');
    result.timezone = text(result.timezone, 100).trim();
    if (result.timezone) {try {new Intl.DateTimeFormat('en-US', {timeZone: result.timezone}).format(new Date(0));} catch {throw new Error('请选择有效的IANA时区');}}
    result.currency = text(result.currency, 30).trim(); result.initial_balance = amount(result.initial_balance, true) || '';
    result.balance_tolerance = amount(result.balance_tolerance)!;
    if (result.initial_balance.startsWith('-') || result.balance_tolerance.startsWith('-') || !/^(?:0(?:\.\d+)?|1)$/.test(result.balance_tolerance)) throw new Error('初始余额须非负，余额容差须为0–1');
    if (!['net', 'gross', 'unknown'].includes(result.profit_basis) || !['complete', 'unknown'].includes(result.cash_flow_coverage)) throw new Error('利润口径或现金流覆盖声明无效');
    return result;
}
function csv(document: string): {values: ObjectValue[]; quotes: string[]; lines: number[]} {
    const records: string[][] = [], quotes: string[] = []; let row: string[] = [], value = '', quoted = false, raw = '';
    for (let index = 0; index < document.length; index++) {
        const char = document[index]; raw += char;
        if (char === '"') {
            if (quoted && document[index + 1] === '"') {value += '"'; raw += document[++index];} else quoted = !quoted;
        } else if (char === ',' && !quoted) {row.push(value); value = '';}
        else if (['\r', '\n'].includes(char) && !quoted) {
            if (char === '\r' && document[index + 1] === '\n') raw += document[++index];
            row.push(value); if (row.some(cell => cell.trim())) {records.push(row); quotes.push(raw);} row = []; value = ''; raw = '';
        } else value += char;
    }
    if (quoted) throw new Error('CSV引号未闭合');
    row.push(value); if (row.some(cell => cell.trim())) {records.push(row); quotes.push(raw);}
    const header = records.shift() || []; quotes.shift();
    const allowed = ['kind', 'id', 'timestamp', 'profit', 'profit_basis', 'commission', 'swap', 'fees', 'balance', 'symbol', 'side', 'volume', 'amount', 'equity'];
    if (new Set(header).size !== header.length || ['kind', 'id', 'timestamp'].some(key => !header.includes(key)) || header.some(key => !allowed.includes(key))) throw new Error('标准CSV须含kind/id/timestamp且列名唯一');
    let line = 2;
    const lines = quotes.map(quote => {const start = line; line += quote.split(/\r\n|\n|\r/).length - 1; return start;});
    return {values: records.map(cells => {if (cells.length !== header.length) throw new Error('CSV行列数不一致'); return Object.fromEntries(header.map((key, index) => [key, cells[index]]).filter(([, value]) => value !== ''));}), quotes, lines};
}
const artificial = '人工构造的本地样例，未运行真实平台适配、成交核算或回测引擎；所有固定指标仅用于界面流程。';
const provenance = (format: 'json' | 'csv' | 'html', path: string, quote = '', line: number | null = null): QuantExecutionProvenance =>
    ({format, path, line, table: null, row: null, quote, content_hash: localExecutionHash([format, path, quote])});
function declared(values: unknown, name: 'parameters' | 'reported_metrics'): QuantExecutionValue[] {
    if (!Array.isArray(values) || values.length > (name === 'parameters' ? 300 : 100)) throw new Error('声明参数或指标超过数量上限');
    const seen = new Set<string>();
    return values.map((value, index) => {
        if (!object(value)) throw new Error('声明参数和指标必须是对象'); keys(value, ['name', 'value', 'unit'], ['name', 'value']);
        const original = text(value.name); if (!original.trim() || seen.has(original)) throw new Error('参数和指标名须非空且唯一'); seen.add(original);
        return {name: original, value: text(value.value), unit: text(value.unit || '', 100), ref: `execution:${name === 'parameters' ? 'parameter' : 'reported'}:${index}`,
            provenance: provenance('json', `$.${name}[${index}]`)};
    });
}
function record(value: ObjectValue, index: number, location: QuantExecutionProvenance, meta: QuantExecutionEvidence['metadata']): QuantExecutionRecord {
    const id = text(value.id, 80), raw_timestamp = text(value.timestamp, 100);
    if (!/^[A-Za-z0-9_.:-]+$/.test(id) || !raw_timestamp.trim() || !['trade', 'cash_flow', 'equity'].includes(String(value.kind))) throw new Error('执行记录缺少有效ID、类型或时间');
    const fields = ['kind', 'id', 'timestamp', 'balance', ...(value.kind === 'trade' ? ['profit', 'profit_basis', 'commission', 'swap', 'fees', 'symbol', 'side', 'volume'] : value.kind === 'cash_flow' ? ['amount'] : ['equity'])];
    keys(value, fields, ['kind', 'id', 'timestamp']);
    if (!Number.isFinite(Date.parse(raw_timestamp))) throw new Error('执行记录时间格式无效');
    const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw_timestamp) ? new Date(raw_timestamp).toISOString() : meta.timezone === 'UTC' ? new Date(raw_timestamp + 'Z').toISOString() : null;
    const base = {id, sequence: index + 1, timestamp, raw_timestamp, ref: `execution:record:${id}`, provenance: location, balance: amount(value.balance, true)};
    if (value.kind === 'cash_flow') return {...base, kind: 'cash_flow', amount: amount(value.amount)!};
    if (value.kind === 'equity') return {...base, kind: 'equity', equity: amount(value.equity)!};
    const basis = value.profit_basis || meta.profit_basis;
    if (!['net', 'gross', 'unknown'].includes(String(basis))) throw new Error('利润口径无效');
    return {...base, kind: 'trade', profit: amount(value.profit)!, profit_basis: basis as 'net' | 'gross' | 'unknown',
        commission: amount(value.commission, true), swap: amount(value.swap, true), fees: amount(value.fees, true), volume: amount(value.volume, true),
        symbol: text(value.symbol || '', 100), side: text(value.side || '', 30), order_id: '', operation: 'closed_trade'};
}
const metricKeys: QuantExecutionMetricKey[] = ['closed_trades', 'wins', 'losses', 'breakeven', 'reported_profit_sum', 'net_profit', 'gross_profit', 'gross_loss', 'win_rate', 'profit_factor', 'expectancy', 'net_cash_flow', 'final_reconstructed_balance', 'balance_drawdown_amount', 'balance_drawdown_fraction', 'equity_drawdown_amount', 'equity_drawdown_fraction'];
function accounting(evidence: QuantExecutionEvidence, fixture: string): QuantExecutionAccounting {
    const sample = evidence.records.length === 1 && evidence.records[0].kind === 'trade' && evidence.records[0].profit === '-10' && evidence.records[0].profit_basis === 'net' && evidence.records[0].balance === (fixture === 'MISMATCH' ? '9980' : '9990');
    const complete = sample && evidence.parser_status === 'parsed' && !!evidence.metadata.currency && evidence.metadata.initial_balance === '10000' && evidence.metadata.profit_basis === 'net' && evidence.metadata.cash_flow_coverage === 'complete';
    const enough = complete && ['RECONCILED', 'MISMATCH'].includes(fixture), mismatch = enough && fixture === 'MISMATCH';
    const values: Partial<Record<QuantExecutionMetricKey, string>> = enough ? {closed_trades: '1', wins: '0', losses: '1', breakeven: '0', reported_profit_sum: '-10', net_profit: '-10', gross_profit: '0', gross_loss: '-10', win_rate: '0', profit_factor: '0', expectancy: '-10', net_cash_flow: '0', final_reconstructed_balance: '9990', balance_drawdown_amount: '10', balance_drawdown_fraction: '0.001'} : {};
    const metrics = Object.fromEntries(metricKeys.map(key => [key, {value: values[key] ?? null, unit: key.endsWith('_fraction') || ['win_rate', 'profit_factor'].includes(key) ? 'ratio' : ['closed_trades', 'wins', 'losses', 'breakeven'].includes(key) ? 'count' : evidence.metadata.currency,
        status: values[key] === undefined ? 'unavailable' : 'computed', reason: values[key] === undefined ? '人工样例没有足够口径或对应路径，数值保持未知。' : artificial, ref: `accounting:${key}`}])) as QuantExecutionAccounting['metrics'];
    const known = evidence.records.filter(row => row.kind === 'trade' && row.profit_basis === 'net');
    const value: QuantExecutionAccounting = {version: 1, method: 'execution-accounting-v1', evidence_hash: evidence.content_hash, status: mismatch ? 'mismatch' : enough ? 'reconciled' : 'insufficient',
        counts: {...evidence.counts, known_net_trades: known.length, negative_net_trades: known.filter(row => row.kind === 'trade' && row.profit.startsWith('-')).length}, metrics,
        reconciliation: {checked_rows: enough ? 1 : 0, unknown_rows: enough ? 0 : evidence.records.length, mismatches: mismatch ? [{id: evidence.records[0]?.id || 'LOCAL_EXECUTION_MISMATCH', expected: '9990', reported: '9980', difference: '-10', ref: `accounting:reconciliation:${evidence.records[0]?.id || 'LOCAL_EXECUTION_MISMATCH'}`} ] : []},
        reported_comparison: evidence.reported_metrics.map(row => ({name: row.name, reported: row.value, computed: enough && row.name === 'net_profit' ? '-10' : null,
            difference: enough && row.name === 'net_profit' ? '0' : null, status: enough && row.name === 'net_profit' ? 'matched' : 'unavailable', ref: row.ref})),
        anomalies: [], balance_path: enough ? [{id: 'local-initial', timestamp: null, value: '10000', ref: 'accounting:balance:initial'}, {id: evidence.records[0]?.id || fixture, timestamp: evidence.records[0]?.timestamp || null, value: '9990', ref: 'accounting:balance:0'}] : [],
        limitations: [artificial, '来源、成交覆盖、利润口径和账户路径为用户声明，局部数值一致不代表实盘正确或策略有效。'], content_hash: ''};
    value.content_hash = localExecutionHash(value); return value;
}
export function normalizeMockExecution(input: MockExecutionInput): QuantExecutionPreview {
    if (typeof input.document !== 'string' || !input.document.trim() || input.document.includes('\0') || new TextEncoder().encode(input.document).length > 1024 * 1024) throw new Error('执行资料须非空且最多1MiB');
    if (!localExecutionAdapters.includes(input.executionAdapter as QuantExecutionAdapter)) throw new Error('请选择支持的执行记录适配器');
    const adapter = input.executionAdapter as QuantExecutionAdapter, opts = options(input.executionOptionsJson);
    const format = adapter === 'standard-execution-json-v1' ? 'json' : adapter === 'standard-execution-csv-v1' ? 'csv' : 'html';
    if (input.documentFormat && input.documentFormat !== format) throw new Error('执行适配器与文档格式不一致');
    let raw: ObjectValue = {}, records: ObjectValue[] = [], quotes: string[] = [], rowLines: number[] = [];
    if (format === 'json') {
        try {const parsed: unknown = JSON.parse(input.document); if (!object(parsed)) throw new Error(); raw = parsed;} catch {throw new Error('标准执行JSON须为完整对象');}
        keys(raw, ['version', 'metadata', 'parameters', 'reported_metrics', 'records'], ['version', 'records']);
        if (raw.version !== 1 || !Array.isArray(raw.records) || !raw.records.every(object)) throw new Error('标准执行JSON版本或records无效');
        records = raw.records;
    } else if (format === 'csv') {const rows = csv(input.document); records = rows.values; quotes = rows.quotes; rowLines = rows.lines;}
    if (records.length > 2000) throw new Error('执行证据最多2000条记录，不能截断负面成交');
    const declaration = raw.metadata === undefined ? {} : raw.metadata;
    if (!object(declaration)) throw new Error('执行metadata须为对象');
    keys(declaration, ['timezone', 'currency', 'initial_balance', 'profit_basis', 'cash_flow_coverage']);
    const normalized = options(JSON.stringify({...opts, ...declaration}));
    for (const key of Object.keys(declaration)) if (!['', 'unknown'].includes(String(opts[key as keyof QuantExecutionOptions])) && opts[key as keyof QuantExecutionOptions] !== normalized[key as keyof QuantExecutionOptions]) throw new Error('导入选项与文档元数据冲突');
    const {version: _version, ...metaValues} = normalized, metadata = {...metaValues, initial_balance: normalized.initial_balance || null};
    const marker = format === 'html' ? input.document.match(/LOCAL_EXECUTION_(RECONCILED|MISMATCH|PARTIAL|INVALID)/)?.[1] : records.map(row => String(row.id)).map(id => id.match(/^LOCAL_EXECUTION_(RECONCILED|MISMATCH|PARTIAL|INVALID)$/)?.[1]).find(Boolean);
    if (marker === 'INVALID') throw new Error('明确标记的人工无效样例，不归档执行结果');
    const projected = records.map((row, index) => record(row, index, provenance(format, format === 'json' ? `$.records[${index}]` : '', quotes[index] || '', format === 'csv' ? rowLines[index] : null), metadata));
    if (new Set(projected.map(row => row.id)).size !== projected.length) throw new Error('执行记录ID不能重复');
    if (projected.some((row, index) => index > 0 && row.timestamp !== null && projected[index - 1].timestamp !== null && row.timestamp < projected[index - 1].timestamp!)) throw new Error('执行记录须保留原始时间顺序，不能自动排序');
    const accepted = marker ? projected : [];
    const counts: QuantExecutionCounts = {records: accepted.length, trades: accepted.filter(row => row.kind === 'trade').length, cash_flows: accepted.filter(row => row.kind === 'cash_flow').length, equity: accepted.filter(row => row.kind === 'equity').length, operations: 0};
    const evidence: QuantExecutionEvidence = {version: 1, method: 'execution-evidence-v1', adapter, document_hash: localExecutionHash(input.document), options: opts, metadata,
        parser_status: marker === 'PARTIAL' || format === 'html' && marker || accepted.some(row => row.timestamp === null) ? 'partial' : marker ? 'parsed' : 'unsupported', parameters: declared(raw.parameters || [], 'parameters'), reported_metrics: declared(raw.reported_metrics || [], 'reported_metrics'), records: accepted, counts,
        warnings: [{code: 'local_artificial_fixture', message: artificial, ref: 'execution:warning:0'}, ...(!marker ? [{code: 'local_unmarked_document', message: '没有明确人工样例标记，本地模式不假装解析或核算真实平台报告。', ref: 'execution:warning:1'}] : [])], limitations: [artificial], content_hash: ''};
    evidence.content_hash = localExecutionHash(evidence);
    const calculated = accounting(evidence, marker || 'UNSUPPORTED');
    const samples = [...evidence.records].sort((a, b) => {
        const negative = (row: QuantExecutionRecord) => row.kind === 'trade' && row.profit.startsWith('-') || row.kind === 'cash_flow' && row.amount.startsWith('-');
        return Number(negative(b)) - Number(negative(a)) || a.sequence - b.sequence;
    }).slice(0, 12).map(({provenance: _provenance, ...row}) => row);
    const refs = [...new Set(['execution:metadata', ...evidence.parameters.map(row => row.ref), ...Object.values(calculated.metrics).map(row => row.ref), ...calculated.reported_comparison.map(row => row.ref), ...samples.map(row => row.ref), ...calculated.reconciliation.mismatches.slice(0, 12).map(row => row.ref), ...calculated.anomalies.slice(0, 12).map(row => row.ref)])];
    return {local_demo: true, execution_evidence: evidence, execution_accounting: calculated,
        execution_summary: {version: 1, method: 'execution-evidence-summary-v1', evidence_hash: evidence.content_hash, accounting_hash: calculated.content_hash, status: calculated.status,
            metadata: evidence.metadata, counts: calculated.counts, parameters: evidence.parameters.map(({provenance: _provenance, ...row}) => row),
            metrics: calculated.metrics, reconciliation: {checked_rows: calculated.reconciliation.checked_rows, unknown_rows: calculated.reconciliation.unknown_rows,
                mismatch_count: calculated.reconciliation.mismatches.length, examples: calculated.reconciliation.mismatches.slice(0, 12), omitted: Math.max(0, calculated.reconciliation.mismatches.length - 12)},
            reported_comparison: calculated.reported_comparison, anomalies: {total: calculated.anomalies.length, by_code: {}, examples: calculated.anomalies.slice(0, 12), omitted: Math.max(0, calculated.anomalies.length - 12)},
            sample_records: samples, omitted_records: Math.max(0, evidence.records.length - 12), refs, limitations: calculated.limitations}};
}
export function previewMockExecution(input: MockExecutionInput) {
    try {return {previewJson: JSON.stringify(normalizeMockExecution(input))};}
    catch (error) {return HttpResponse.json({code: 400, msg: error instanceof Error ? error.message : '执行资料无效', data: null}, {status: 400});}
}
export function mockExecutionParameterComparison(preview: QuantExecutionPreview, target: QuantSource,version=2): QuantExecutionParameterComparison {
    if(version===2)return mockSourceParameterComparison(preview.execution_evidence.parameters,target);
    return {version: 1, source_id: target.id, source_hash: mockSourceHash(target), rows: preview.execution_evidence.parameters.map(row => ({name: row.name,
        configured: {kind: 'string', value: row.value}, declaration: null, default: null, status: 'unmatched'})), missing: [],
        limitations: ['本地仅保留报告声明参数的原名和值；未运行真实声明解析、类型核对或参数映射。']};
}
