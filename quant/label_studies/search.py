"""Versioned label selection, separate from trade metrics and chronological tests."""
import copy
from .targets import validate, freeze, window
from .calculation import evaluate

ENGINES = {f'quant-local-search-{base}': f'quant-local-search-{label}' for base, label in
    ((2, 9), (3, 10), (4, 11), (5, 12), (6, 13), (7, 14), (8, 15))}
RULE = 'train_rank_ic_coverage_complexity_pareto_then_validation_rank_ic_coverage_v1'
NESTED_RULE = 'inner_mean_train_rank_ic_coverage_complexity_pareto_then_mean_validation_rank_ic_coverage_v1'


def base_engine(version: str) -> str:
    return next((base for base, label in ENGINES.items() if label == version), version)


def normalize(config: dict) -> dict:
    value = copy.deepcopy(config)
    if 'label_target' in value:
        target = value['label_target']
        if isinstance(target, dict) and set(target) == {'version', 'horizon_bars'}: value['label_target'] = freeze(target)
        else: validate(target)
    return value


def validate_windows(config: dict, splits: list[dict]) -> None:
    if 'label_target' not in config: return
    validate(config['label_target'])
    for split in splits:
        for start, end in split.values(): window(config['label_target'], start, end)


def evaluate_part(record: dict, part: str, rows: list, values: list, config: dict, start: int, end: int, guard) -> None:
    record[part] = evaluate(rows, values, config['label_target'], start, end, guard, selection_used=True)


def mean(folds: list[dict], count: int) -> dict | None:
    if len(folds) != count or any(set(row['label_metrics']) != {'train', 'validation'} or
            any(value['status'] != 'completed' for value in row['label_metrics'].values()) for row in folds): return None
    return {part: {key: sum(row['label_metrics'][part][key] for row in folds) / count
        for key in ('spearman_ic', 'pearson_ic', 'coverage')} for part in ('train', 'validation')}


def metric(attempt: dict, part: str) -> dict | None:
    if 'label_evaluation' not in attempt: return None
    inner = attempt.get('inner_evaluation')
    return inner['label_summary'][part] if inner else attempt['label_evaluation']['metrics'][part]


def selection_key(attempt: dict) -> tuple | None:
    value = metric(attempt, 'validation')
    return (-value['spearman_ic'], -value['coverage'], attempt['complexity'], attempt['fingerprint']) if value else None
