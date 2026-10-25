import {HttpResponse} from 'msw';
import builtinText from './vocabularyBuiltin.json?raw';
import {persistQuantState, quantId, quantState} from './state';
import type {QuantVocabulary, VocabularyEdit, VocabularyReference, VocabularyTerm} from '../../types/api/quantVocabulary';

export interface MockVocabularyRevision {id: string; parentId: string; requestKey: string; data: QuantVocabulary['catalog']; term: VocabularyTerm; createdAt: string}
export interface MockVocabularyBook {head: string; revisions: MockVocabularyRevision[]}
const dimensions: QuantVocabulary['dimensions'] = {mechanism: '机制', structure: '时序与截面', asset: '资产', frequency: '频率', data: '数据要求', usage: '用途', platform: '平台', tunability: '参数声明', evidence: '证据状态'};
const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase();
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
const fixture = () => JSON.parse(builtinText) as QuantVocabulary['catalog'];
const ref = (id: string): VocabularyReference => ({version: 1, builtinVersion: 1, revisionId: id, contentHash: id ? 'local-demo-vocabulary-' + id : 'local-demo-builtin-v1'});
export function mockVocabulary(collection: string, revisionId = '', offset = 0): QuantVocabulary {
    const book = quantState().vocabularies[collection];
    const selected = revisionId || book?.head || '';
    const revision = book?.revisions.find(row => row.id === selected);
    const catalog = revision?.data || fixture();
    const aliases = new Map<string, VocabularyTerm[]>();
    for (const term of catalog.terms.filter(row => row.active)) for (const value of [term.label, ...term.aliases]) {
        const key = normalize(value), rows = aliases.get(key) || [];
        if (!rows.some(row => row.id === term.id)) aliases.set(key, [...rows, term]);
    }
    const present = new Set(catalog.terms.map(row => row.id));
    const all = new Map(book?.revisions.flatMap(row => row.data.terms).map(term => [term.id, term]));
    return {catalog, reference: ref(selected), currentReference: ref(book?.head || ''), dimensions,
        ambiguities: [...aliases.entries()].filter(([, rows]) => rows.length > 1).map(([label, rows]) => ({label, codes: rows.map(row => row.id), labels: rows.map(row => row.label)})),
        archivedConcepts: [...all.values()].filter(term => !present.has(term.id)).map(({id, dimension, definition}) => ({id, dimension, definition})),
        historyTotal: book?.revisions.length || 0,
        history: [...book?.revisions || []].reverse().slice(offset, offset + 20).map(row => ({id: row.id, parentId: row.parentId, contentHash: ref(row.id).contentHash, reason: row.data.reason, createdAt: row.createdAt}))};
}

export async function resolveVocabularyRoute(request: Request, collection: string) {
    if (request.method === 'GET') {
        const params = new URL(request.url).searchParams, id = params.get('selectedRevisionId') || '';
        const offset = Number(params.get('offset') || 0);
        if (!Number.isInteger(offset) || offset < 0) return fail(400, '历史分页无效');
        if (id && !quantState().vocabularies[collection]?.revisions.some(row => row.id === id)) return fail(400, '未找到该文集的词表版本');
        return mockVocabulary(collection, id, offset);
    }
    if (request.method !== 'POST') return fail(405, '不支持此词表操作');
    const body = await request.json() as VocabularyEdit;
    const term = body.term;
    if (!term || typeof term.id !== 'string' || !new RegExp(`^${term.dimension}:[a-z][a-z0-9_]{0,38}$`).test(term.id) || term.id.length > 48 || !Object.prototype.hasOwnProperty.call(dimensions, term.dimension) || term.dimension === 'evidence'
        || typeof term.label !== 'string' || !term.label.trim() || term.label.normalize('NFKC').trim().length > 50 || !Array.isArray(term.aliases) || term.aliases.length > 12 || term.aliases.some(value => typeof value !== 'string' || !value.trim() || value.normalize('NFKC').trim().length > 50)
        || typeof term.definition !== 'string' || !term.definition.trim() || term.definition.trim().length > 500 || typeof term.active !== 'boolean'
        || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 3000 || !/^[A-Za-z0-9_-]{16,64}$/.test(body.requestKey || '')) return fail(400, '词条字段、稳定编码或修订理由无效');
    const normalized = {...term, label: term.label.normalize('NFKC').trim(), definition: term.definition.trim(), aliases: [...new Map(term.aliases.map(value => value.normalize('NFKC').trim()).filter(value => normalize(value) !== normalize(term.label)).map(value => [normalize(value), value])).values()]};
    const previous = quantState().vocabularies[collection]?.revisions.find(row => row.requestKey === body.requestKey);
    if (previous) return JSON.stringify(previous.term) === JSON.stringify(normalized) && previous.parentId === body.expectedRevisionId && previous.data.reason === body.reason.trim() ? mockVocabulary(collection) : fail(409, '请求标识已用于另一份词表修订');
    const current = mockVocabulary(collection);
    if (current.currentReference.revisionId !== body.expectedRevisionId) return fail(409, '分类词表已有新版本，请刷新后合并修改');
    const known = current.catalog.terms.find(row => row.id === term.id) || quantState().vocabularies[collection]?.revisions.flatMap(row => row.data.terms).find(row => row.id === term.id);
    if (known && (known.definition !== normalized.definition || known.dimension !== normalized.dimension)) return fail(400, '稳定词条含义不可重用，请新增词条');
    if (JSON.stringify(known) === JSON.stringify(normalized)) return fail(400, '词条内容没有变化');
    if (current.catalog.terms.some(row => row.id !== term.id && row.dimension === term.dimension && normalize(row.label) === normalize(normalized.label))) return fail(400, '同一维度的规范名称不能重复');
    const terms = [...current.catalog.terms.filter(row => row.id !== term.id), normalized].sort((a, b) => a.id.localeCompare(b.id));
    if (terms.length > 192) return fail(400, '词表最多 192 项');
    const book = quantState().vocabularies[collection] ||= {head: '', revisions: []};
    const id = quantId('vocabulary');
    book.revisions.push({id, parentId: book.head, requestKey: body.requestKey, term: normalized, data: {...current.catalog, reason: body.reason.trim(), terms}, createdAt: new Date().toISOString()});
    book.head = id; persistQuantState();
    return mockVocabulary(collection);
}
