import {renameParameterCondition} from '../../utils/quantParameterConditions';
import {evolutionNames, readTransformation, type transformationSnapshot} from '../../utils/quantEvolution';
/** Synthetic reentry fixture. Never implies that imported prices were calculated. */
import type {QuantFactorCandidate} from '../../types/api/quant';
import type {MockExperiment} from './experiments';
import {quantState} from './state';
export function publishMockDerived(record: MockExperiment, parent: QuantFactorCandidate) {
    if (record.data.status !== 'completed' || record.data.derivedCandidates !== undefined) return;
    record.data.derivedCandidates = [];
    let attempts = JSON.parse(record.data.attemptsJson || '[]') as {fold?: number; id: string; operation: string; status: string; parents: string[]; requested_parameters: Record<string, number | boolean | string> | null; transformation?: ReturnType<typeof transformationSnapshot>; recipe?: {expression: Record<string, unknown>; parameters: Record<string, number | boolean | string>; bindings?: Record<string, string>; output_type?: QuantFactorCandidate['data']['outputType']; units?: string}}[];
    if (record.input.config.walkForward) attempts = attempts.filter(row => row.fold === record.input.config.walkForward!.folds);
    const attempt = attempts.find(item => item.operation === 'formula_mutation' && item.status === 'evaluated') || attempts.find(item => item.operation === 'parameter_variant' && item.status === 'evaluated');
    if (!attempt) return;
    const id = `derived-${record.data.id}-${attempt.id}`;
    const data = structuredClone(parent.data);
    delete data.formulaVersion;
    data.name = `${attempt.transformation ? evolutionNames[attempt.transformation.operator] : '参数变体'} · ${record.data.name} · 本地演示`;
    data.summary = '本地演示的实验回库候选。未使用导入行情计算，也未验证参数表现。';
    data.evidence = [];
    data.tags = ['实验衍生', '本地演示', '待独立验证'];
    let parentIds = [parent.id];
    if (attempt.transformation && attempt.recipe) {
        const plan = JSON.parse(record.data.planJson!) as {seeds: {id: string; candidate: QuantFactorCandidate['data']}[]};
        const sourceIds = attempt.parents.map(id => attempts.find(row => row.id === id)?.parents[0]);
        const sources = sourceIds.map(id => plan.seeds.find(seed => seed.id === id));
        if (sources.some(row => !row)) return;
        parentIds = sources.map(row => row!.id);
        data.parameters = sources.flatMap((source, index) => {
            const prefix = sources.length === 1 ? '' : index === 0 ? 'a_' : 'b_';
            const names = Object.fromEntries(source!.candidate.parameters.map(row => [row.name, prefix + row.name]));
            return source!.candidate.parameters.map(original => {
                const row = structuredClone(original); row.name = names[row.name];
                if (row.domain) {
                    row.domain.relations = row.domain.relations.map(relation => ({...relation, parameter: names[relation.parameter]}));
                    if (row.domain.version !== 1) row.domain.conditions = row.domain.conditions.map(rule => ({when: renameParameterCondition(rule.when, names), require: renameParameterCondition(rule.require, names)}));
                }
                return row;
            });
        });
        const bindings = attempt.recipe.bindings || {};
        data.inputs = [...new Set(Object.values(bindings))].map(name => ({name, meaning: `本地样例 ${name} 列`, availability: '每根 K 线收盘后', missingPolicy: '明确的本地模拟说明，未计算真实行情'}));
        if (attempt.recipe.output_type) data.outputType = attempt.recipe.output_type;
        data.expression = structuredClone(attempt.recipe.expression);
        const renameInputs = (node: Record<string, unknown>) => {
            if (node.op === 'input' && typeof node.name === 'string') node.name = bindings[node.name];
            if (Array.isArray(node.args)) node.args.forEach(renameInputs);
        };
        renameInputs(data.expression);
        data.formula = JSON.stringify(data.expression);
        if (attempt.recipe.units) data.units = attempt.recipe.units;
    }
    data.parameters = data.parameters.map(row => ({...row, defaultValue: JSON.stringify(attempt.transformation ? attempt.recipe?.parameters[row.name] : attempt.requested_parameters?.[row.name]), evidence: '人工构造的本地实验回库样例，不代表真实计算'}));
    data.derivation = {localDemo: true, version: 'experiment-derived-v1', requestId: record.data.id, checkpointId: `checkpoint-${id}`,
        attemptId: attempt.id, parentCandidateIds: parentIds, parentAttemptIds: attempt.parents,
        operation: attempt.operation, ...(attempt.transformation && record.input.config.evolution ? {transformation: readTransformation(attempt.transformation, record.input.config.evolution)} : {}), engineVersion: JSON.parse(record.data.planJson!).engine_version, datasetHash: 'local-demo-dataset', selectionRule: 'derived_frontier_first_three_v1'};
    const candidate: QuantFactorCandidate = {...structuredClone(parent), id, data, modelName: '本地实验演示', createdAt: new Date().toISOString(),
        curation: {name: data.name, family: data.family, tags: data.tags, aliases: [], note: ''}, currentRevisionId: '', revisions: [],
        evidenceStatus: 'local_simulation_unverified_platform', fingerprints: {raw: '', expression: `local-derived:${id}`}, occurrenceCount: 1};
    if (!quantState().derivedFactors.some(row => row.id === id)) {
        quantState().derivedFactors.unshift(candidate);
        const roots = new Set(parentIds.map(key => quantState().formulaRoots[key] || key));
        quantState().formulaRoots[id] = roots.size === 1 ? [...roots][0] : id;
    }
    record.data.derivedCandidates = [{id, name: data.name, attemptId: attempt.id}];
}
