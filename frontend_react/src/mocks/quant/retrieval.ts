import {mockClassificationLabels} from './vocabularyClassification';
import {HttpResponse} from 'msw';
import type {QuantFactorCandidate} from '../../types/api/quant';
import type {QuantSearchQuery, QuantSearchResult} from '../../types/api/quantRetrieval';

export async function mockHybridSearch(request: Request, candidates: QuantFactorCandidate[]): Promise<QuantSearchResult | Response> {
    const body = await request.json() as QuantSearchQuery;
    const q = body.q?.normalize('NFKC').trim().toLowerCase() || '';
    if (!q || q.length > 200 || !['none', 'raw', 'expression'].includes(body.groupBy || 'none')) return HttpResponse.json({code: 400, msg: '请输入 1–200 字符查询及有效分组', data: null}, {status: 400});
    const rows = candidates.filter(row => (!body.role || row.data.role === body.role) && (!body.family || row.curation.family === body.family) && (!body.entryId || row.entryId === body.entryId) && (!body.taxonomyTerm || row.classification?.terms.some(term => term.id === body.taxonomyTerm)) && (!body.reuseStatus || row.verification?.reuseStatus === body.reuseStatus)&&(!body.admissionStage||row.admission?.stage===body.admissionStage));
    const groups = new Map<string, QuantFactorCandidate>();
    let occurrences = 0;
    for (const row of rows) {
        const fields = [['名称', row.data.name + row.curation.name], ['标签或别名', [...row.curation.tags, ...row.curation.aliases].join(' ')], ['公式或表达式', row.data.formula + JSON.stringify(row.data.expression)], ['说明', row.data.summary + row.curation.note], ['来源标题', row.entryTitle], ['分类词表', mockClassificationLabels(row).join(' ')]];
        const keywordFields = fields.filter(([, text]) => text.normalize('NFKC').toLowerCase().includes(q)).map(([label]) => label);
        // A named fixture query demonstrates semantic-only recall, never a fake embedding request.
        const semantic = q === '上涨强度' && row.curation.family === 'momentum';
        if (!keywordFields.length && !semantic) continue;
        occurrences++;
        const key = row.fingerprints[body.groupBy === 'raw' ? 'raw' : body.groupBy === 'expression' ? 'expression' : 'raw'];
        const groupKey = body.groupBy && body.groupBy !== 'none' && key ? key : row.id;
        const existing = groups.get(groupKey);
        if (existing) existing.occurrenceCount++;
        else groups.set(groupKey, {...row, occurrenceCount: 1, searchMatch: {keywordFields, semanticSimilarity: semantic ? .82 : null, method: 'local-demo', rankScore: 0, projectionHash: '', modelSignature: 'local-demo'}});
    }
    const items = [...groups.values()].slice(0, 100);
    return {items, total: items.length, occurrenceTotal: occurrences, search: {method: 'local-demo', query: q, semanticStatus: 'local_demo', modelName: '本地演示', candidateTotal: rows.length, indexedTotal: rows.length, matchedGroups: groups.size, returnedGroups: items.length, limit: 100, semanticThreshold: .3, claim: 'retrieval_relevance_only'}};
}
