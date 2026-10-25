"""Strict summaries and bounded deterministic replay of the selected heldout ledger."""
import time
import math
from quant.factors.expression import finite_number
from quant.research.contracts import digest
from .policy import SEMANTICS, EXIT_REASONS

class LedgerBudgetExceeded(Exception):
    pass


def validate_result_size(output):
    import json
    if len(json.dumps(output, allow_nan=False)) > 5_900_000:
        raise LedgerBudgetExceeded('策略成交账本超过同步大小上限，请减少测试区间、折数或开仓次数后新建实验；已完成尝试保留')


BASE = {'total_return', 'max_drawdown', 'entries', 'turnover', 'exposure_fraction', 'missing_signals', 'bars', 'start', 'end'}
EXECUTION = {'version', 'semantics', 'policy_hash', 'baseline', 'status', 'fees', 'borrow_cost', 'realized_pnl',
    'capital_deficit', 'entry_budget_blocked_bars', 'exit_reasons', 'ledger_scope'}


def validate_metric(metric: dict, policy: dict, fail, *, curve=False, baseline=False):
    expected = BASE | {'execution'} | ({'curve', 'returns'} if curve else set())
    if not isinstance(metric, dict) or set(metric) != expected:
        fail('策略指标字段无效')
    if any(not finite_number(metric[key]) for key in BASE - {'start', 'end'}):
        fail('策略指标数值无效')
    bars, entries = metric['bars'], metric['entries']
    if (any(type(metric[key]) is not int for key in ('bars', 'entries', 'turnover', 'missing_signals'))
            or not 2 <= bars <= 20000 or not 0 <= entries <= min(bars, policy['max_entries'])
            or metric['turnover'] != 2 * entries or not 0 <= metric['missing_signals'] <= bars
            or not 0 <= metric['exposure_fraction'] <= 1 or metric['max_drawdown'] < 0
            or any(not isinstance(metric[key], str) or not 0 < len(metric[key]) <= 60 for key in ('start', 'end'))):
        fail('策略指标范围或已平仓换手数量无效')
    execution = metric['execution']
    if (not isinstance(execution, dict) or set(execution) != EXECUTION | ({'trades'} if curve else set())
            or type(execution['version']) is not int or execution['version'] != 1 or execution['semantics'] != SEMANTICS
            or execution['policy_hash'] != digest(policy) or execution['baseline'] is not baseline
            or execution['ledger_scope'] != ('full_trades' if curve else 'summary_only')
            or execution['status'] not in ('completed', 'insolvent')):
        fail('策略执行摘要缺少固定规则、版本或账本范围')
    for key in ('fees', 'borrow_cost', 'realized_pnl', 'capital_deficit'):
        if not finite_number(execution[key]) or key != 'realized_pnl' and execution[key] < 0:
            fail('策略费用或损益无效')
    if (not math.isclose(execution['realized_pnl'], metric['total_return'], rel_tol=1e-9, abs_tol=1e-12)
            or not math.isclose(execution['capital_deficit'], max(0., -1 - metric['total_return']), rel_tol=1e-9, abs_tol=1e-12)
            or (execution['status'] == 'insolvent') != (metric['total_return'] <= -1)
            or (execution['status'] == 'insolvent' and metric['max_drawdown'] < 1)
            or (execution['status'] == 'completed' and metric['max_drawdown'] > 1)):
        fail('资金耗尽、净值损失与资金缺口不一致')
    reasons = execution['exit_reasons']
    if (not isinstance(reasons, dict) or len(reasons) > 12 or any(key not in EXIT_REASONS or type(count) is not int or count <= 0 for key, count in reasons.items())
            or sum(reasons.values()) != entries or type(execution['entry_budget_blocked_bars']) is not int
            or not 0 <= execution['entry_budget_blocked_bars'] <= bars):
        fail('策略退出或预算摘要无效')
    if curve and (not isinstance(execution['trades'], list) or len(execution['trades']) != entries):
        fail('策略留出成交账本数量不一致')


def replay(metric: dict, recipe: dict, dataset: dict, bounds: list[int], config: dict, fail, *, baseline=False):
    """No search, worker/model dispatch or native source execution on restore."""
    from quant.experiments.expression import calculate
    from .simulator import simulate
    start, end = bounds
    rows = dataset['rows'][:end + 1]
    deadline = time.monotonic() + 60
    def guard():
        if time.monotonic() >= deadline: fail('策略留出账本重建超过有界校验时限')
    values = calculate(recipe['expression'], {name: [row[column] for row in rows] for name, column in recipe['bindings'].items()},
        recipe['parameters'], expected=recipe['output_type'], check=guard)
    expected = simulate(rows, values, start=start, end=end, threshold=config['threshold'], fee_bps=config['fee_bps'],
        slippage_bps=config['slippage_bps'], policy=config['strategy'], output_type=recipe['output_type'],
        baseline=baseline, check=guard)
    if digest(metric) != digest(expected):
        fail('策略留出指标、费用、成交或净值不符合冻结规则与行情')
