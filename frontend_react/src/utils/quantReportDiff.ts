import type {QuantReport} from '../types/api/quant';
type ReportRecord=Omit<QuantReport,'originalMarkdown'|'revisions'>;
import type {NamedReportChange, ReportRecordDiff, ReportDiffLine, ReportTextDiff} from '../types/quantReportDiff';

export const isStaticReport = (report: Pick<ReportRecord,'schemaVersion'>) => [1, 2, 3].includes(report.schemaVersion);
const time = (report: ReportRecord) => Number.isFinite(Date.parse(report.createdAt)) ? Date.parse(report.createdAt) : 0;
export function comparisonReports(reports: ReportRecord[], current: ReportRecord): ReportRecord[] {
    if (!isStaticReport(current)) return [];
    return reports.filter(row => row.id !== current.id && isStaticReport(row)).sort((a, b) => time(b) - time(a) || a.id.localeCompare(b.id));
}
export function defaultReportBaseline(reports: ReportRecord[], current: ReportRecord): ReportRecord | undefined {
    const options = comparisonReports(reports, current);
    return options.find(row => time(row) <= time(current)) || options[options.length - 1];
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
    return JSON.stringify(value) ?? 'undefined';
}
/** Literal name/role pairing, never a factor identity or equivalence decision. */
export function namedReportChanges<T extends object>(before: T[], after: T[], key: (row: T) => string): NamedReportChange<T>[] {
    const group = (rows: T[]) => {
        const map = new Map<string, T[]>();
        for (const row of rows) map.set(key(row), [...(map.get(key(row)) || []), row]);
        return map;
    };
    const old = group(before), next = group(after);
    return [...new Set([...old.keys(), ...next.keys()])].sort().map<NamedReportChange<T>>(name => {
        const a = old.get(name) || [], b = next.get(name) || [];
        const fields = a.length === 1 && b.length === 1 ? [...new Set([...Object.keys(a[0]), ...Object.keys(b[0])])].sort()
            .filter(field => canonical((a[0] as Record<string, unknown>)[field]) !== canonical((b[0] as Record<string, unknown>)[field])) : [];
        return {name, beforeCount: a.length, afterCount: b.length, changedFields: fields,
            ...(a.length === 1 && {before: a[0]}), ...(b.length === 1 && {after: b[0]}),
            status: a.length > 1 || b.length > 1 ? 'ambiguous' : !a.length ? 'added' : !b.length ? 'removed' : fields.length ? 'changed' : 'unchanged'};
    });
}

export function compareReportRecords(baseline: ReportRecord, current: ReportRecord): ReportRecordDiff {
    if (!isStaticReport(baseline) || !isStaticReport(current)) throw new Error('仅可对照同一条目的静态研究报告');
    const before = baseline.data, after = current.data;
    const comparable = !!before.rubricVersion && before.rubricVersion === after.rubricVersion;
    const scoresA = new Map((before.scores || []).map(row => [row.dimension, row]));
    const scoresB = new Map((after.scores || []).map(row => [row.dimension, row]));
    const delta = (a?: number | null, b?: number | null) => comparable && typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
    const parametersAvailable = Array.isArray(before.parameters) && Array.isArray(after.parameters);
    const factorsAvailable = before.extractionVersion === 1 && after.extractionVersion === 1 && Array.isArray(before.factors) && Array.isArray(after.factors);
    const findingsAvailable = before.sourceFindingsVersion === 1 && after.sourceFindingsVersion === 1 && Array.isArray(before.sourceFindings) && Array.isArray(after.sourceFindings);
    return {baseline, current, sameSource: baseline.sourceId === current.sourceId,
        rubricBefore: before.rubricVersion, rubricAfter: after.rubricVersion, scoresComparable: comparable,
        scores: [...new Set([...scoresA.keys(), ...scoresB.keys()])].map(dimension => ({dimension, before: scoresA.get(dimension), after: scoresB.get(dimension), delta: delta(scoresA.get(dimension)?.score, scoresB.get(dimension)?.score)})),
        total: {before: before.totalScore ?? null, after: after.totalScore ?? null, delta: delta(before.totalScore, after.totalScore)},
        parametersAvailable, parameters: parametersAvailable ? namedReportChanges(before.parameters!, after.parameters!, row => row.name) : [],
        factorsAvailable, factors: factorsAvailable ? namedReportChanges(before.factors!, after.factors!, row => `${row.role} · ${row.name}`) : [],
        findingsAvailable, findings: findingsAvailable ? namedReportChanges(before.sourceFindings!, after.sourceFindings!, row => `${row.category} · ${row.title}`) : []};
}

/** Bounded LCS on literal lines; no source execution or semantic model judgment. */
export function compareReportText(before: string, after: string): ReportTextDiff {
    const lineCount = (value: string) => {let count = value.length ? 1 : 0; for (let i = 0; i < value.length; i++) if (value[i] === '\n' || value[i] === '\r') {count++; if (value[i] === '\r' && value[i + 1] === '\n') i++;} return count;};
    if (before === after) return {beforeLines: lineCount(before), afterLines: lineCount(after), status: 'identical', additions: 0, deletions: 0, hunks: [], totalHunks: 0, omittedHunks: 0};
    if (before.length > 240_000 || after.length > 240_000) return {beforeLines: lineCount(before), afterLines: lineCount(after), status: 'limited', additions: null, deletions: null, hunks: [], totalHunks: null, omittedHunks: 0};
    const a = before ? before.replace(/\r\n?/g, '\n').split('\n') : [], b = after ? after.replace(/\r\n?/g, '\n').split('\n') : [];
    const base = {beforeLines: a.length, afterLines: b.length};
    if (a.length === b.length && a.every((line, i) => line === b[i])) return {...base, status: 'identical', additions: 0, deletions: 0, hunks: [], totalHunks: 0, omittedHunks: 0};
    if (a.length > 1200 || b.length > 1200 || a.length * b.length > 360_000)
        return {...base, status: 'limited', additions: null, deletions: null, hunks: [], totalHunks: null, omittedHunks: 0};
    const width = b.length + 1, matrix = new Uint16Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
        matrix[i * width + j] = a[i] === b[j] ? 1 + matrix[(i + 1) * width + j + 1] : Math.max(matrix[(i + 1) * width + j], matrix[i * width + j + 1]);
    const lines: ReportDiffLine[] = [];
    let i = 0, j = 0, additions = 0, deletions = 0;
    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) {lines.push({kind: 'context', text: a[i], beforeLine: ++i, afterLine: ++j});}
        else if (j < b.length && (i === a.length || matrix[i * width + j + 1] > matrix[(i + 1) * width + j])) {
            lines.push({kind: 'added', text: b[j], beforeLine: null, afterLine: ++j}); additions++;
        } else {lines.push({kind: 'removed', text: a[i], beforeLine: ++i, afterLine: null}); deletions++;}
    }
    const spans: [number, number][] = [];
    for (let index = 0; index < lines.length; index++) if (lines[index].kind !== 'context') {
        const start = Math.max(0, index - 2), end = Math.min(lines.length, index + 3), last = spans[spans.length - 1];
        if (last && start <= last[1]) last[1] = Math.max(last[1], end); else spans.push([start, end]);
    }
    return {...base, status: 'compared', additions, deletions, hunks: spans.slice(0, 40).map(([start, end]) => lines.slice(start, end)), totalHunks: spans.length, omittedHunks: Math.max(0, spans.length - 40)};
}
