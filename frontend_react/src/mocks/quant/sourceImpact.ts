/** Read-only local preview. No source execution, parser, model, job or persisted impact record. */
import {HttpResponse} from 'msw';
import type {QuantEntryDetail, QuantReport, QuantSource} from '../../types/api/quant';
import type {QuantSourceEvidenceImpact, QuantSourceImpact, QuantSourceImpactPreview, QuantSourceLineRange, QuantSourceQuoteImpact} from '../../types/api/quantSourceImpact';
import {mockSourceHash} from './sourceSnapshots';

const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
const lines = (code: string) => code ? code.split(/\r\n|\n|\r/).slice(0, /(?:\r\n|\n|\r)$/.test(code) ? -1 : undefined) : [];
const range = (code: string): QuantSourceLineRange | null => code ? {start_line: 1, end_line: lines(code).length} : null;
const names: Record<string, string> = {languageVersion: 'language_version', webMarkdown: 'web_markdown', fetchStatus: 'fetch_status', fetchError: 'fetch_error', fetchedAt: 'fetched_at', finalUrl: 'final_url', originSourceId: 'origin_source_id'};
const fieldValue = (source: QuantSource, field: string) => {
    const key = Object.keys(names).find(key => names[key] === field) || field;
    const value = (source.payload as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
};
function occurrences(text: string, quote: string) {
    const ranges: QuantSourceLineRange[] = []; let count = 0, next = 0;
    if (!quote.trim()) return {count, ranges};
    for (;;) {
        const at = text.indexOf(quote, next); if (at < 0) break;
        count++;
        if (ranges.length < 20) {
            const start = text.slice(0, at).split(/\r\n|\n|\r/).length;
            ranges.push({start_line: start, end_line: start + quote.split(/\r\n|\n|\r/).length - 1});
        }
        next = at + quote.length;
    }
    return {count, ranges};
}
function quoteImpact(field: string, quote: string, old: QuantSource, target: QuantSource): QuantSourceQuoteImpact {
    const before = occurrences(fieldValue(old, field), quote), after = occurrences(fieldValue(target, field), quote);
    const status = !before.count ? 'unknown' : !after.count ? 'missing' : before.count > 1 || after.count > 1 ? 'ambiguous' :
        JSON.stringify(before.ranges) === JSON.stringify(after.ranges) ? 'present' : 'moved';
    return {field, quote, status, old_lines: before.ranges, new_lines: after.ranges, old_occurrences: before.count, new_occurrences: after.count,
        truncated: before.count > before.ranges.length || after.count > after.ranges.length};
}
function evidence(rows: unknown, old: QuantSource, target: QuantSource, changed: boolean): QuantSourceEvidenceImpact[] {
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 30).map((raw, index) => {
        const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
        const values: {field: string; quote: string}[] = [];
        if (typeof row.evidence === 'string') values.push({field: 'code', quote: row.evidence});
        const domain = row.domain && typeof row.domain === 'object' ? row.domain as Record<string, unknown> : {};
        const nested = (Array.isArray(row.parameters) ? row.parameters : []).flatMap(parameter => {
            const evidence = parameter?.domain?.evidence;
            return Array.isArray(evidence) ? evidence : [];
        });
        for (const entry of [...(Array.isArray(row.evidence) ? row.evidence : []), ...(Array.isArray(domain.evidence) ? domain.evidence : []), ...nested]) {
            if (entry && typeof entry === 'object' && typeof entry.quote === 'string' && typeof entry.field === 'string') values.push({field: entry.field, quote: entry.quote});
        }
        const quotes = [...new Map(values.map(value => [JSON.stringify(value), value])).values()].map(value => quoteImpact(value.field, value.quote, old, target));
        const status = quotes.some(quote => quote.status === 'missing') ? 'direct' : !quotes.length || quotes.some(quote => ['unknown', 'ambiguous'].includes(quote.status)) ? 'unknown' : changed ? 'potential' : 'quote_present';
        return {index, name: typeof row.name === 'string' ? row.name : `未命名项 ${index + 1}`, status, quotes, node_ids: [],
            limitations: ['本地仅逐字检查旧引用在两个固定快照中的位置；引用保留不能证明依赖、参数作用或语义未变化。']};
    });
}
function preview(old: QuantSource, target: QuantSource, report: QuantReport): QuantSourceImpact {
    const oldCode = old.payload.code || '', newCode = target.payload.code || '', codeChanged = oldCode !== newCode;
    const changed = [...new Set([...Object.keys(old.payload), ...Object.keys(target.payload)])].filter(key => JSON.stringify((old.payload as Record<string, unknown>)[key]) !== JSON.stringify((target.payload as Record<string, unknown>)[key])).map(key => names[key] || key).sort();
    const truncated = oldCode.length > 8000 || newCode.length > 8000;
    const data = report.data as Record<string, unknown>;
    const parameters = evidence(data.parameters, old, target, !!changed.length), factors = evidence(data.factors, old, target, !!changed.length);
    const node = oldCode || newCode ? [{id: 'local-impact-module', name: '<module>（本地文本范围）', kind: 'module',
        change: !oldCode ? 'added' as const : !newCode ? 'removed' as const : codeChanged ? 'changed' as const : 'identical' as const,
        impact: codeChanged || changed.length ? 'unknown' as const : 'not_observed' as const, old_range: range(oldCode), new_range: range(newCode),
        reasons: ['这是固定文本范围演示；未解析函数、调用或运行时依赖，不能据此复用分析阶段。']}] : [];
    return {version: 1, method: 'conservative-source-impact-v1', status: truncated ? 'limited' : changed.length ? 'changed' : 'identical',
        changed_fields: changed, source_context_changed: changed.some(key => key !== 'code'),
        code: {old_line_count: lines(oldCode).length, new_line_count: lines(newCode).length, status: truncated ? 'limited' : codeChanged ? 'exact' : 'identical',
            total_hunks: Number(codeChanged), omitted_hunks: 0, hunks: codeChanged ? [{kind: !oldCode ? 'insert' : !newCode ? 'delete' : 'replace',
                old_start: oldCode ? 1 : null, old_end: oldCode ? lines(oldCode).length : null, new_start: newCode ? 1 : null, new_end: newCode ? lines(newCode).length : null,
                old_text: oldCode.slice(0, 8000), new_text: newCode.slice(0, 8000), old_truncated: oldCode.length > 8000, new_truncated: newCode.length > 8000}] : [],
            limitations: ['本地采用整段替换显示真实选定文本；未运行后端行差异算法。', ...(truncated ? ['展示文本被截断，未显示部分不能据此判为无变化。'] : [])]},
        structure: {old_status: oldCode ? 'partial' : 'no_code', new_status: newCode ? 'partial' : 'no_code', old_parser: 'local-presentation-only', new_parser: 'local-presentation-only',
            total_nodes: node.length, omitted_nodes: 0, counts: {added: Number(!oldCode && !!newCode), removed: Number(!!oldCode && !newCode), changed: Number(!!oldCode && !!newCode && codeChanged), moved: 0,
                identical: Number(!!oldCode && oldCode === newCode), direct: 0, potential: 0, unknown: Number(!!node.length && !!changed.length)}, nodes: node,
            limitations: ['人工模块范围样例，没有运行后端Python作用域/赋值链解析或跨节点依赖分析；同名不证明引用。']}, parameters, factors,
        omitted: {parameters: Math.max(0, (Array.isArray(data.parameters) ? data.parameters.length : 0) - parameters.length), factors: Math.max(0, (Array.isArray(data.factors) ? data.factors.length : 0) - factors.length)},
        recommendation: {action: 'full_reanalysis', start_stage: 'normalize', can_reuse_stages: false,
            reasons: ['保留旧报告与引用作为基线，按目标快照从归一阶段完整重新分析。', '逐字引用和本地结构样例不提供安全复用旧结论的证明。']},
        limitations: ['本地人工预览，未调用模型、执行源码或分析真实运行时依赖。', '这份只读预览不会修改来源、报告、实验或任务，也不授权复用任何分析阶段。']};
}
export function mockSourceImpact(request: Request, entry: QuantEntryDetail) {
    if (request.method !== 'GET') return fail(405, '只支持只读影响预览');
    const params = new URL(request.url).searchParams;
    const sourceId = params.get('sourceId') || params.get('source_id'), reportId = params.get('reportId') || params.get('report_id');
    if (!sourceId || !reportId) return fail(400, '请明确选择目标来源和基线报告');
    const target = entry.sources?.find(row => row.id === sourceId), report = entry.reports?.find(row => row.id === reportId);
    if (!target || !report) return fail(404, '目标来源或基线报告不属于当前研究');
    const old = entry.sources?.find(row => row.id === report.sourceId);
    if (!old || ![1, 2, 3].includes(report.schemaVersion) || old.payload.provenance === 'external_feedback' || target.payload.provenance === 'external_feedback') return fail(400, '只能比较源码静态报告与原始研究资料，反馈与实验报告不可用作基线');
    const value: QuantSourceImpactPreview = {version: 1, local_demo: true,
        baseline: {report_id: report.id, report_hash: `local-demo-report-${report.id}`, source_id: old.id, source_hash: mockSourceHash(old), material_id: old.materialId, language: old.payload.language || 'text', created_at: old.createdAt},
        target: {source_id: target.id, source_hash: mockSourceHash(target), material_id: target.materialId, language: target.payload.language || 'text', created_at: target.createdAt},
        relationship: old.id === target.id ? 'same_source' : old.materialId === target.materialId ? 'same_material' : 'different_material', impact: preview(old, target, report)};
    return {impactJson: JSON.stringify(value)};
}
