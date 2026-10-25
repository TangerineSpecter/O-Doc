import {readStrategy} from '../../../utils/quantStrategy';
import {isParameterText} from '../../../utils/quantParameterValues';
import {readTemporal} from '../../../utils/quantTemporal';
import {readEvolution} from '../../../utils/quantEvolution';
import type {QuantExperimentConfig, QuantExperimentProposal, QuantExperimentSeed} from '../../../types/api/quantExperiment';
import type {SeedDraft} from './plan';
const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('方案对象无效');
    return value as Record<string, unknown>;
};
const text = (value: unknown): string => {if (typeof value !== 'string' || !value.trim()) throw new Error('方案文字无效'); return value;};
const numeric = (value: unknown): number => {if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('方案数值无效'); return value;};
const parameters = (value: unknown) => Object.entries(object(value)).map(([name, value]) => ({name, value: typeof value === 'boolean' || isParameterText(value) ? value : numeric(value)}));
const list = (value: unknown, max: number): unknown[] => {if (!Array.isArray(value) || value.length > max) throw new Error('方案列表无效'); return value;};
/** Keep literal parameter names inside the versioned JSON; never camel-case maps. */
export function readProposal(proposal: QuantExperimentProposal) {
    const data = object(JSON.parse(proposal.dataJson)), rawConfig = object(data.config);
    if (data.version !== 1 || data.status !== 'unverified_requires_fresh_validation') throw new Error('此 AI 方案版本暂不支持');
    const config: QuantExperimentConfig = {seed: numeric(rawConfig.seed), maxCandidates: numeric(rawConfig.max_candidates), generations: numeric(rawConfig.generations),
        threshold: numeric(rawConfig.threshold), feeBps: numeric(rawConfig.fee_bps), slippageBps: numeric(rawConfig.slippage_bps), gap: numeric(rawConfig.gap), seconds: numeric(rawConfig.seconds)};
    if (rawConfig.strategy !== undefined) config.strategy = readStrategy(rawConfig.strategy, config.threshold);
    if (rawConfig.evolution !== undefined) config.evolution = readEvolution(rawConfig.evolution);
    if (rawConfig.walk_forward !== undefined) config.walkForward = readTemporal(rawConfig.walk_forward);
    const seeds: QuantExperimentSeed[] = list(data.seeds, 8).map(value => {
        const seed = object(value);
        return {candidateId: text(seed.id), bindings: Object.entries(object(seed.bindings)).map(([name, value]) => {
            const column = text(value);
            if (!['open', 'high', 'low', 'close', 'volume'].includes(column)) throw new Error('方案行情列无效');
            return {name, column: column as QuantExperimentSeed['bindings'][number]['column']};
        }), parameters: parameters(seed.parameters), variants: list(seed.variants, 16).map(parameters)};
    });
    if (!seeds.length || new Set(seeds.map(row => row.candidateId)).size !== seeds.length) throw new Error('方案父代无效');
    const drafts: Record<string, SeedDraft> = Object.fromEntries(seeds.map(seed => [seed.candidateId, {
        bindings: Object.fromEntries(seed.bindings.map(row => [row.name, row.column])),
        parameters: Object.fromEntries(seed.parameters.map(row => [row.name, JSON.stringify(row.value)])),
    }]));
    return {initial: data.origin === 'source_analysis', feedback: data.origin === 'external_feedback', baselineStatus: data.baseline_status, name: text(data.name), hypothesis: text(data.hypothesis), falsification: text(data.falsification),
        dataRequirement: text(data.data_requirement), config, seeds, drafts,
        evidenceRefs: list(data.evidence_refs, 12).map(text), demo: data.local_demo === true};
}
