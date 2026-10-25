/** Explicit artificial fixtures, never a source-to-expression translator. */
import type {QuantEntryDetail, QuantFactorData, QuantReport, QuantSource} from '../../types/api/quant';
import type {QuantRepairResult} from '../../types/api/quantRepair';
import {quantState} from './state';

export function mockRepair(source: QuantSource | undefined, factors: QuantFactorData[]): QuantRepairResult {
    const code = source?.payload.code || '';
    if (!code.includes('LOCAL_AI_REPAIR') || !factors.length) return {version: 1, selected: [], omitted: [], items: []};
    const {evidence: _evidence, ...definition} = structuredClone(factors[0]);
    definition.expression = {op: 'sub', args: [{op: 'div', args: [{op: 'input', name: 'close'}, {op: 'lag', args: [{op: 'input', name: 'close'}, {op: 'parameter', name: 'lookback'}]}]}, {op: 'constant', value: 1}]};
    const unresolved = code.includes('LOCAL_AI_REPAIR_UNRESOLVED');
    return {version: 1, selected: [0], omitted: [], items: [{factorIndex: 0, status: unresolved ? 'unresolved' : 'revised',
        summary: unresolved ? '本地人工样例：缺少依赖正文，保留原候选和缺失原因。' : '本地人工样例：补齐受控滞后比值表达式；未调用模型或核对源码语义。',
        definition: unresolved ? null : definition, evidence: [{field: 'code', quote: code.slice(0, 500)}],
        remainingUnknowns: ['原平台等价、数据口径与实证尚未验证'], beforeHash: 'local-before', afterHash: unresolved ? '' : 'local-after', changedFields: unresolved ? [] : ['expression']}]};
}

export function publishMockRepairs(entry: QuantEntryDetail, report: QuantReport) {
    const state = quantState();
    for (const item of report.data.factorRepair?.items || []) {
        if (item.status !== 'revised' || !item.definition) continue;
        const parent = `candidate-${report.id}-${item.factorIndex}`, id = `local-ai-repair-${report.id}-${item.factorIndex}`;
        if (state.derivedFactors.some(row => row.id === id)) continue;
        const data: QuantFactorData = {...structuredClone(item.definition), evidence: [], formulaVersion: {version: 1,
            versionId: `local-repair-version-${report.id}-${item.factorIndex}`, rootId: parent, origin: 'ai_repair', parentCandidateIds: [parent],
            claim: 'ai_revised_definition_not_source_extraction_or_platform_equivalence'}};
        state.formulaRoots[id] = parent;
        state.derivedFactors.push({id, reportId: report.id, sourceId: report.sourceId, entryId: entry.id, entryTitle: entry.title === '待分析资料' ? report.data.title || entry.title : entry.title,
            data, contentHash: 'local-ai-repair-' + id, expressionHash: 'local-ai-expression-' + id, fingerprints: {raw: '', expression: 'local-ai-expression-' + id},
            occurrenceCount: 1, currentRevisionId: '', revisions: [], curation: {name: data.name, family: data.family, tags: data.tags, aliases: [], note: ''},
            modelName: 'AI 定义修订 · 本地人工样例', evidenceStatus: 'ai_revised_unverified', createdAt: report.createdAt});
    }
}

export function mockRepairDetail(candidateId: string, reportId: string) {
    const report = quantState().entries.flatMap(entry => entry.reports || []).find(row => row.id === reportId);
    const aiRevisions = []; let aiRevision = null;
    for (const item of report?.data.factorRepair?.items || []) {
        if (item.status !== 'revised' || !item.definition) continue;
        const root = `candidate-${reportId}-${item.factorIndex}`, child = `local-ai-repair-${reportId}-${item.factorIndex}`;
        if (candidateId === root) aiRevisions.push({candidateId: child, name: item.definition.name, summary: item.summary});
        if (candidateId === child) aiRevision = {summary: item.summary, changedFields: item.changedFields, evidence: item.evidence,
            remainingUnknowns: item.remainingUnknowns, parentCandidateId: root};
    }
    return {aiRevisions, aiRevision};
}
