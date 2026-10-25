"""Chronological folds and budgets for repeated, causally isolated searches.

Lengths count open-to-open return intervals, not rows. Every segment starts
flat; a preceding closed bar supplies its first signal. Warmup is calculation
history before that signal bar, never an extra scored training interval.
"""
import copy
from rest_framework.exceptions import ValidationError

VERSION = 'quant-local-search-4'
DEFAULT_POLICY = {'version': 1, 'mode': 'expanding', 'folds': 3,
    'train_bars': 40, 'validation_bars': 10, 'test_bars': 10, 'warmup_bars': 0}


def validate_policy(policy: dict) -> None:
    if not isinstance(policy, dict) or set(policy) != set(DEFAULT_POLICY):
        raise ValidationError('滚动验证配置字段无效')
    if any(type(policy[key]) is not int for key in set(DEFAULT_POLICY) - {'mode'}):
        raise ValidationError('滚动验证窗口和折数必须为整数')
    if policy['version'] != 1 or policy['mode'] not in ('expanding', 'rolling'):
        raise ValidationError('滚动验证版本或训练窗口模式无效')
    if (not 2 <= policy['folds'] <= 5 or not 20 <= policy['train_bars'] <= 20000
            or not 5 <= policy['validation_bars'] <= 20000 or not 5 <= policy['test_bars'] <= 20000
            or not 0 <= policy['warmup_bars'] <= 2000):
        raise ValidationError('滚动验证为 2–5 折，训练至少 20 段、验证/测试至少 5 段，预热 0–2000 根')


def windows(size: int, policy: dict, gap: int) -> list[dict]:
    """Anchor the last outer test end to the final row of the frozen dataset.

    Consecutive test intervals share one boundary price but no return interval.
    Later folds may use earlier test data once it is in their historical past.
    The fixed gap excludes bars on both sides of inner validation.
    """
    validate_policy(policy)
    if type(size) is not int or not 60 <= size <= 20000 or type(gap) is not int or not 1 <= gap <= 2000:
        raise ValidationError('行情须为 60–20000 根，隔离间隔须为 1–2000 根')
    needed = (2 + policy['warmup_bars'] + policy['train_bars'] + policy['validation_bars']
        + policy['folds'] * policy['test_bars'] + 2 * (gap + 1))
    if size < needed:
        raise ValidationError(f'当前滚动验证至少需要 {needed} 根行情，实际 {size} 根；请调整窗口或增加数据')
    origin = size - needed
    initial_start = origin + policy['warmup_bars'] + 1
    folds = []
    for index in range(policy['folds']):
        shift = index * policy['test_bars']
        train_start = initial_start + (shift if policy['mode'] == 'rolling' else 0)
        train_end = initial_start + policy['train_bars'] + shift
        validation_start = train_end + gap + 1
        validation_end = validation_start + policy['validation_bars']
        test_start = validation_end + gap + 1
        folds.append({'number': index + 1, 'calculation_start': train_start - 1 - policy['warmup_bars'],
            'partitions': {'train': [train_start, train_end], 'validation': [validation_start, validation_end],
                'holdout': [test_start, test_start + policy['test_bars']]}})
    return folds


def configurations(seeds: list[dict], config: dict, policy: dict) -> list[dict]:
    """All folds share the existing total candidate cap, never multiply it."""
    from .search import validate_plan
    validate_plan(seeds, config)
    validate_policy(policy)
    minimum = sum(1 + len(seed.get('variants', [])) for seed in seeds) + int('evolution' in config)
    quotient, remainder = divmod(config['max_candidates'], policy['folds'])
    if quotient < minimum:
        raise ValidationError(f'每折至少需要 {minimum} 次尝试，{policy["folds"]} 折总预算至少为 {minimum * policy["folds"]}')
    return [copy.deepcopy(config) | {'max_candidates': quotient + int(index < remainder),
        'seed': (config['seed'] + index) % 2**32} for index in range(policy['folds'])]


def remap_attempt(attempt: dict, offset: int, fold: int) -> dict:
    value = copy.deepcopy(attempt)
    def identity(local):
        return f'attempt-{int(local.removeprefix("attempt-")) + offset}'
    value['id'] = identity(value['id'])
    if value['operation'] != 'source_candidate':
        value['parents'] = [identity(parent) for parent in value['parents']]
    value['fold'] = fold
    return value


def summarize(folds: list[dict], planned: int) -> dict:
    """Per-fold descriptions only: no fabricated continuous portfolio curve."""
    tested = [fold for fold in folds if fold['holdout'] is not None]
    returns = [fold['holdout']['total_return'] for fold in tested]
    return {'planned_folds': planned, 'started_folds': len(folds), 'tested_folds': len(tested),
        'positive_folds': sum(value > 0 for value in returns),
        'mean_test_return': sum(returns) / len(returns) if returns else None,
        'worst_test_return': min(returns) if returns else None,
        'worst_test_drawdown': max(fold['holdout']['max_drawdown'] for fold in tested) if tested else None,
        'mean_baseline_return': sum(fold['buy_hold_baseline']['total_return'] for fold in tested) / len(tested) if tested else None,
        'aggregation': 'per_fold_flat_start_arithmetic_summary_v1'}
