import type {CombinationAnalysis, CombinationPart, CombinationValues} from '../../types/api/quantCombination';
import type {MockExperiment} from './experiments';
interface Attempt {id: string; parents: string[]; operation: string; status: string; reason: string; fold?: number;
    transformation?: unknown; metrics: Record<string, CombinationValues & {start: string; end: string; bars: number}>;
    inner_evaluation?: {folds: {number: number; metrics: Attempt['metrics']}[]}}
/** Arithmetic over artificial saved fixture metrics; never evaluates uploaded data. */
export function mockCombination(record: MockExperiment): string {
    const attempts: Attempt[] = JSON.parse(record.data.attemptsJson || '[]');
    const index = new Map(attempts.map(row => [row.id, row]));
    const innerCount = record.input.config.walkForward?.version === 2 ? record.input.config.walkForward.innerFolds || 1 : 1;
    const value: CombinationAnalysis = {version: 1, method: 'immediate-parent-delta-1',
        scope: 'same_request_same_costs_train_validation_only_immediate_parents', claim: 'descriptive_deltas_not_independent_complementarity_or_profit',
        value_order: ['parent_1', 'parent_2', 'combination'], delta_semantics: 'combination_minus_parent; artificial local fixture', groups: []};
    for (const combo of attempts.filter(row => row.parents.length === 2 && row.operation !== 'source_candidate')) {
        const parents = combo.parents.map(id => index.get(id));
        const valid = new Set(combo.parents).size === 2 && parents.every(row => row && row.fold === combo.fold);
        value.groups.push({id: `combination:${combo.id}`, attempt_id: combo.id, parent_ids: combo.parents,
            operation: combo.operation, outer_fold: combo.fold ?? null, status: combo.status, reason: combo.reason,
            parent_scope_valid: valid, parents: combo.parents.map((id, n) => ({id, status: parents[n]?.status || 'missing', reason: parents[n]?.reason || ''})),
            windows: Array.from({length: innerCount}, (_, n) => {
                const inner = record.input.config.walkForward?.version === 2 ? n + 1 : null;
                const part = (name: string): CombinationPart => {
                    const rows = [...parents, combo].map(row => inner ? row?.inner_evaluation?.folds.find(fold => fold.number === inner)?.metrics[name] : row?.metrics[name]);
                    const ranges = rows.map(row => row ? {start: row.start, end: row.end, bars: row.bars} : null);
                    const aligned = valid && rows.every(Boolean) && new Set(ranges.map(row => JSON.stringify(row))).size === 1;
                    const keys = ['total_return', 'max_drawdown', 'turnover', 'entries', 'missing_signals'] as const;
                    const diff = (parent: NonNullable<typeof rows[number]>) => Object.fromEntries(keys.map(key => [key, rows[2]![key] - parent[key]])) as unknown as CombinationValues;
                    return {status: aligned ? 'comparable' : 'unknown', reason: aligned ? '' : !valid ? 'parent_scope_mismatch' : rows.every(Boolean) ? 'window_mismatch' : 'missing_metrics', ranges,
                        values: rows.map(row => row ? Object.fromEntries(keys.map(key => [key, row[key]])) as unknown as CombinationValues : null),
                        deltas: aligned ? {versus_parents: rows.slice(0, 2).map(row => diff(row!)),
                            return_over_best_parent: rows[2]!.total_return - Math.max(rows[0]!.total_return, rows[1]!.total_return),
                            drawdown_over_lower_parent: rows[2]!.max_drawdown - Math.min(rows[0]!.max_drawdown, rows[1]!.max_drawdown)} : null};
                };
                return {inner_fold: inner, parts: {train: part('train'), validation: part('validation')}};
            })});
    }
    return JSON.stringify(value);
}
