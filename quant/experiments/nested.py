"""Multi-window development evaluation; never represents a continuous portfolio."""
import copy
from .expression import calculate

RULE = 'inner_mean_train_pareto_then_mean_validation_return_minus_drawdown_v2'


def aggregate(folds: list[dict], planned: int) -> dict | None:
    if len(folds) != planned or any(set(row['metrics']) != {'train', 'validation'} for row in folds):
        return None
    return {part: {name: sum(row['metrics'][part][name] for row in folds) / planned
        for name in ('total_return', 'max_drawdown', 'turnover')} for part in ('train', 'validation')}


def selection_metric(attempt: dict, part: str) -> dict:
    nested = attempt.get('inner_evaluation')
    return nested['summary'][part] if nested else attempt['metrics'][part]


def selection_key(attempt: dict) -> tuple:
    from quant.label_studies.search import selection_key as label_key
    key = label_key(attempt)
    if key is not None: return key
    metric = selection_metric(attempt, 'validation')
    return (-(metric['total_return'] - metric['max_drawdown']), metric['turnover'], attempt['complexity'], attempt['fingerprint'])


def evaluate(item: dict, rows: list, schedules: list[dict], config: dict, guard) -> list[dict]:
    """Keep partially evaluated inner folds visible on cancellation/deadline."""
    from .search import simulate_config
    trial = item['recipe']
    record = item['inner_evaluation']
    for schedule in schedules:
        guard()
        current = {'number': schedule['number'], 'metrics': {}}
        if 'label_target' in config: current['label_metrics'] = {}; item['label_evaluation']['metrics'] = current['label_metrics']
        record['folds'].append(current)
        item['metrics'] = current['metrics']
        origin = schedule['calculation_start']
        development = rows[origin:schedule['partitions']['validation'][1]+1]
        signals = calculate(trial['expression'], {key: [row[column] for row in development]
            for key, column in trial['bindings'].items()}, trial['parameters'], expected=trial['output_type'], check=guard)
        for part in ('train', 'validation'):
            start, end = schedule['partitions'][part]
            result = simulate_config(development, signals, config, record_trades=False, start=start-origin, end=end-origin,
                threshold=config['threshold'], fee_bps=config['fee_bps'], slippage_bps=config['slippage_bps'],
                output_type=trial['output_type'], check=guard)
            current['metrics'][part] = {key: value for key, value in result.items() if key not in ('curve', 'returns')}
            if 'label_target' in config:
                record['summary'] = aggregate(record['folds'], record['planned_folds'])
                from quant.label_studies.search import evaluate_part
                evaluate_part(current['label_metrics'], part, development, signals, config, start-origin, end-origin, guard)
    record['summary'] = aggregate(record['folds'], record['planned_folds'])
    if 'label_target' in config:
        from quant.label_studies.search import mean
        record['label_summary'] = mean(record['folds'], record['planned_folds'])
        item['label_evaluation'] = copy.deepcopy(item['label_evaluation'])
    item['metrics'] = copy.deepcopy(item['metrics'])
    return [metric for fold in record['folds'] for metric in fold['metrics'].values()]
