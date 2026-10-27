"""Repeat the complete bounded search inside each chronological outer fold.

This pure engine is wired separately from HTTP/workers and snapshot restore.
No uploaded code is executed and no model, database or external I/O is involved.
"""
import copy
import time
from quant.research.contracts import digest
from .search import _run_partitioned, engine_for
from .temporal import VERSION, windows, configurations, remap_attempt, summarize


def run_walk_forward(snapshot: dict, seeds: list[dict], config: dict, policy: dict, *, check=None, checkpoint=None, engine_version=None) -> dict:
    """`config` is the legacy search contract; temporal policy is explicit.

    Seeds restart from the frozen originals in each fold. Each inner search
    sees only its own training/validation prefix; the outer test is calculated
    after that fold's final selection. All folds consume one wall-time budget.
    """
    schedules = windows(len(snapshot['rows']), policy, config.get('gap') if isinstance(config, dict) else None)
    from quant.label_studies.search import validate_windows
    validate_windows(config, [split for schedule in schedules for split in [schedule['partitions'],
        *[row['partitions'] for row in schedule.get('inner_windows', [])]]])
    budgets = configurations(seeds, config, policy)
    started = time.monotonic()
    def guard():
        if check:
            check()
        if time.monotonic() - started >= config['seconds']:
            raise TimeoutError('滚动验证总时间预算已用尽')
    attempts, folds = [], []
    last = None
    inner_version = engine_for(config)
    for schedule, budget in zip(schedules, budgets):
        origin = schedule['calculation_start']
        # Even the inner runner's final evaluation cannot access future folds.
        end = schedule['partitions']['holdout'][1]
        prefix = {**snapshot, 'rows': snapshot['rows'][origin:end + 1]}
        split = {name: [start - origin, finish - origin]
            for name, (start, finish) in schedule['partitions'].items()}
        offset = len(attempts)
        def save(attempt):
            if checkpoint:
                checkpoint(remap_attempt(attempt, offset, schedule['number']))
        inner = [{**row, 'calculation_start': row['calculation_start']-origin,
            'partitions': {name: [a-origin, b-origin] for name, (a, b) in row['partitions'].items()}}
            for row in schedule.get('inner_windows', [])]
        last = _run_partitioned(prefix, seeds, budget, split, check=guard, checkpoint=save, engine_version=inner_version,
            **({'inner_partitions': inner} if inner else {}))
        remapped = [remap_attempt(attempt, offset, schedule['number']) for attempt in last['attempts']]
        identities = {old['id']: new['id'] for old, new in zip(last['attempts'], remapped)}
        attempts.extend(remapped)
        folds.append({**schedule, 'seed': budget['seed'], 'max_candidates': budget['max_candidates'],
            'search_engine_version': inner_version, 'attempt_ids': [attempt['id'] for attempt in remapped],
            'frontier_ids': [identities[identity] for identity in last['frontier_ids']],
            'selected_id': identities.get(last['selected_id'], ''),
            **{key: copy.deepcopy(last[key]) for key in ('holdout_status', 'holdout', 'buy_hold_baseline', 'stop_reason')}})
        if 'label_target' in config: folds[-1]['label_holdout'] = copy.deepcopy(last['label_holdout'])
        if folds[-1]['holdout'] is not None:
            folds[-1]['holdout_status'] = 'excluded_from_this_fold_selection_prior_usage_unattested'
        if last['stop_reason'] in ('cancelled', 'time_budget'):
            break
    # Global selection means the final attempted fold's selection, never a
    # Pareto comparison across unrelated historical periods or outer tests.
    final_fold = folds[-1]
    stopped = final_fold['stop_reason'] if final_fold['stop_reason'] in ('cancelled', 'time_budget') else 'generation_complete'
    return {**last, 'engine_version': engine_version or engine_for(config | {'walk_forward': policy}), 'dataset_hash': digest(snapshot),
        'config': copy.deepcopy(config) | {'walk_forward': copy.deepcopy(policy)},
        'partitions': final_fold['partitions'], 'attempts': attempts,
        'holdout_status': final_fold['holdout_status'],
        'frontier_ids': final_fold['frontier_ids'], 'selected_id': final_fold['selected_id'], 'stop_reason': stopped,
        'walk_forward': {'version': policy['version'], 'folds': folds, 'summary': summarize(folds, policy['folds'])},
        'limitations': last['limitations'] + [
            '每折从冻结父代重新搜索；扩展或滚动训练、内层验证选择、后续测试评价，后折允许使用已过去的数据',
            '预热为首个交易信号之前额外参与计算的历史根数；不足窗口的信号继续缺失，不补造或剔除试验',
            '逐折独立从空仓开始并在区间末平仓；均值和最差值不是连续投资组合收益或统计显著性',
            '最终候选和顶层留出结果仅代表最后一折；不按测试收益选折，跨研究独立性仍未证明'] + ([
            ('每个候选分别计算所有内层标签窗口；训练Rank IC/覆盖率均值参与Pareto，验证Rank IC/覆盖率均值选择；不是独立重复样本'
                if 'label_target' in config else '每个候选分别计算所有内层窗口；训练三项均值参与Pareto，验证收益减回撤的均值选择；不是连续收益或独立重复样本'),
            '内层与外层共用扩展/滚动训练模式；最后内层指标另存供敏感度描述，实际选择使用全部内层汇总；任一段全缺失或资金耗尽不参与选择'
            ] if policy['version'] == 2 else [])}
