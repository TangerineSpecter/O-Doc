import {resolveVerificationRoute} from './verification';
import {mockClassificationLabels} from './vocabularyClassification';
import {mockHybridSearch} from './retrieval';
import {HttpResponse} from 'msw';
import {mockFactorExport} from './exports';
import type {QuantEntryDetail, QuantFactorCandidate, QuantFactorCuration, QuantFactorGrouping} from '../../types/api/quant';
import {collectMockFactors} from './factors';
import {mockMergedGroup} from './comparisons';
import {resolveFormulaVersionRoute, rootId} from './formulaVersions';
import {persistQuantState, quantId, quantState} from './state';
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
const families = ['', 'momentum', 'trend', 'volatility', 'mean_reversion', 'volume', 'price_structure', 'fundamental', 'other'];
const groupKey = (item: QuantFactorCandidate, mode: QuantFactorGrouping, collection: string, items: QuantFactorCandidate[]) => mode === 'none' ? item.id : mode === 'lineage' ? rootId(item) : mode === 'merged' ? mockMergedGroup(collection, item.id, items)?.id || item.id : item.fingerprints[mode] || item.id;
const normalize = (values: string[]) => [...new Map(values.map(item => item.normalize('NFKC').trim()).filter(Boolean).map(item => [item.toLowerCase(), item])).values()];
export async function resolveFactorRoute(request: Request, entries: QuantEntryDetail[], id?: string, action?: string, detailAction?: string) {
    let items = collectMockFactors(entries).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    const allItems = items;
    const collection = entries[0]?.collId || '';
    if (id === 'search' && !action && request.method === 'POST') return mockHybridSearch(request, items);
    const target = items.find(row => row.id === id);
    if (id && !target) return fail(404, '候选不存在或无权访问');
    if (target && action === 'verification') return resolveVerificationRoute(request, target, collection);
    if (target && action === 'formula-versions') return resolveFormulaVersionRoute(request, target, items, detailAction);
    if (request.method === 'PATCH' && target && !action) {
        const body = await request.json() as {data?: QuantFactorCuration; expectedRevisionId?: string};
        const data = body.data;
        if (!data || typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 200 || !families.slice(1).includes(data.family) || typeof data.note !== 'string' || data.note.length > 10000 || !Array.isArray(data.tags) || data.tags.length > 30 || data.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.normalize('NFKC').trim().length > 50) || !Array.isArray(data.aliases) || data.aliases.length > 30 || data.aliases.some(alias => typeof alias !== 'string' || !alias.trim() || alias.normalize('NFKC').trim().length > 100)) return fail(400, '候选整理字段无效');
        if (body.expectedRevisionId !== target.currentRevisionId) return fail(409, '因子已有新修订，请刷新后合并修改');
        const revision = {id: quantId('factor-revision'), parentId: target.currentRevisionId, data: {name: data.name.trim(), family: data.family, tags: normalize(data.tags), aliases: normalize(data.aliases), note: data.note}, createdAt: new Date().toISOString()};
        (quantState().factorRevisions[target.id] ||= []).push(revision); persistQuantState();
        return collectMockFactors(entries).find(row => row.id === target.id);
    }
    if (request.method !== 'GET') return fail(405, '不支持此操作');
    if (target && action === 'export') return mockFactorExport(target, new URL(request.url).searchParams.get('target') || 'python');
    if (target && !action) return target;
    const params = new URL(request.url).searchParams;
    const mode = (params.get('groupBy') || params.get('group_by') || 'none') as QuantFactorGrouping;
    const role = params.get('role') || '', family = params.get('family') || '';
    const q = (params.get('q') || '').trim().toLowerCase();
    const reuseStatus = params.get('reuseStatus') || '';
    const taxonomyTerm = params.get('taxonomyTerm') || params.get('taxonomy_term') || '';
    const sourceEntry = params.get('entryId') || params.get('entry_id');
    const offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || 40);
    if (!['', 'reusable', 'candidate', 'unchecked'].includes(reuseStatus) || !['none', 'raw', 'expression', 'merged', 'lineage'].includes(mode) || !['', 'factor', 'signal', 'filter', 'risk', 'execution', 'display'].includes(role) || !families.includes(family) || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100 || q.length > 200) return fail(400, '候选筛选参数无效');
    if (target && action === 'occurrences') {
        items = items.filter(item => groupKey(item, mode, collection, allItems) === groupKey(target, mode, collection, allItems));
        return {total: items.length, items: items.slice(offset, offset + limit)};
    }
    const matches = (row: QuantFactorCandidate, withTerm = true) => (!role || row.data.role === role) && (!family || row.curation.family === family) && (!sourceEntry || row.entryId === sourceEntry) && (!taxonomyTerm || row.classification?.terms.some(term => term.id === taxonomyTerm)) && (!reuseStatus || row.verification?.reuseStatus === reuseStatus) && (!withTerm || !q || `${row.data.name} ${row.data.summary} ${row.data.formula} ${row.data.expression ? JSON.stringify(row.data.expression) : ''} ${row.curation.name} ${row.curation.note} ${row.curation.tags.join(' ')} ${row.curation.aliases.join(' ')} ${row.entryTitle} ${mockClassificationLabels(row).join(' ')}`.toLowerCase().includes(q));
    if (mode === 'lineage') {
        const groups = new Map<string, QuantFactorCandidate[]>();
        for (const row of allItems) {const key = rootId(row); groups.set(key, [...(groups.get(key) || []), row]);}
        const state = quantState();
        const selected = [...groups.entries()].filter(([, members]) => members.some(row => matches(row))).map(([root, members]) => {
            const pointer = state.formulaHeads[root] || '';
            const current = state.formulaSelections.find(row => row.id === pointer)?.candidateId || root;
            const head = members.find(row => row.id === current) || members.find(row => row.id === root) || members[0];
            return {...head, occurrenceCount: members.length, formulaLineage: {id: 'lineage:' + root, rootCandidateId: root, currentCandidateId: current,
                currentSelectionId: pointer, currentAvailable: members.some(row => row.id === current), versionsTotal: members.length}};
        });
        return {total: selected.length, occurrenceTotal: selected.reduce((sum, row) => sum + row.occurrenceCount, 0), items: selected.slice(offset, offset + limit)};
    }
    if (mode === 'merged') {
        const selected: QuantFactorCandidate[] = [], seen = new Set<string>();
        for (const row of allItems) {
            const group = mockMergedGroup(collection, row.id, allItems)!;
            if (seen.has(group.id)) continue;
            seen.add(group.id);
            const members = allItems.filter(item => group.memberIds.includes(item.id));
            const labelMatch = !!q && [...group.names, ...group.aliases].some(label => label.toLowerCase().includes(q));
            if (members.some(item => matches(item)) || labelMatch && members.some(item => matches(item, false))) {
                selected.push({...members[0], occurrenceCount: members.length, mergedGroup: group});
            }
        }
        return {total: selected.length, occurrenceTotal: selected.reduce((sum, item) => sum + item.occurrenceCount, 0), items: selected.slice(offset, offset + limit)};
    }
    items = items.filter(row => matches(row));
    const groups = new Map<string, QuantFactorCandidate>();
    for (const item of items) {
        const key = groupKey(item, mode, collection, allItems), existing = groups.get(key);
        if (existing) existing.occurrenceCount++;
        else groups.set(key, {...item});
    }
    return {total: groups.size, occurrenceTotal: items.length, items: [...groups.values()].slice(offset, offset + limit)};
}
