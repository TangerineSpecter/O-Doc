import type {QuantEntryDetail, QuantReport, QuantSource} from '../types/api/quant';
import type {QuantSourceImpactPreview} from '../types/api/quantSourceImpact';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const range = (value: unknown) => object(value) && integer(value.start_line) && value.start_line >= 1 && integer(value.end_line) && value.end_line >= value.start_line;
const optionalRange = (value: unknown) => value === null || range(value);
const ranges = (value: unknown) => Array.isArray(value) && value.every(range);
const pairedLines = (start: unknown, end: unknown) => start === null && end === null || integer(start) && start >= 1 && integer(end) && end >= start;
const metadata = (value: unknown) => object(value) && ['source_id', 'source_hash', 'material_id', 'language', 'created_at'].every(key => text(value[key])) && typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at));
export const sourceImpactLabels = {direct: '直接变化线索', potential: '潜在影响', unknown: '影响未知', quote_present: '原引文仍在', not_observed: '未观测到影响线索'};
export const sourceQuoteLabels = {missing: '原引文未找到', moved: '引文位置变化', present: '引文仍存在', ambiguous: '多处匹配，定位不明确', unknown: '无法确定'};

export function staticSourceReports(entry: QuantEntryDetail): QuantReport[] {
    return (entry.reports || []).filter(report => [1, 2, 3].includes(report.schemaVersion) && entry.sources?.some(source => source.id === report.sourceId && source.payload.provenance !== 'external_feedback'));
}
/** Follow only an authoritative pointer within the report's own material, never another implementation. */
export function selectedAnalysisSource(entry: QuantEntryDetail, report?: QuantReport, explicitSourceId = ''): QuantSource | undefined {
    const sources = (entry.sources || []).filter(source => source.payload.provenance !== 'external_feedback');
    const explicit = sources.find(source => source.id === explicitSourceId);
    if (explicit) return explicit;
    const baseline = sources.find(source => source.id === report?.sourceId);
    if (baseline && report && [1, 2, 3].includes(report.schemaVersion)) return sources.find(source => source.id === baseline.materialCurrentSourceId && source.materialId === baseline.materialId) || baseline;
    return baseline || sources[0];
}
export function sourceAnalysisRuns(entry: QuantEntryDetail, sourceId?: string) {
    return entry.runs.filter(run => run.kind === 'analyze' && !!sourceId && [run.sourceId, run.resolvedSourceId].includes(sourceId));
}

export function readSourceImpact(json: string, expected?: {sourceId: string; reportId: string; baselineSourceId: string}): QuantSourceImpactPreview {
    const fail = (): never => {throw new Error('源码影响预览版本或内容结构无法读取');};
    let value: unknown;
    try {value = JSON.parse(json);} catch {return fail();}
    if (!object(value) || value.version !== 1 || value.local_demo !== undefined && typeof value.local_demo !== 'boolean' || !metadata(value.baseline) || !object(value.baseline) || !text(value.baseline.report_id) || !text(value.baseline.report_hash) || !metadata(value.target) || !object(value.target) || !['same_source', 'same_material', 'different_material'].includes(String(value.relationship)) || !object(value.impact)) return fail();
    if (expected && (value.target.source_id !== expected.sourceId || value.baseline.report_id !== expected.reportId || value.baseline.source_id !== expected.baselineSourceId)) return fail();
    const sameSource = value.baseline.source_id === value.target.source_id, sameMaterial = value.baseline.material_id === value.target.material_id;
    if (value.relationship !== (sameSource ? 'same_source' : sameMaterial ? 'same_material' : 'different_material') || sameSource && !sameMaterial) return fail();
    const impact = value.impact, code = impact.code, structure = impact.structure, omitted = impact.omitted, recommendation = impact.recommendation;
    if (impact.version !== 1 || impact.method !== 'conservative-source-impact-v1' || !['identical', 'changed', 'limited'].includes(String(impact.status)) || !strings(impact.changed_fields) || typeof impact.source_context_changed !== 'boolean' || !strings(impact.limitations)) return fail();
    if (!object(code) || !integer(code.old_line_count) || !integer(code.new_line_count) || !['identical', 'exact', 'limited'].includes(String(code.status)) || !integer(code.total_hunks) || !integer(code.omitted_hunks) || !Array.isArray(code.hunks) || !strings(code.limitations) || code.hunks.length + code.omitted_hunks !== code.total_hunks) return fail();
    for (const hunk of code.hunks) {
        if (!object(hunk) || !['insert', 'delete', 'replace'].includes(String(hunk.kind)) || !pairedLines(hunk.old_start, hunk.old_end) || !pairedLines(hunk.new_start, hunk.new_end) || !text(hunk.old_text) || !text(hunk.new_text) || typeof hunk.old_truncated !== 'boolean' || typeof hunk.new_truncated !== 'boolean') return fail();
        if (hunk.kind === 'insert' && (hunk.old_start !== null || hunk.new_start === null) || hunk.kind === 'delete' && (hunk.new_start !== null || hunk.old_start === null) || hunk.kind === 'replace' && (hunk.old_start === null || hunk.new_start === null)) return fail();
        if (typeof hunk.old_end === 'number' && hunk.old_end > code.old_line_count || typeof hunk.new_end === 'number' && hunk.new_end > code.new_line_count) return fail();
    }
    if (!object(structure) || !['old_status', 'new_status', 'old_parser', 'new_parser'].every(key => text(structure[key])) || !integer(structure.total_nodes) || !integer(structure.omitted_nodes) || !Array.isArray(structure.nodes) || structure.nodes.length + structure.omitted_nodes !== structure.total_nodes || !object(structure.counts) || !strings(structure.limitations)) return fail();
    const counts = structure.counts;
    if (!['added', 'removed', 'changed', 'moved', 'identical', 'direct', 'potential', 'unknown'].every(key => integer(counts[key]))) return fail();
    if (['added', 'removed', 'changed', 'moved', 'identical'].reduce((sum, key) => sum + Number(counts[key]), 0) !== structure.total_nodes || ['direct', 'potential', 'unknown'].reduce((sum, key) => sum + Number(counts[key]), 0) > structure.total_nodes) return fail();
    for (const node of structure.nodes) if (!object(node) || !['id', 'name', 'kind'].every(key => text(node[key])) || !['added', 'removed', 'changed', 'moved', 'identical'].includes(String(node.change)) || !['direct', 'potential', 'unknown', 'not_observed'].includes(String(node.impact)) || !optionalRange(node.old_range) || !optionalRange(node.new_range) || !strings(node.reasons)) return fail();
    if (!object(omitted) || !integer(omitted.parameters) || !integer(omitted.factors)) return fail();
    for (const rows of [impact.parameters, impact.factors]) {
        if (!Array.isArray(rows)) return fail();
        for (const row of rows) {
            if (!object(row) || !integer(row.index) || !text(row.name) || !['direct', 'potential', 'unknown', 'quote_present'].includes(String(row.status)) || !Array.isArray(row.quotes) || !strings(row.node_ids) || !strings(row.limitations)) return fail();
            for (const quote of row.quotes) if (!object(quote) || !text(quote.field) || !text(quote.quote) || !['missing', 'moved', 'present', 'ambiguous', 'unknown'].includes(String(quote.status)) || !ranges(quote.old_lines) || !ranges(quote.new_lines) || !integer(quote.old_occurrences) || !integer(quote.new_occurrences) || typeof quote.truncated !== 'boolean') return fail();
        }
    }
    if (!object(recommendation) || recommendation.action !== 'full_reanalysis' || recommendation.start_stage !== 'normalize' || recommendation.can_reuse_stages !== false || !strings(recommendation.reasons)) return fail();
    return value as unknown as QuantSourceImpactPreview;
}
