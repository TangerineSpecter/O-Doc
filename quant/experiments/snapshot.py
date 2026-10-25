"""Restore input/result provenance and checkpoints without re-running experiments."""
import json
import math
import re
from quant.models import ExperimentRequest, ExperimentResult, ExperimentCheckpoint
from quant.research.contracts import digest
from .contracts import validate_frozen
from .backtest import partitions
from quant.factors.expression import finite_number
from .search import SUPPORTED_VERSIONS, recipe, variant_recipe, combine, nodes, pareto, uses_evolution


def validate_experiments(rows: dict, fail) -> None:
    requests = rows.get('quant.experimentrequest', {})
    checkpoints = rows.get('quant.experimentcheckpoint', {})
    results = rows.get('quant.experimentresult', {})
    datasets, factors = rows.get('quant.marketdataset', {}), rows.get('quant.factorcandidate', {})
    reports, entries = rows.get('quant.researchreport', {}), rows.get('quant.entry', {})
    seen_keys, grouped = set(), {identity: [] for identity in requests}
    for identity, fields in requests.items():
        collection, dataset = fields.get('anthology'), datasets.get(str(fields.get('dataset')), {})
        plan, key = fields.get('plan'), fields.get('request_key')
        if not dataset or dataset.get('anthology') != collection or not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,64}', key):
            fail('实验行情归属或请求标识无效')
        if (collection, key) in seen_keys:
            fail('实验请求标识重复')
        seen_keys.add((collection, key))
        validate_frozen(plan, dataset['snapshot'])
        if plan['dataset_hash'] != dataset['content_hash'] or fields.get('content_hash') != digest(plan) or identity != digest(['experiment-request-v1', collection, key])[:40]:
            fail('实验方案哈希或身份不一致')
        for seed in plan['seeds']:
            candidate = factors.get(seed['id'], {})
            report = reports.get(str(candidate.get('report')), {})
            if entries.get(str(report.get('entry')), {}).get('anthology') != collection or seed['candidate'] != candidate.get('data'):
                fail('实验父代与原始因子证据不一致')
    for identity, fields in checkpoints.items():
        request_id, ordinal = str(fields.get('request')), fields.get('ordinal')
        if request_id not in requests or type(ordinal) is not int or ordinal < 1 or ordinal > requests[request_id]['plan']['config']['max_candidates']:
            fail('实验检查点归属或序号无效')
        if identity != digest(['experiment-checkpoint-v1', request_id, ordinal])[:40] or fields.get('content_hash') != digest(fields.get('attempt')):
            fail('实验检查点哈希无效')
        grouped[request_id].append(fields)
    for request_id, items in grouped.items():
        items.sort(key=lambda item: item['ordinal'])
        if [item['ordinal'] for item in items] != list(range(1, len(items) + 1)):
            fail('实验尝试检查点不连续')
        validate_attempts([item['attempt'] for item in items], requests[request_id]['plan'], fail)
        if 'walk_forward' in requests[request_id]['plan']['config']:
            from .temporal_snapshot import validate_ranges
            validate_ranges([item['attempt'] for item in items], requests[request_id]['plan'],
                datasets[str(requests[request_id]['dataset'])]['snapshot'], fail)
    seen_results = set()
    for identity, fields in results.items():
        request_id, data = str(fields.get('request')), fields.get('data')
        if request_id not in requests or request_id in seen_results or not isinstance(data, dict):
            fail('实验结果归属或唯一性无效')
        seen_results.add(request_id)
        if set(data) != {'version', 'status', 'error', 'output', 'checkpoint_hashes', 'overlap_audit'} or data['version'] != 1 or data['status'] not in ('completed', 'cancelled', 'failed', 'partial') or not isinstance(data['error'], str) or len(data['error']) > 300:
            fail('实验结果合同无效')
        if identity != digest(['experiment-result-v1', request_id])[:40] or fields.get('content_hash') != digest(data):
            fail('实验结果哈希或身份无效')
        if data['checkpoint_hashes'] != [row['content_hash'] for row in grouped[request_id]]:
            fail('实验结果的尝试清单不完整')
        audit = data['overlap_audit']
        if not isinstance(audit, dict) or set(audit) != {'scope', 'request_ids', 'total', 'independent_holdout_proven'} or audit['scope'] != 'same_collection_symbol_timeframe_requested_ranges' or audit['independent_holdout_proven'] is not False:
            fail('实验数据重用审计合同无效')
        ids = audit['request_ids']
        if not isinstance(ids, list) or len(ids) > 100 or any(not isinstance(value, str) for value in ids) or ids != sorted(set(ids)) or type(audit['total']) is not int or audit['total'] < len(ids) or (audit['total'] <= 100 and audit['total'] != len(ids)):
            fail('实验数据重用清单无效')
        for peer in ids:
            if peer == request_id or requests.get(peer, {}).get('anthology') != requests[request_id]['anthology']:
                fail('实验数据重用引用无效')
        if data['output'] is not None:
            validate_output(data, requests[request_id], datasets[str(requests[request_id]['dataset'])]['snapshot'], grouped[request_id], fail)
        elif data['status'] not in ('cancelled', 'failed'):
            fail('已完成实验缺少计算结果')
        # No NaN/Infinity or unbounded objects can pass the restore boundary.
        if len(json.dumps(data, allow_nan=False)) > 6_000_000:
            fail('实验结果超过大小上限')
    for model in (ExperimentRequest, ExperimentCheckpoint, ExperimentResult):
        incoming = rows.get(model._meta.label_lower, {})
        for local in model.objects.filter(pk__in=incoming):
            fields = incoming[local.pk]
            if any(fields.get(field.removesuffix('_id') if field.endswith('_id') else field) != getattr(local, field) for field in local.SNAPSHOT_FIELDS):
                fail('同一实验业务事实不可覆盖')


def validate_attempts(attempts, plan, fail):
    if 'walk_forward' in plan['config']:
        from .temporal_snapshot import groups
        groups(attempts, plan, fail)
        return
    seeds, previous = {seed['id']: seed for seed in plan['seeds']}, {}
    for index, attempt in enumerate(attempts, 1):
        required = {'id', 'parents', 'operation', 'generation', 'requested_parameters', 'status', 'reason', 'metrics'}
        if not isinstance(attempt, dict) or not required <= set(attempt) or set(attempt) - required - {'recipe', 'fingerprint', 'complexity', 'transformation'}:
            fail('实验尝试字段无效')
        if attempt['id'] != f'attempt-{index}' or attempt['status'] not in ('evaluated', 'rejected', 'cancelled', 'budget_stopped') or not isinstance(attempt['reason'], str):
            fail('实验尝试状态无效')
        operation, parents, generation = attempt['operation'], attempt['parents'], attempt['generation']
        if type(generation) is not int or not 0 <= generation < plan['config']['generations'] or not isinstance(parents, list):
            fail('实验尝试谱系无效')
        if operation != 'formula_mutation' and 'transformation' in attempt:
            fail('非公式变异不能携带变换记录')
        if operation == 'source_candidate':
            if len(parents) != 1 or parents[0] not in seeds or generation != 0:
                fail('实验来源父代无效')
            seed = seeds[parents[0]]
            if attempt['requested_parameters'] != seed['parameters']:
                fail('原始候选的实际参数与方案不一致')
            expected = lambda: recipe(seed['candidate'], seed['bindings'], seed['parameters'])
        elif operation == 'parameter_variant':
            if len(parents) != 1 or parents[0] not in previous or previous[parents[0]]['operation'] != 'source_candidate' or generation != 0:
                fail('参数变体父代无效')
            seed = seeds[previous[parents[0]]['parents'][0]]
            if attempt['requested_parameters'] not in seed.get('variants', []):
                fail('参数变体不属于冻结方案')
            expected = lambda: variant_recipe(seed, attempt['requested_parameters'])
        elif operation == 'formula_mutation':
            from .evolution import validate_transform, transform_recipe, UNARY
            if not uses_evolution(plan['engine_version'], plan['config']) or 'transformation' not in attempt:
                fail('公式变异缺少受支持的引擎或变换记录')
            transform = validate_transform(attempt['transformation'], plan['config']['evolution'])
            if (len(parents) != (1 if transform['operator'] in UNARY else 2) or len(set(parents)) != len(parents)
                    or generation < 1 or attempt['requested_parameters'] is not None
                    or any(parent not in previous or previous[parent]['status'] != 'evaluated' or previous[parent]['generation'] >= generation for parent in parents)):
                fail('公式变异父代或代次无效')
            expected = lambda: transform_recipe([previous[parent]['recipe'] for parent in parents], transform, plan['config']['evolution'])
        elif operation in ('and', 'or', 'mean'):
            if uses_evolution(plan['engine_version'], plan['config']):
                fail('演化引擎的组合必须保留冻结变换记录')
            if len(parents) != 2 or parents[0] == parents[1] or generation < 1 or any(parent not in previous or previous[parent]['status'] != 'evaluated' or previous[parent]['generation'] >= generation for parent in parents):
                fail('组合尝试父代无效')
            expected = lambda: combine(previous[parents[0]]['recipe'], previous[parents[1]]['recipe'], operation)
        else:
            fail('实验操作未知')
        if 'recipe' in attempt:
            value = attempt['recipe']
            if value != expected() or attempt.get('fingerprint') != digest({key: value[key] for key in ('expression', 'bindings', 'parameters', 'output_type', 'units')}) or attempt.get('complexity') != nodes(value['expression']):
                fail('实验计算公式与父代/参数不一致')
        metrics = attempt['metrics']
        if not isinstance(metrics, dict) or set(metrics) - {'train', 'validation'}:
            fail('候选选择阶段包含不允许的指标')
        if attempt['status'] == 'evaluated' and ('recipe' not in attempt or set(metrics) != {'train', 'validation'}):
            fail('已评价候选缺少公式或训练/验证结果')
        for metric in metrics.values():
            validate_metric(metric, fail, strategy=plan['config'].get('strategy'))
            if attempt['status'] == 'evaluated' and metric.get('execution', {}).get('status') == 'insolvent':
                fail('净值耗尽的开发尝试不能参与选择')
        previous[attempt['id']] = attempt


def validate_output(envelope, request, dataset, checkpoints, fail, *, split=None):
    output, plan = envelope['output'], request['plan']
    if 'walk_forward' in plan['config']:
        from .temporal_snapshot import validate_output as validate_temporal
        validate_temporal(envelope, request, dataset, checkpoints, fail)
        return
    keys = {'engine_version', 'dataset_hash', 'config', 'partitions', 'seed_plan', 'attempts', 'selection_rule', 'frontier_ids', 'selected_id', 'holdout_status', 'holdout', 'buy_hold_baseline', 'stop_reason', 'limitations'}
    if not isinstance(output, dict) or set(output) != keys or not isinstance(output['limitations'], list) or len(output['limitations']) > 20 or any(not isinstance(value, str) or len(value) > 2000 for value in output['limitations']):
        fail('实验结果字段无效')
    if not isinstance(output, dict) or output.get('engine_version') not in SUPPORTED_VERSIONS or output.get('engine_version') != plan['engine_version'] or output.get('dataset_hash') != plan['dataset_hash'] or output.get('config') != plan['config'] or output.get('partitions') != (split if split is not None else partitions(len(dataset['rows']), gap=plan['config']['gap'])):
        fail('实验结果输入快照无效')
    seeds = [{'id': seed['id'], 'source_hash': digest(seed['candidate']), 'bindings': seed['bindings'], 'parameters': seed['parameters'], 'variants': seed.get('variants', [])} for seed in plan['seeds']]
    if output.get('seed_plan') != seeds or output.get('attempts') != [row['attempt'] for row in checkpoints]:
        fail('实验输入/输出与检查点不一致')
    frontier = pareto(output['attempts'])
    frontier.sort(key=lambda item: (-(item['metrics']['validation']['total_return'] - item['metrics']['validation']['max_drawdown']), item['metrics']['validation']['turnover'], item['complexity'], item['fingerprint']))
    if output.get('frontier_ids') != [item['id'] for item in frontier] or output.get('selected_id') != (frontier[0]['id'] if frontier else '') or output.get('selection_rule') != 'train_pareto_then_validation_return_minus_drawdown_v1':
        fail('实验选择依据不一致')
    if output.get('stop_reason') not in ('cancelled', 'time_budget', 'candidate_budget', 'generation_complete'):
        fail('实验终止原因无效')
    final = output.get('holdout')
    if (final is None) != (output.get('buy_hold_baseline') is None) or output.get('holdout_status') != ('not_evaluated' if final is None else 'excluded_from_this_batch_selection_prior_usage_unattested'):
        fail('实验留出评价状态不一致')
    if final is not None and (not frontier or envelope['status'] != 'completed' or output['stop_reason'] in ('cancelled', 'time_budget')):
        fail('中断实验不能声明完成留出评价')

    for is_baseline, metric in enumerate((final, output.get('buy_hold_baseline'))):
        if metric is not None:
            validate_metric(metric, fail, curve=True, strategy=plan['config'].get('strategy'), baseline=bool(is_baseline))
            start, end = output['partitions']['holdout']
            if metric['start'] != dataset['rows'][start]['timestamp'] or metric['end'] != dataset['rows'][end]['timestamp'] or metric['bars'] != end - start:
                fail('留出结果区间与冻结行情不一致')
            if [point['timestamp'] for point in metric['curve']] != [row['timestamp'] for row in dataset['rows'][start:end + 1]]:
                fail('留出净值时间与行情不一致')
            if 'strategy' in plan['config']:
                from quant.strategies.validation import replay
                replay(metric, selected_recipe(output), dataset, [start, end], plan['config'], fail, baseline=bool(is_baseline))


def selected_recipe(output):
    return next(row['recipe'] for row in output['attempts'] if row['id'] == output['selected_id'])


def validate_metric(metric, fail, *, curve=False, strategy=None, baseline=False):
    if strategy is not None:
        from quant.strategies.validation import validate_metric as validate_strategy_metric
        validate_strategy_metric(metric, strategy, fail, curve=curve, baseline=baseline)
        return
    keys = {'total_return', 'max_drawdown', 'entries', 'turnover', 'exposure_fraction', 'missing_signals', 'bars', 'start', 'end'}
    if not isinstance(metric, dict) or set(metric) != keys | ({'curve', 'returns'} if curve else set()):
        fail('实验指标字段无效')
    if any(not finite_number(metric[key]) for key in keys - {'start', 'end'}) or any(type(metric[key]) is not int for key in ('entries', 'turnover', 'missing_signals', 'bars')):
        fail('实验指标数值无效')
    bars = metric['bars']
    if not 2 <= bars <= 20000 or metric['total_return'] <= -1 or not 0 <= metric['max_drawdown'] <= 1 or not 0 <= metric['exposure_fraction'] <= 1 or not 0 <= metric['entries'] <= bars or not 0 <= metric['turnover'] <= 2 * bars or not 0 <= metric['missing_signals'] <= bars or any(not isinstance(metric[key], str) or len(metric[key]) > 60 for key in ('start', 'end')):
        fail('实验指标范围无效')
    if curve:
        points, returns = metric['curve'], metric['returns']
        if not isinstance(points, list) or len(points) != bars + 1 or not isinstance(returns, list) or len(returns) != bars or any(not finite_number(value) or value <= -1 for value in returns):
            fail('实验净值/收益序列长度无效')
        if any(not isinstance(point, dict) or set(point) != {'timestamp', 'equity'} or not isinstance(point['timestamp'], str) or not finite_number(point['equity']) or point['equity'] <= 0 for point in points):
            fail('实验净值序列无效')
        if points[0]['equity'] != 1 or not math.isclose(points[-1]['equity'], 1 + metric['total_return'], rel_tol=1e-9, abs_tol=1e-12):
            fail('实验总收益与净值不一致')
        if any(not math.isclose(points[index + 1]['equity'] / points[index]['equity'] - 1, value, rel_tol=1e-9, abs_tol=1e-12) for index, value in enumerate(returns)):
            fail('实验区间收益与净值不一致')
