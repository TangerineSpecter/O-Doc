"""Bounded execution facts for model/direct evidence; complete ledgers stay in results."""
import copy


def summary(metric, *, sample=False):
    if not metric or 'execution' not in metric: return None
    execution = copy.deepcopy(metric['execution'])
    trades = execution.pop('trades', None)
    if trades is not None:
        execution['ledger_scope'] = 'summary_with_bounded_trade_sample' if sample else 'summary_only'
        if sample:
            # First/last chronological samples; not ranked by profit.
            selected = trades if len(trades) <= 6 else trades[:3] + trades[-3:]
            execution.update(trades_sample=selected, trades_omitted=len(trades) - len(selected),
                sample_rule='all_up_to_six_else_first_three_last_three_not_profit_selected')
    return execution
