import {readAlgorithmProgram} from '../../utils/quantAlgorithm';
import {mockRepairDetail} from './repairs';
/** Typed local artifacts and reversible working heads; no model/market claims. */
import {HttpResponse} from 'msw';
import type {QuantFactorCandidate, QuantFactorData} from '../../types/api/quant';
import type {QuantFormulaHistory} from '../../types/api/quantFormulaVersion';
import {persistQuantState, quantId, quantState} from './state';
export interface MockFormulaEdit {id: string; rootId: string; parentId: string; candidateId: string; requestKey: string; definitionJson: string; reason: string}
export interface MockFormulaSelection {id: string; rootId: string; candidateId: string; parentId: string; reason: string; requestKey: string; createdAt: string}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = (code: number, msg: string) => HttpResponse.json({code, msg, data: null}, {status: code});
function canonical(value: unknown, depth = 0): string {
    if (depth > 40) throw new Error('公式定义嵌套过深');
    if (Array.isArray(value)) return '[' + value.map(item => canonical(item, depth + 1)).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], depth + 1)).join(',') + '}';
    return JSON.stringify(value);
}
export const rootId = (candidate: QuantFactorCandidate) => quantState().formulaRoots[candidate.id] || candidate.data.formulaVersion?.rootId || candidate.id;
function expressionFormat(value: unknown, storage: boolean): unknown {
    if (!object(value)) return value;
    const program = readAlgorithmProgram(value);
    if (program) {
        const {outputType, ...rest} = program;
        return storage ? {...rest, output_type: outputType} : program;
    }
    return {...value, ...(Array.isArray(value.args) ? {args: value.args.map(child => expressionFormat(child, storage))} : {})};
}
function encode(candidate: QuantFactorCandidate): string {
    const {evidence: _evidence, derivation: _derivation, formulaVersion: _version, outputType, inputs, parameters, ...rest} = candidate.data;
    return JSON.stringify({...rest, expression: expressionFormat(rest.expression, true), output_type: outputType, inputs: inputs.map(({missingPolicy, ...row}) => ({...row, missing_policy: missingPolicy})),
        parameters: parameters.map(({defaultValue, domain, ...row}) => ({...row, default_value: defaultValue,
            ...(domain ? {domain: Object.fromEntries(Object.entries(domain).map(([key, value]) => [key === 'stepOrigin' ? 'step_origin' : key, value]))} : {})}))}, null, 2);
}
function decode(json: string): QuantFactorData {
    const value: unknown = JSON.parse(json);
    if (!object(value) || 'evidence' in value || 'derivation' in value || 'formula_version' in value
        || !['name', 'role', 'family', 'summary', 'formula', 'units', 'timeframe', 'limitations'].every(key => typeof value[key] === 'string' && !!value[key])
        || !Array.isArray(value.inputs) || !value.inputs.length || !Array.isArray(value.parameters)
        || !Array.isArray(value.tags) || !Array.isArray(value.dependencies)) throw new Error('完整公式定义无效');
    const inputs = value.inputs.map(row => {
        if (!object(row) || !['name', 'meaning', 'availability', 'missing_policy'].every(key => typeof row[key] === 'string')) throw new Error('输入声明无效');
        return {name: String(row.name), meaning: String(row.meaning), availability: String(row.availability), missingPolicy: String(row.missing_policy)};
    });
    const parameters = value.parameters.map(row => {
        if (!object(row) || !['name', 'type', 'default_value', 'category', 'meaning', 'constraints', 'effect', 'suggestion', 'evidence'].every(key => typeof row[key] === 'string')) throw new Error('参数声明无效');
        const {default_value, domain, ...rest} = row;
        return {...rest, defaultValue: default_value, ...(object(domain) ? {domain: Object.fromEntries(Object.entries(domain).map(([key, value]) => [key === 'step_origin' ? 'stepOrigin' : key, value]))} : {})} as QuantFactorData['parameters'][number];
    });
    let count = 0;
    const visit = (node: unknown, depth: number) => {
        if (++count > 128 || depth > 12 || !object(node) || typeof node.op !== 'string') throw new Error('表达式过深、过大或无效');
        if (node.op === 'program') {readAlgorithmProgram(node); return;}
        if (node.op === 'input' && inputs.some(row => row.name === node.name)) return;
        if (node.op === 'parameter' && parameters.some(row => row.name === node.name)) return;
        if (node.op === 'constant' && (typeof node.value === 'string' || typeof node.value === 'number' && Number.isFinite(node.value))) return;
        const arity = ['abs', 'neg', 'log'].includes(node.op) ? 1 : ['add', 'sub', 'mul', 'div', 'min', 'max', 'gt', 'lt', 'eq', 'and', 'or', 'gate', 'lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank'].includes(node.op) ? 2 : 0;
        if (!arity || !Array.isArray(node.args) || node.args.length !== arity) throw new Error('表达式含未声明引用或未知算子');
        node.args.forEach(child => visit(child, depth + 1));
    };
    if (value.expression !== null) visit(value.expression, 0);
    const {output_type, inputs: _inputs, parameters: _parameters, ...rest} = value;
    return {...rest, expression: expressionFormat(rest.expression, false), outputType: output_type, inputs, parameters, evidence: []} as unknown as QuantFactorData;
}
function history(target: QuantFactorCandidate, items: QuantFactorCandidate[], offset: number): QuantFormulaHistory {
    const state = quantState(), root = rootId(target), members = items.filter(row => rootId(row) === root);
    const selections = state.formulaSelections.filter(row => row.rootId === root).slice().reverse();
    const head = selections.find(row => row.id === state.formulaHeads[root]);
    return {version: 1, rootCandidateId: root, candidateId: target.id, definitionJson: encode(target), currentCandidateId: head?.candidateId || root,
        rootName: items.find(row => row.id === root)?.data.name || target.data.name, candidateName: target.data.name,
        currentName: items.find(row => row.id === (head?.candidateId || root))?.data.name || target.data.name,
        currentSelectionId: state.formulaHeads[root] || '', versionsTotal: members.length,
        versions: members.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(offset, offset + 20).map(row => ({id: row.data.formulaVersion?.versionId || (state.formulaRoots[row.id] ? `local-version-${row.id}` : ''), candidateId: row.id, candidateHash: row.contentHash, name: row.data.name,
            origin: row.data.formulaVersion ? row.data.formulaVersion.origin : row.data.derivation ? 'experiment' : 'source', parentCandidateIds: row.data.formulaVersion?.parentCandidateIds || row.data.derivation?.parentCandidateIds || [],
            reason: state.formulaEdits.find(edit => edit.candidateId === row.id)?.reason || mockRepairDetail(row.id, row.reportId).aiRevision?.summary || '人工 local 来源/实验样例；尚未独立验证。', createdAt: row.createdAt, formula: row.data.formula, expressionHash: row.expressionHash})),
        selectionsTotal: selections.length, selections: selections.slice(offset, offset + 20), claim: 'working_version_only_not_performance_promotion'};
}
export async function resolveFormulaVersionRoute(request: Request, target: QuantFactorCandidate, items: QuantFactorCandidate[], action?: string) {
    const state = quantState(), root = rootId(target), params = new URL(request.url).searchParams;
    const offset = Number(params.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0) return fail(400, '版本分页无效');
    if (request.method === 'GET') return history(target, items, offset);
    if (request.method !== 'POST') return fail(405, '不支持此操作');
    const body = await request.json() as {requestKey: string; definitionJson?: string; reason: string; expectedSelectionId?: string};
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(body.requestKey || '') || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 3000) return fail(400, '请填写有效请求标识与理由');
    if (action === 'select') {
        const old = state.formulaSelections.find(row => row.rootId === root && row.requestKey === body.requestKey);
        if (old) return old.candidateId === target.id && old.reason === body.reason && old.parentId === body.expectedSelectionId ? history(target, items, offset) : fail(409, '请求标识已用于其他选择');
        if ((state.formulaHeads[root] || '') !== body.expectedSelectionId) return fail(409, '当前研究版本已经改变，请刷新后重试');
        const row: MockFormulaSelection = {id: quantId('formula-selection'), rootId: root, candidateId: target.id, parentId: body.expectedSelectionId, reason: body.reason, requestKey: body.requestKey, createdAt: new Date().toISOString()};
        state.formulaSelections.push(row); state.formulaHeads[root] = row.id; persistQuantState();
        return history(target, items, offset);
    }
    if (typeof body.definitionJson !== 'string' || body.definitionJson.length > 150000) return fail(400, '公式定义须为有界 JSON');
    let data: QuantFactorData;
    try {
        data = decode(body.definitionJson);
        if (canonical(JSON.parse(body.definitionJson)) === canonical(JSON.parse(encode(target)))) return fail(400, '公式定义没有改变');
    } catch (cause) {return fail(400, cause instanceof Error ? cause.message : '公式定义无效');}
    const old = state.formulaEdits.find(row => row.rootId === root && row.requestKey === body.requestKey);
    if (old) return old.parentId === target.id && old.definitionJson === body.definitionJson && old.reason === body.reason ? {candidate: items.find(row => row.id === old.candidateId), history: history(target, items, offset)} : fail(409, '请求标识已用于其他公式修订');
    const id = quantId('authored-formula'), versionId = quantId('formula-version');
    data.formulaVersion = {version: 1, versionId, rootId: root, origin: 'authored', parentCandidateIds: [target.id], claim: 'authored_definition_not_source_extraction'};
    const child: QuantFactorCandidate = {...structuredClone(target), id, data, modelName: '人工公式修订 · 本地样例', evidenceStatus: 'authored_unverified',
        createdAt: new Date().toISOString(), contentHash: `local-artificial-${versionId}`, expressionHash: data.expression ? `local-artificial-${id}` : '',
        currentRevisionId: '', revisions: [], curation: {name: data.name, family: data.family, aliases: [], tags: data.tags, note: ''}, fingerprints: {raw: '', expression: data.expression ? `local-artificial-${id}` : ''}};
    state.derivedFactors.unshift(child); state.formulaRoots[id] = root;
    state.formulaEdits.push({id: versionId, rootId: root, parentId: target.id, candidateId: id, requestKey: body.requestKey, definitionJson: body.definitionJson, reason: body.reason});
    persistQuantState(); return {candidate: child, history: history(child, [child, ...items], offset)};
}
