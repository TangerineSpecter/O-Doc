"""Validate rolling provenance without executing formulas during restore."""
import copy
from quant.research.contracts import digest
from .temporal import configurations, windows, summarize


def groups(attempts, plan, fail):
    from .snapshot import validate_attempts
    config = {key: value for key, value in plan['config'].items() if key != 'walk_forward'}
    budgets = configurations(plan['seeds'], config, plan['config']['walk_forward'])
    grouped = []
    for index, attempt in enumerate(attempts, 1):
        if (not isinstance(attempt, dict) or attempt.get('id') != f'attempt-{index}'
                or type(attempt.get('fold')) is not int or not 1 <= attempt['fold'] <= len(budgets)):
            fail('滚动尝试序号或折号无效')
        fold = attempt['fold']
        if fold == len(grouped) + 1:
            grouped.append([])
        elif fold != len(grouped):
            fail('滚动尝试必须按连续折顺序保存')
        grouped[-1].append(attempt)
    result = []
    for index, items in enumerate(grouped):
        budget = budgets[index]
        if len(items) > budget['max_candidates']:
            fail('滚动尝试超过本折冻结预算')
        mapping = {row['id']: f'attempt-{i+1}' for i, row in enumerate(items)}
        local = []
        for row in items:
            item = copy.deepcopy(row)
            item.pop('fold')
            item['id'] = mapping[row['id']]
            if item.get('operation') != 'source_candidate':
                if not isinstance(item.get('parents'), list) or any(not isinstance(parent, str) or parent not in mapping for parent in item['parents']):
                    fail('滚动尝试父代不能跨折或缺失')
                item['parents'] = [mapping[parent] for parent in item['parents']]
            local.append(item)
        from .search import engine_for
        inner = {**plan, 'config': budget, 'engine_version': engine_for(budget)}
        if plan['config']['walk_forward']['version'] == 2:
            from .nested_snapshot import validate
            validate_attempts([validate(row, plan['config']['walk_forward']['inner_folds'], fail,
                strategy=budget.get('strategy'), label_target=budget.get('label_target')) for row in local], inner, fail)
        else:
            validate_attempts(local, inner, fail)
        # A fold must restart every original seed, then its declared variants.
        prefix = [('source_candidate', [seed['id']], seed['parameters']) for seed in plan['seeds']]
        prefix += [('parameter_variant', [f'attempt-{i+1}'], values)
            for i, seed in enumerate(plan['seeds']) for values in seed.get('variants', [])]
        if index < len(grouped)-1 and (len(local) < len(prefix) or any(row['status'] in ('cancelled', 'budget_stopped') for row in local)):
            fail('未完成或停止的滚动折不能继续下一折')
        for row, expected in zip(local, prefix):
            if (row['operation'], row['parents'], row['requested_parameters']) != expected:
                fail('滚动折未按冻结父代和参数组重新搜索')
        result.append((items, local, inner, mapping))
    return result


def validate_ranges(attempts, plan, dataset, fail):
    schedules = windows(len(dataset['rows']), plan['config']['walk_forward'], plan['config']['gap'])
    for attempt in attempts:
        schedule = schedules[attempt['fold']-1]
        if plan['config']['walk_forward']['version'] == 2:
            from .nested_snapshot import ranges
            ranges(attempt, schedule, dataset['rows'], fail)
            # An interrupted attempt may still be on an earlier inner fold.
            continue
        for name, metric in attempt['metrics'].items():
            start, end = schedules[attempt['fold']-1]['partitions'][name]
            if (metric['bars'] != end-start or metric['start'] != dataset['rows'][start]['timestamp']
                    or metric['end'] != dataset['rows'][end]['timestamp']):
                fail('滚动训练/验证指标区间与冻结行情不一致')


def validate_output(envelope, request, dataset, checkpoints, fail):
    from .snapshot import validate_output as validate_single
    output, plan = envelope['output'], request['plan']
    policy = plan['config']['walk_forward']
    keys = {'engine_version', 'dataset_hash', 'config', 'partitions', 'seed_plan', 'attempts', 'selection_rule',
        'frontier_ids', 'selected_id', 'holdout_status', 'holdout', 'buy_hold_baseline', 'stop_reason', 'limitations', 'walk_forward'}
    if 'label_target' in plan['config']: keys.add('label_holdout')
    if not isinstance(output, dict) or set(output) != keys:
        fail('滚动实验结果字段无效')
    temporal = output['walk_forward']
    if not isinstance(temporal, dict) or set(temporal) != {'version', 'folds', 'summary'} or type(temporal['version']) is not int or temporal['version'] != policy['version']:
        fail('滚动实验结果版本无效')
    folds = temporal['folds']
    if (not isinstance(folds, list) or not 1 <= len(folds) <= policy['folds']
            or output['engine_version'] != plan['engine_version'] or output['config'] != plan['config']
            or output['dataset_hash'] != plan['dataset_hash'] or output['attempts'] != [row['attempt'] for row in checkpoints]):
        fail('滚动实验输入或检查点不一致')
    schedules = windows(len(dataset['rows']), policy, plan['config']['gap'])
    grouped = groups(output['attempts'], plan, fail)
    if len(grouped) != len(folds):
        fail('滚动折与尝试集合不一致')
    validate_ranges(output['attempts'], plan, dataset, fail)
    fold_keys = {'number', 'calculation_start', 'partitions', 'seed', 'max_candidates', 'search_engine_version',
        'attempt_ids', 'frontier_ids', 'selected_id', 'holdout_status', 'holdout', 'buy_hold_baseline', 'stop_reason'}
    if policy['version'] == 2:
        fold_keys.add('inner_windows')
    final_fields = ('frontier_ids', 'selected_id', 'holdout_status', 'holdout', 'buy_hold_baseline')
    if 'label_target' in plan['config']:
        fold_keys.add('label_holdout'); final_fields += ('label_holdout',)
    for index, (fold, group, schedule) in enumerate(zip(folds, grouped, schedules)):
        items, local, inner, mapping = group
        if (not isinstance(fold, dict) or set(fold) != fold_keys
                or any(digest(fold[key]) != digest(value) for key, value in schedule.items())
                or type(fold['seed']) is not int or type(fold['max_candidates']) is not int
                or fold['seed'] != inner['config']['seed'] or fold['max_candidates'] != inner['config']['max_candidates']
                or fold['search_engine_version'] != inner['engine_version']
                or fold['attempt_ids'] != [row['id'] for row in items]):
            fail('滚动折区间、预算或尝试归属无效')
        if (not isinstance(fold['frontier_ids'], list) or any(not isinstance(identity, str) or identity not in mapping for identity in fold['frontier_ids'])
                or not isinstance(fold['selected_id'], str) or (fold['selected_id'] and fold['selected_id'] not in mapping)):
            fail('滚动折选择跨折或缺失')
        origin, end = fold['calculation_start'], fold['partitions']['holdout'][1]
        if policy['version'] == 2:
            # Execution of the outer test restarts calculation at the last
            # inner window's warmup boundary, especially for rolling history.
            origin = fold['inner_windows'][-1]['calculation_start']
        prefix = {**dataset, 'rows': dataset['rows'][origin:end+1]}
        split = {key: [a-origin, b-origin] for key, (a, b) in fold['partitions'].items()}
        inner = {**inner, 'dataset_hash': digest(prefix)}
        suboutput = {key: value for key, value in output.items() if key != 'walk_forward'} | {
            'engine_version': inner['engine_version'], 'dataset_hash': inner['dataset_hash'], 'config': inner['config'],
            'partitions': split, 'attempts': local, 'stop_reason': fold['stop_reason'],
            **{key: fold[key] for key in final_fields},
            'frontier_ids': [mapping[identity] for identity in fold['frontier_ids']],
            'selected_id': mapping.get(fold['selected_id'], '')}
        if fold['holdout_status'] != ('not_evaluated' if fold['holdout'] is None else 'excluded_from_this_fold_selection_prior_usage_unattested'):
            fail('滚动测试必须限定在本折选择之外，不得宣称全批独立')
        suboutput['holdout_status'] = 'not_evaluated' if fold['holdout'] is None else 'excluded_from_this_batch_selection_prior_usage_unattested'
        interrupted = fold['stop_reason'] in ('cancelled', 'time_budget')
        if interrupted and index != len(folds)-1:
            fail('停止后的滚动折不能继续执行')
        if not interrupted and len(local) < sum(1 + len(seed.get('variants', [])) for seed in plan['seeds']):
            fail('完成的滚动折缺少冻结基线或参数尝试')
        status = 'cancelled' if fold['stop_reason'] == 'cancelled' else 'partial' if interrupted else 'completed'
        validate_single({'output': suboutput, 'status': status}, {'plan': inner}, prefix,
            [{'attempt': row} for row in local], fail, split=split, nested=policy['version'] == 2)
    last = folds[-1]
    if output['partitions'] != last['partitions'] or any(output[key] != last[key] for key in final_fields):
        fail('顶层结果必须代表最后一折，不能按测试成绩挑折')
    reason = last['stop_reason'] if last['stop_reason'] in ('cancelled', 'time_budget') else 'generation_complete'
    status = {'cancelled': 'cancelled', 'time_budget': 'partial'}.get(reason, 'completed')
    if (output['stop_reason'] != reason or envelope['status'] != status
            or (status == 'completed' and len(folds) != policy['folds']) or digest(temporal['summary']) != digest(summarize(folds, policy['folds']))):
        fail('滚动结果终态、完成折数或汇总不一致')
