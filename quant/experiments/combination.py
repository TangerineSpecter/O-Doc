"""Descriptive, same-window marginal comparisons from saved attempts only."""
import copy
import math

METHOD = 'immediate-parent-delta-1'
PREFIX = 'combination:'
METRICS = ('total_return', 'max_drawdown', 'turnover', 'entries', 'missing_signals')
PARTS = ('train', 'validation')


def _finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def _window(attempt, inner):
    if attempt is None:
        return {}, {}
    if inner is not None:
        row = next((row for row in attempt.get('inner_evaluation', {}).get('folds', [])
                    if row['number'] == inner), {})
        return row.get('metrics', {}), row.get('label_metrics', {})
    return attempt.get('metrics', {}), attempt.get('label_evaluation', {}).get('metrics', {})


def _part(records, labels, target, *, scope_valid=True):
    ranges = [{key: row.get(key) for key in ('start', 'end', 'bars')} if row else None for row in records]
    complete = all(row and all(_finite(row.get(key)) for key in METRICS) for row in records)
    aligned = scope_valid and complete and all(ranges[0] == row for row in ranges[1:]) and all(ranges[0][key] is not None for key in ranges[0])
    result = {'status': 'comparable' if aligned else 'unknown',
        'reason': '' if aligned else 'parent_scope_mismatch' if not scope_valid else 'missing_metrics' if not complete else 'window_mismatch',
        'ranges': ranges,
        'values': [{key: row.get(key) for key in METRICS} if row else None for row in records],
        'deltas': None}
    if aligned:
        a, b, combo = records
        result['deltas'] = {
            'versus_parents': [{key: combo[key] - parent[key] for key in METRICS} for parent in (a, b)],
            'return_over_best_parent': combo['total_return'] - max(a['total_return'], b['total_return']),
            'drawdown_over_lower_parent': combo['max_drawdown'] - min(a['max_drawdown'], b['max_drawdown'])}
    if target is not None:
        label_aligned = aligned and all(row and row.get('status') == 'completed' and row.get('target') == target
            and row.get('start_timestamp') == records[index]['start'] and row.get('end_timestamp') == records[index]['end']
            and all(_finite(row.get(key)) for key in ('spearman_ic', 'coverage')) for index, row in enumerate(labels))
        # Label windows and targets are frozen by the experiment engine. Keep
        # their descriptive result distinct from the executed trade returns.
        result['labels'] = {'status': 'comparable' if label_aligned else 'unknown',
            'target_ref': 'execution.config.label_target',
            'values': [{key: row.get(key) for key in ('status', 'spearman_ic', 'coverage', 'pairs', 'reason')} if row else None for row in labels],
            'versus_parents': [{key: labels[2][key] - parent[key] for key in ('spearman_ic', 'coverage')}
                for parent in labels[:2]] if label_aligned else None}
    return result


def analyze(plan: dict, attempts: list[dict]) -> dict:
    """All immediate two-parent attempts, including failed and missing windows.

    No holdout reads, candidate generation, source execution or new selection.
    Parents may themselves be composites; these are not leaf-factor claims.
    """
    index = {row['id']: row for row in attempts}
    policy = plan['config'].get('walk_forward', {})
    groups = []
    for attempt in attempts:
        parents = attempt.get('parents', [])
        if len(parents) != 2 or attempt.get('operation') == 'source_candidate':
            continue
        parent_rows = [index.get(identity) for identity in parents]
        valid = len(set(parents)) == 2 and all(row and row.get('fold') == attempt.get('fold') for row in parent_rows)
        inner_numbers = range(1, policy['inner_folds'] + 1) if policy.get('version') == 2 else [None]
        windows = []
        for inner in inner_numbers:
            scoped = [_window(row, inner) for row in [*parent_rows, attempt]]
            windows.append({'inner_fold': inner, 'parts': {part: _part(
                [metrics.get(part) for metrics, _ in scoped], [labels.get(part) for _, labels in scoped],
                plan['config'].get('label_target'), scope_valid=valid) for part in PARTS}})
        groups.append({'id': PREFIX + attempt['id'], 'attempt_id': attempt['id'], 'parent_ids': parents,
            'operation': attempt['operation'], 'transformation': copy.deepcopy(attempt.get('transformation')),
            'outer_fold': attempt.get('fold'), 'status': attempt['status'], 'reason': attempt.get('reason', ''),
            'parents': [{'id': identity, 'status': row['status'] if row else 'missing', 'reason': row.get('reason', '') if row else 'missing_parent'}
                for identity, row in zip(parents, parent_rows)],
            'parent_scope_valid': valid, 'windows': windows})
    return {'version': 1, 'method': METHOD, 'groups': groups,
        'scope': 'same_request_same_costs_train_validation_only_immediate_parents',
        'claim': 'descriptive_deltas_not_independent_complementarity_or_profit',
        'value_order': ['parent_1', 'parent_2', 'combination'],
        'delta_semantics': 'combination_minus_parent; positive return/IC is higher, positive drawdown/turnover is more; counts are not utility scores'}


def evidence(plan: dict, attempts: list[dict]) -> dict:
    result = analyze(plan, attempts)
    return {'combination_analysis': {key: value for key, value in result.items() if key != 'groups'} | {
        'group_refs': [row['id'] for row in result['groups']]},
        **{row['id']: row for row in result['groups']}}
