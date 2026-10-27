"""Bounded search v1. All attempts survive; holdout is computed only after selection.

This module proposes deterministic parameter variants and type/units-constrained
pairs. AI hypothesis generation and platform exports are separate workflow steps.
"""
import copy
import random
import time
from rest_framework.exceptions import ValidationError
from quant.factors.expression import validate_expression, finite_number, parameter_value
from quant.research.contracts import digest
from .expression import calculate
from .backtest import partitions, simulate
from .nested import RULE as NESTED_RULE, selection_metric, selection_key

VERSION = 'quant-local-search-2'
SUPPORTED_VERSIONS = tuple(f'quant-local-search-{number}' for number in range(1, 16))
FIELDS = {'open', 'high', 'low', 'close', 'volume'}


def engine_for(config):
    if 'label_target' in config:
        from quant.label_studies.search import ENGINES
        return ENGINES[engine_for({key: value for key, value in config.items() if key != 'label_target'})]
    if config.get('walk_forward', {}).get('version') == 2:
        return 'quant-local-search-8' if 'strategy' in config else 'quant-local-search-7'
    if 'strategy' in config:
        return 'quant-local-search-6' if 'walk_forward' in config else 'quant-local-search-5'
    return 'quant-local-search-4' if 'walk_forward' in config else 'quant-local-search-3' if 'evolution' in config else VERSION


def validate_engine(version, config):
    from quant.label_studies.search import ENGINES
    if 'label_target' in config or version in ENGINES.values():
        if 'label_target' not in config or version != engine_for(config): raise ValidationError('标签目标与实验引擎版本不一致')
        return
    if version in ('quant-local-search-7', 'quant-local-search-8') or config.get('walk_forward', {}).get('version') == 2:
        if version != engine_for(config): raise ValidationError('嵌套验证配置与引擎版本不一致')
        return
    if 'strategy' in config:
        if version != engine_for(config): raise ValidationError('策略执行配置与引擎版本不一致')
        return
    if version in ('quant-local-search-5', 'quant-local-search-6'):
        raise ValidationError('策略执行引擎缺少完整策略规则')
    if version not in SUPPORTED_VERSIONS or (version == 'quant-local-search-4') != ('walk_forward' in config):
        raise ValidationError('滚动验证配置与实验引擎版本不一致')
    if version != 'quant-local-search-4' and (version == 'quant-local-search-3') != ('evolution' in config):
        raise ValidationError('演化配置与实验引擎版本不一致')


def uses_evolution(version, config):
    from quant.label_studies.search import base_engine
    version = base_engine(version)
    return version == 'quant-local-search-3' or version == 'quant-local-search-5' and 'evolution' in config


def simulate_config(rows, values, config, *, record_trades=True, **options):
    if 'strategy' in config:
        from quant.strategies.simulator import simulate as execute_strategy
        return execute_strategy(rows, values, policy=config['strategy'], record_trades=record_trades, **options)
    return simulate(rows, values, **options)


def nodes(expression):
    return 1 + sum(nodes(child) for child in expression.get('args', []))


def recipe(candidate: dict, bindings: dict, parameters: dict) -> dict:
    if candidate.get('expression') is None or candidate.get('output_type') not in ('numeric_series', 'boolean_series'):
        raise ValidationError('候选尚无可运行的数值/布尔表达式')
    if not isinstance(bindings, dict) or any(not isinstance(value, str) for value in bindings.values()) or set(bindings) != {row['name'] for row in candidate['inputs']} or not set(bindings.values()) <= FIELDS:
        raise ValidationError('每个输入必须明确绑定一列行情')
    if not isinstance(parameters, dict) or set(parameters) != {row['name'] for row in candidate['parameters']}:
        raise ValidationError('必须明确填写全部实际实验参数，不能用源码默认值猜测实盘配置')
    if any(not parameter_value(value) for value in parameters.values()):
        raise ValidationError('实验参数只能是有限数值、布尔或有界枚举字符串')
    from quant.parameters.domains import validate_values
    for row in candidate['parameters']:
        if isinstance(parameters[row['name']], str) and (row['type'].lower().strip() not in ('string', 'str') or row.get('domain', {}).get('version') not in (3, 4)):
            raise ValidationError('实验字符串必须对应已声明的 v3 或 v4 字符串枚举参数')
    validate_values(candidate['parameters'], parameters)
    validate_expression(candidate['expression'], set(bindings), set(parameters))
    # Different source snippets may use the same names. Namespacing eliminates
    # accidental parameter/data aliasing when expressions are combined.
    mapping = {'input': {name: f'i{index}' for index, name in enumerate(sorted(bindings))},
        'parameter': {name: f'p{index}' for index, name in enumerate(sorted(parameters))}}
    def rename(node):
        node = copy.deepcopy(node)
        if node['op'] in mapping:
            node['name'] = mapping[node['op']][node['name']]
        if 'args' in node:
            node['args'] = [rename(child) for child in node['args']]
        return node
    return {'expression': rename(candidate['expression']), 'bindings': {mapping['input'][key]: value for key, value in bindings.items()},
        'parameters': {mapping['parameter'][key]: value for key, value in parameters.items()},
        'parameter_names': {mapping['parameter'][key]: key for key in parameters},
        'output_type': candidate['output_type'], 'units': candidate['units']}


def variant_recipe(seed, values):
    if not isinstance(values, dict):
        raise ValidationError('候选参数必须为对象')
    allowed = {row['name'] for row in seed['candidate']['parameters'] if row['category'] == 'signal'}
    def parameters(node):
        return ({node['name']} if node['op'] == 'parameter' else set()) | set().union(*(parameters(child) for child in node.get('args', [])))
    allowed &= parameters(seed['candidate']['expression']) if seed['candidate'].get('expression') else set()
    changed = {name for name in values if values[name] != seed['parameters'].get(name)}
    if not changed <= allowed:
        raise ValidationError('只搜索实际参与计算的信号参数；显示、状态、执行和写死常量保持原值')
    return recipe(seed['candidate'], seed['bindings'], values)


def combine(a: dict, b: dict, operation: str) -> dict:
    boolean = a['output_type'] == b['output_type'] == 'boolean_series'
    numeric = a['output_type'] == b['output_type'] == 'numeric_series'
    if not ((boolean and operation in ('and', 'or')) or (numeric and operation == 'mean' and a['units'] == b['units']
            and a['units'].strip().lower() not in ('', 'unknown', '未知', '未说明'))):
        raise ValidationError('组合要求类型一致；数值平均还要求声明单位一致且已知')
    result = {'bindings': {}, 'parameters': {}, 'parameter_names': {}, 'output_type': a['output_type'], 'units': a['units']}
    def child(value, prefix):
        def rename(node):
            node = copy.deepcopy(node)
            if node['op'] in ('input', 'parameter'):
                node['name'] = prefix + node['name']
            if 'args' in node:
                node['args'] = [rename(arg) for arg in node['args']]
            return node
        for key in ('bindings', 'parameters', 'parameter_names'):
            result[key].update({prefix + name: item for name, item in value[key].items()})
        return rename(value['expression'])
    left, right = child(a, 'a_'), child(b, 'b_')
    result['expression'] = {'op': operation, 'args': [left, right]} if boolean else {'op': 'div', 'args': [
        {'op': 'add', 'args': [left, right]}, {'op': 'constant', 'value': 2}]}
    validate_expression(result['expression'], set(result['bindings']), set(result['parameters']))
    if len(result['bindings']) > 20 or len(result['parameters']) > 30:
        raise ValidationError('组合输入/参数超过引擎预算')
    return result


def pareto(attempts: list[dict]) -> list[dict]:
    eligible = [item for item in attempts if item['status'] == 'evaluated']
    def objectives(item):
        from quant.label_studies.search import metric
        labels = metric(item, 'train')
        if labels: return (labels['spearman_ic'], labels['coverage'], -item['complexity'])
        data = selection_metric(item, 'train')
        return (data['total_return'], -data['max_drawdown'], -data['turnover'], -item['complexity'])
    def dominates(a, b):
        aa, bb = objectives(a), objectives(b)
        return all(x >= y for x, y in zip(aa, bb)) and any(x > y for x, y in zip(aa, bb))
    return [item for item in eligible if not any(dominates(other, item) for other in eligible if other is not item)]


def validate_plan(seeds: list[dict], config: dict) -> None:
    required = {'seed', 'max_candidates', 'generations', 'threshold', 'fee_bps', 'slippage_bps', 'gap', 'seconds'}
    if not isinstance(config, dict) or not required <= set(config) or set(config) - required - {'evolution', 'walk_forward', 'strategy', 'label_target'} or any(type(config[key]) is not int for key in ('seed', 'max_candidates', 'generations', 'gap', 'seconds')):
        raise ValidationError('实验预算与随机种子合同无效')
    if 'label_target' in config:
        from quant.label_studies.targets import validate
        validate(config['label_target'])
    if not 0 <= config['seed'] < 2**32 or not 1 <= config['max_candidates'] <= 32 or not 1 <= config['generations'] <= 4 or not 1 <= config['seconds'] <= 60:
        raise ValidationError('每批最多 32 个候选、4 代、60 秒')
    if not isinstance(seeds, list) or not 1 <= len(seeds) <= min(8, config['max_candidates']):
        raise ValidationError('父代数量须为 1–8，且不能超过候选预算')
    if any(not isinstance(seed, dict) for seed in seeds):
        raise ValidationError('父代合同必须为对象')
    identities = [seed.get('id') for seed in seeds]
    if any(not isinstance(identity, str) or not identity for identity in identities) or len(set(identities)) != len(identities):
        raise ValidationError('父代标识必须唯一')
    for seed in seeds:
        if not isinstance(seed.get('variants', []), list) or len(seed.get('variants', [])) > 16:
            raise ValidationError('每个父代最多提供 16 组候选参数')
    if 'evolution' in config:
        from .evolution import validate_policy
        validate_policy(config['evolution'])
        if config['generations'] < 2:
            raise ValidationError('公式演化至少需要 2 代（第 0 代为基线）')
        if sum(1 + len(seed.get('variants', [])) for seed in seeds) >= config['max_candidates']:
            raise ValidationError('请在基线和参数组之外为公式演化保留尝试额度')
    for field in ('threshold', 'fee_bps', 'slippage_bps'):
        if not finite_number(config[field]):
            raise ValidationError('阈值与费用需要明确的有限数值')
    if not 0 <= config['fee_bps'] <= 500 or not 0 <= config['slippage_bps'] <= 500:
        raise ValidationError('费率/滑点每侧须介于 0–500 bps')
    if 'strategy' in config:
        from quant.strategies.policy import validate_policy
        validate_policy(config['strategy'], config['threshold'])
    if 'walk_forward' in config:
        from .temporal import configurations
        configurations(seeds, {key: value for key, value in config.items() if key != 'walk_forward'}, config['walk_forward'])


def run_batch(snapshot: dict, seeds: list[dict], config: dict, *, check=None, checkpoint=None, engine_version=None) -> dict:
    """Seeds: {id, candidate, bindings, parameters, variants:[parameter dict]}.

    Config is explicit: seed, max_candidates, generations, threshold, fee_bps,
    slippage_bps, gap, seconds. Rows must come from validated data.parse_csv.
    """
    validate_plan(seeds, config)
    engine_version = engine_version or engine_for(config)
    validate_engine(engine_version, config)
    from quant.label_studies.search import base_engine, validate_windows
    if base_engine(engine_version) in ('quant-local-search-4', 'quant-local-search-6', 'quant-local-search-7', 'quant-local-search-8'):
        from .walk_forward import run_walk_forward
        return run_walk_forward(snapshot, seeds, {key: value for key, value in config.items() if key != 'walk_forward'},
            config['walk_forward'], check=check, checkpoint=checkpoint, engine_version=engine_version)
    split = partitions(len(snapshot['rows']), gap=config['gap'])
    validate_windows(config, [split])
    return _run_partitioned(snapshot, seeds, config, split,
        check=check, checkpoint=checkpoint, engine_version=engine_version)


def _run_partitioned(snapshot, seeds, config, split, *, check=None, checkpoint=None, engine_version, inner_partitions=None):
    """Internal execution on caller-validated chronological boundaries.

    The public batch and temporal runner validate their own split contracts.
    Keeping selection here ensures each temporal fold repeats the entire search
    with its own development prefix, rather than replaying a future winner.
    """
    started = time.monotonic()
    def guard():
        if check:
            check()
        if time.monotonic() - started >= config['seconds']:
            raise TimeoutError('实验时间预算已用尽')
    rows = snapshot['rows']
    # Candidate calculation sees no final holdout rows, even transiently.
    development = rows[:split['validation'][1] + 1]
    randomizer = random.Random(config['seed'])
    attempts, known, recipes = [], set(), {}
    stopped = ''
    def evaluate(value, parents, operation, generation, requested_parameters=None, transformation=None):
        item = {'id': f'attempt-{len(attempts) + 1}', 'parents': parents, 'operation': operation,
            'generation': generation, 'requested_parameters': requested_parameters, 'status': 'pending', 'reason': '', 'metrics': {}}
        if 'label_target' in config: item['label_evaluation'] = {'version': 1, 'metrics': {}}
        if inner_partitions:
            item['inner_evaluation'] = {'version': 1, 'planned_folds': len(inner_partitions), 'folds': [], 'summary': None}
            if 'label_target' in config: item['inner_evaluation'].update(version=2, label_summary=None)
        if transformation is not None:
            item['transformation'] = copy.deepcopy(transformation)
        attempts.append(item)
        try:
            guard()
            item['recipe'] = value() if callable(value) else value
            item['fingerprint'] = digest({key: item['recipe'][key] for key in ('expression', 'bindings', 'parameters', 'output_type', 'units')})
            item['complexity'] = nodes(item['recipe']['expression'])
            if item['fingerprint'] in known:
                item['status'], item['reason'] = 'rejected', '相同表达式与实际参数已尝试'
                return item
            known.add(item['fingerprint'])
            trial = item['recipe']
            if inner_partitions:
                from .nested import evaluate as evaluate_inner
                metrics = evaluate_inner(item, development, inner_partitions, config, guard)
            else:
                inputs = {key: [row[column] for row in development] for key, column in trial['bindings'].items()}
                values = calculate(trial['expression'], inputs, trial['parameters'], expected=trial['output_type'], check=guard)
                for part in ('train', 'validation'):
                    start, end = split[part]
                    result = simulate_config(development, values, config, record_trades=False, start=start, end=end, threshold=config['threshold'],
                        fee_bps=config['fee_bps'], slippage_bps=config['slippage_bps'], output_type=trial['output_type'], check=guard)
                    item['metrics'][part] = {key: value for key, value in result.items() if key not in ('curve', 'returns')}
                    if 'label_target' in config:
                        from quant.label_studies.search import evaluate_part
                        evaluate_part(item['label_evaluation']['metrics'], part, development, values, config, start, end, guard)
                metrics = list(item['metrics'].values())
            if any(metric.get('execution', {}).get('status') == 'insolvent' for metric in metrics):
                item['status'], item['reason'] = 'rejected', '开发区间策略净值耗尽；保留亏损和资金缺口，不参与父代选择'
            elif any(metric['missing_signals'] == metric['bars'] for metric in metrics):
                item['status'], item['reason'] = 'rejected', '训练或验证期全部信号缺失，无法评价'
            elif 'label_target' in config and (item.get('inner_evaluation', {}).get('label_summary') is None if inner_partitions else
                    any(row['status'] != 'completed' for row in item['label_evaluation']['metrics'].values())):
                item['status'], item['reason'] = 'rejected', '标签有效配对不足或相关未定义，不参与标签选择'
            else:
                item['status'] = 'evaluated'
                recipes[item['id']] = trial
        except ValidationError as exc:
            # These errors originate in bounded local contracts, not providers.
            detail = exc.detail
            reason = '表达式类型、窗口、单位、参数或输入合同不满足计算规则'
            if (transformation is not None or any('domain' in row for seed in seeds for row in seed['candidate']['parameters'])) and isinstance(detail, list) and detail:
                reason = str(detail[0])
            item['status'], item['reason'] = 'rejected', reason[:1000]
        except InterruptedError:
            item['status'], item['reason'] = 'cancelled', '实验已停止'
            raise
        except TimeoutError:
            item['status'], item['reason'] = 'budget_stopped', '实验时间预算已用尽'
            raise
        finally:
            if checkpoint:
                checkpoint(copy.deepcopy(item))
        return item
    try:
        bases = []
        # Every supplied parent is evaluated before any parent's variants.
        for seed in seeds:
            bases.append(evaluate(lambda seed=seed: recipe(seed['candidate'], seed['bindings'], seed['parameters']),
                [seed['id']], 'source_candidate', 0, seed['parameters']))
        for seed, base in zip(seeds, bases):
            for values in seed.get('variants', []):
                if len(attempts) >= config['max_candidates']:
                    stopped = 'candidate_budget'
                    break
                evaluate(lambda seed=seed, values=values: variant_recipe(seed, values),
                    [base['id']], 'parameter_variant', 0, values)
        for generation in range(1, config['generations']):
            if uses_evolution(engine_version, config):
                from .evolution import proposals, transform_recipe
                remaining = config['max_candidates'] - len(attempts)
                if remaining <= 0:
                    stopped = 'candidate_budget'
                    break
                generations_left = config['generations'] - generation
                allowance = (remaining + generations_left - 1) // generations_left
                used = 0
                for proposal in proposals(list(attempts), config['evolution'], randomizer, generation):
                    evaluate(lambda proposal=proposal: transform_recipe([recipes[parent] for parent in proposal['parents']],
                        proposal['transformation'], config['evolution']), proposal['parents'], 'formula_mutation', generation,
                        transformation=proposal['transformation'])
                    used += 1
                    if used >= allowance:
                        break
                if not used:
                    break
                if len(attempts) >= config['max_candidates']:
                    stopped = 'candidate_budget'
                    break
                continue
            parents = pareto(attempts)
            pairs = [(a, b) for i, a in enumerate(parents) for b in parents[i + 1:]]
            randomizer.shuffle(pairs)
            from quant.label_studies.search import base_engine
            if base_engine(engine_version) in (VERSION, 'quant-local-search-5') and generation == 1:
                # Explicitly chosen weak parents remain eligible for first-generation
                # combinations. Individual dominance is not evidence against synergy.
                usable = [row for row in bases if row['status'] == 'evaluated']
                priority = [(a, b) for i, a in enumerate(usable) for b in usable[i + 1:]]
                randomizer.shuffle(priority)
                known_pairs = {frozenset((a['id'], b['id'])) for a, b in priority}
                pairs = priority + [(a, b) for a, b in pairs if frozenset((a['id'], b['id'])) not in known_pairs]
            if not pairs:
                break
            for a, b in pairs:
                if len(attempts) >= config['max_candidates']:
                    stopped = 'candidate_budget'
                    break
                operation = randomizer.choice(('and', 'or')) if recipes[a['id']]['output_type'] == 'boolean_series' else 'mean'
                evaluate(lambda a=a, b=b, operation=operation: combine(recipes[a['id']], recipes[b['id']], operation),
                    [a['id'], b['id']], operation, generation)
            if stopped:
                break
    except InterruptedError:
        stopped = 'cancelled'
    except TimeoutError:
        stopped = 'time_budget'
    frontier = pareto(attempts)
    # Fixed risk-adjusted selection on validation only. Not a calibrated score.
    frontier.sort(key=selection_key)
    selected = frontier[0] if frontier else None
    final, baseline, label_final = None, None, None
    if selected and stopped not in ('time_budget', 'cancelled'):
        try:
            guard()
            trial = recipes[selected['id']]
            final_origin = inner_partitions[-1]['calculation_start'] if inner_partitions else 0
            final_rows = rows[final_origin:]
            values = calculate(trial['expression'], {key: [row[column] for row in final_rows] for key, column in trial['bindings'].items()},
                trial['parameters'], expected=trial['output_type'], check=guard)
            start, end = split['holdout']
            start, end = start - final_origin, end - final_origin
            options = dict(start=start, end=end, threshold=config['threshold'], fee_bps=config['fee_bps'], slippage_bps=config['slippage_bps'], output_type=trial['output_type'], check=guard)
            final = simulate_config(final_rows, values, config, **options)
            baseline = simulate_config(final_rows, values, config, baseline=True, **options)
            if 'label_target' in config:
                from quant.label_studies.calculation import evaluate as evaluate_labels
                label_final = evaluate_labels(final_rows, values, config['label_target'], start, end, guard)
        except (TimeoutError, InterruptedError) as exc:
            stopped = 'time_budget' if isinstance(exc, TimeoutError) else 'cancelled'
            final, baseline = None, None
            label_final = None
    output = {'engine_version': engine_version, 'dataset_hash': digest(snapshot), 'config': config, 'partitions': split,
        'seed_plan': [{'id': seed['id'], 'source_hash': digest(seed['candidate']), 'bindings': seed['bindings'], 'parameters': seed['parameters'], 'variants': seed.get('variants', [])} for seed in seeds],
        'attempts': attempts, 'selection_rule': NESTED_RULE if inner_partitions else 'train_pareto_then_validation_return_minus_drawdown_v1',
        'frontier_ids': [item['id'] for item in frontier], 'selected_id': selected['id'] if selected else '',
        'holdout_status': 'not_evaluated' if final is None else 'excluded_from_this_batch_selection_prior_usage_unattested',
        'holdout': final, 'buy_hold_baseline': baseline, 'stop_reason': stopped or 'generation_complete',
        'limitations': ['只验证受控表达式，未验证原平台源码等价性', '固定阈值/布尔条件做多或空仓，下一根开盘成交，区间末平仓',
            '未模拟涨跌停、停牌、流动性、成交量约束、T+1、融资与公司行动；净值回撤按开盘区间采样',
            '留出数据在本批选择后才评价，跨批次使用历史需由持久化工作流另行检查', '单位比较使用原始声明，尚未证明经济含义或尺度可比'] + ([
            '公式演化使用固定算子、窗口、权重与节点上限，按算子交错分配各代预算；保留训练 Pareto 与种子控制的探索父代',
            '标准化输出改为无量纲；数值阈值仍采用本轮固定假设，不自动映射不同尺度；滚动残差按同窗总体矩及截距计算，零方差传播缺失',
            '演化窗口和权重是公式常量，改变时形成新公式；不是原源码参数调整，也未证明新公式经济有效'] +
            (['时序排序是完整历史窗口内的中点秩，不是跨资产排名；改变尺度后阈值须重新解释',
              '条件门控仅在布尔条件为真时保留信号，其余输出缺失并按空仓处理；missing_signals包含主动屏蔽，不能全当数据故障']
             if config.get('evolution', {}).get('version') == 2 else []) if uses_evolution(engine_version, config) else [])}
    if 'strategy' in config:
        from quant.strategies.policy import LIMITATIONS
        output['limitations'] = LIMITATIONS + output['limitations'][3:]
    if 'label_target' in config:
        from quant.label_studies.search import RULE, NESTED_RULE as LABEL_NESTED_RULE
        output.update(label_holdout=label_final, selection_rule=LABEL_NESTED_RULE if inner_partitions else RULE)
        output['limitations'][0] = ('本次按训练标签Rank IC/覆盖率/复杂度Pareto与验证标签Rank IC/覆盖率选择，交易收益单列，不作为标签选择指标。'
            '每段先剔除标签终点越界的起点；相关未定义或有效配对不足的候选保留淘汰，不填0。'
            '仅选择后计算测试标签；重叠配对不是独立样本，不据IC宣称显著性或最优参数。' + output['limitations'][0])
    return output
