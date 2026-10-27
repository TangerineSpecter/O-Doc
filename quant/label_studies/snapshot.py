"""Rebuild recorded label statistics, never search or inspect a future test for selection."""
import time
from quant.research.contracts import digest
from quant.experiments.expression import calculate
from .calculation import evaluate


def validate_record(value: dict, target: dict, fail) -> None:
    if (not isinstance(value, dict) or set(value) != {'version', 'metrics'} or type(value['version']) is not int
            or value['version'] != 1 or not isinstance(value['metrics'], dict) or set(value['metrics']) - {'train', 'validation'}):
        fail('标签选择记录字段或版本无效')
    for row in value['metrics'].values():
        if not isinstance(row, dict) or row.get('target') != target or row.get('version') != 2 or row.get('selection_used') is not True:
            fail('开发标签目标与选择用途无效')


def replay_metrics(metrics: dict, recipe: dict, rows: list, split: dict, target: dict, fail, check, *, origin=0):
    if not metrics: return
    end = max(split[part][1] for part in metrics)
    prefix = rows[origin:end+1]
    try:
        values = calculate(recipe['expression'], {key: [row[column] for row in prefix] for key, column in recipe['bindings'].items()},
            recipe['parameters'], expected=recipe['output_type'], check=check)
        for part, recorded in metrics.items():
            check(); start, finish = split[part]
            rebuilt = evaluate(prefix, values, target, start-origin, finish-origin, check, selection_used=True)
            if digest(recorded) != digest(rebuilt): fail('标签起点、跨界剔除、配对或IC无法从冻结行情重建')
    except (ValueError, ArithmeticError) as error:
        fail('标签选择事实无法完整重算：' + type(error).__name__)


def validate_attempts(attempts: list[dict], plan: dict, dataset: dict, fail) -> None:
    if 'label_target' not in plan['config']: return
    target = plan['config']['label_target']; rows = dataset['rows']; deadline = time.monotonic() + 60
    def check():
        if time.monotonic() >= deadline: fail('标签恢复核验达到60秒上限，未跳过剩余事实')
    if 'walk_forward' in plan['config']:
        from quant.experiments.temporal import windows
        schedules = windows(len(rows), plan['config']['walk_forward'], plan['config']['gap'])
    else:
        from quant.experiments.backtest import partitions
        schedules = [{'calculation_start': 0, 'partitions': partitions(len(rows), gap=plan['config']['gap'])}]
    for attempt in attempts:
        check(); record = attempt['label_evaluation']; validate_record(record, target, fail)
        schedule = schedules[attempt.get('fold', 1)-1]
        nested = attempt.get('inner_evaluation')
        if nested:
            for fold in nested['folds']:
                current = schedule['inner_windows'][fold['number']-1]
                if fold['label_metrics']:
                    if 'recipe' not in attempt: fail('无公式尝试不能携带标签计算')
                    replay_metrics(fold['label_metrics'], attempt['recipe'], rows, current['partitions'], target, fail, check,
                        origin=current['calculation_start'])
        elif record['metrics']:
            if 'recipe' not in attempt: fail('无公式尝试不能携带标签计算')
            replay_metrics(record['metrics'], attempt['recipe'], rows, schedule['partitions'], target, fail, check,
                origin=schedule['calculation_start'])


def validate_holdout(value, final, recipe, dataset, split, target, fail):
    if final is None:
        if value is not None: fail('未完成测试不能携带完整标签评价')
        return
    rows = dataset['rows'][:split['holdout'][1]+1]
    values = calculate(recipe['expression'], {key: [row[column] for row in rows] for key, column in recipe['bindings'].items()},
        recipe['parameters'], expected=recipe['output_type'])
    expected = evaluate(rows, values, target, *split['holdout'])
    if digest(expected) != digest(value): fail('测试标签、边界或IC无法从固定赢家重建')
