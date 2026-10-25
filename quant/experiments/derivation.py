"""Deterministic reusable formulas from evaluated attempts, never source quotations."""
import copy
import json
from quant.research.contracts import digest
from quant.parameters.domains import renamed

VERSION = 'experiment-derived-v1'
LIMITATIONS = ('仅在本机受限表达式引擎中计算过；未验证原平台等价性或实盘有效性。'
    '参数是所记录尝试的实际值，不是推荐最优值。父代数据和已查看的留出结果会影响后续研究，需使用新的验证数据。')


def eligible_attempts(envelope):
    """At most three derived frontier members, selected without holdout metrics."""
    if envelope.get('status') != 'completed' or not envelope.get('output'):
        return []
    output = envelope['output']
    by_id = {item['id']: item for item in output['attempts']}
    selected, seen = [], set()
    for identity in output['frontier_ids']:
        item = by_id[identity]
        if item['status'] == 'evaluated' and item['operation'] != 'source_candidate' and item['fingerprint'] not in seen:
            selected.append(item)
            seen.add(item['fingerprint'])
        if len(selected) == 3:
            break
    return selected


def source_parents(plan, attempts, attempt):
    seeds = {seed['id'] for seed in plan['seeds']}
    previous = {item['id']: item for item in attempts}
    found, visited, pending = set(), set(), list(attempt['parents'])
    while pending:
        identity = pending.pop()
        if identity in seeds:
            found.add(identity)
        elif identity not in visited:
            visited.add(identity)
            pending.extend(previous[identity]['parents'])
    return [seed['id'] for seed in plan['seeds'] if seed['id'] in found]


def build_candidate(request_id, checkpoint_id, plan, snapshot, attempts, attempt):
    """Rebuilt identically on sync. Anchoring report is contextual, not extraction."""
    value = copy.deepcopy(attempt['recipe'])
    parents = source_parents(plan, attempts, attempt)
    seeds = [seed for seed in plan['seeds'] if seed['id'] in parents]
    families = {seed['candidate']['family'] for seed in seeds}
    roles = {seed['candidate']['role'] for seed in seeds}
    parameter_contracts = attempt_parameter_contracts(plan, attempts, attempt['id'])
    # Merge inputs with the same explicit column. Keep parameters namespaced,
    # including each branch's actual values, so later variants remain possible.
    def rename(node):
        if node['op'] == 'input':
            node['name'] = value['bindings'][node['name']]
        for child in node.get('args', []):
            rename(child)
    rename(value['expression'])
    columns = sorted(set(value['bindings'].values()))
    parameters = [{**copy.deepcopy(parameter_contracts[key]), 'name': key,
        'default_value': json.dumps(number),
        'suggestion': '保存值仅用于复现；后续调整应比较敏感度并使用新的验证数据。',
        'evidence': f"{request_id} / {attempt['id']} 的实际计算参数"}
        for key, number in sorted(value['parameters'].items())]
    from .evolution import NAMES
    name = NAMES[attempt['transformation']['operator']] if attempt['operation'] == 'formula_mutation' else {'parameter_variant': '参数变体', 'mean': '均值组合', 'and': '条件交集', 'or': '条件并集'}[attempt['operation']]
    formula = json.dumps(value['expression'], ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return {'name': f"{name} · {plan['name'][:100]} · {attempt['id']}",
        'role': next(iter(roles)) if len(roles) == 1 else 'signal' if value['output_type'] == 'boolean_series' else 'factor',
        'family': next(iter(families)) if len(families) == 1 else 'other',
        'summary': f"由 {len(parents)} 个父代经{name}产生。训练与验证段筛选后归档，尚待独立验证。",
        'formula': formula, 'expression': value['expression'],
        'inputs': [{'name': column, 'meaning': f'实验行情 {column} 列', 'availability': '完整收盘后可得，用于下一根开盘信号',
            'missing_policy': '缺失传播，滚动窗口需完整；不填补缺失值'} for column in columns],
        'parameters': parameters, 'output_type': value['output_type'], 'units': value['units'],
        'timeframe': f"本轮行情周期：{snapshot['timeframe']}；其他周期未验证",
        'dependencies': [plan['engine_version']], 'limitations': LIMITATIONS,
        'tags': ['实验衍生', '待独立验证'], 'evidence': [],
        'derivation': {'version': VERSION, 'request_id': request_id, 'checkpoint_id': checkpoint_id,
            'attempt_id': attempt['id'], 'parent_candidate_ids': parents, 'parent_attempt_ids': attempt['parents'],
            'operation': attempt['operation'], 'engine_version': plan['engine_version'],
            **({'transformation': copy.deepcopy(attempt['transformation'])} if 'transformation' in attempt else {}),
            'dataset_hash': plan['dataset_hash'], 'selection_rule': 'derived_frontier_first_three_v1'}}


def publish_derived(result):
    """Called inside authorized completion transaction, never by restore/read paths."""
    from quant.models import FactorCandidate
    from quant.factors.expression import expression_hash
    request = result.request
    for attempt in eligible_attempts(result.data):
        ordinal = int(attempt['id'].split('-')[-1])
        checkpoint_id = digest(['experiment-checkpoint-v1', request.pk, ordinal])[:40]
        data = build_candidate(request.pk, checkpoint_id, request.plan, request.dataset.snapshot,
            result.data['output']['attempts'], attempt)
        parent = FactorCandidate.objects.get(pk=data['derivation']['parent_candidate_ids'][0])
        candidate, created = FactorCandidate.objects.get_or_create(id=digest([VERSION, checkpoint_id])[:40], defaults={
            'report_id': parent.report_id, 'ordinal': 0, 'derived_checkpoint_id': checkpoint_id,
            'formula_version_id': digest(['factor-formula-experiment-1', checkpoint_id])[:40], 'qualification_version': 1, 'admission_version':1,
            'data': data, 'content_hash': digest(data), 'expression_hash': expression_hash(data)})
        if created:
            from quant.factors.versions.services import register_experiment
            register_experiment(candidate, data['derivation']['parent_candidate_ids'])
            from quant.verification.services import qualify
            qualify(candidate)


def auto_index_derived(result_id, token):
    """Deferred optional indexing uses the completing device's revocable lease."""
    import logging
    from django.db import transaction
    from quant.locking import collection_lock
    from quant.models import ExperimentResult, ExperimentJob, FactorCandidate
    from quant.graph.indexing import queue_index
    result = ExperimentResult.objects.select_related('request__anthology').filter(pk=result_id).first()
    if not result:
        return
    try:
        with collection_lock(result.request.anthology_id), transaction.atomic():
            collection = result.request.anthology
            collection.refresh_from_db()
            if not collection.is_valid or collection.type != 'quant' or collection.permission != 'private':
                return
            if not ExperimentJob.objects.filter(request=result.request, status='completed', lease_token=token, owner_id=collection.user_id).exists():
                return
            ids = list(FactorCandidate.objects.filter(derived_checkpoint_id__in=result.request.checkpoints.values('id')).values_list('id', flat=True))
            if ids:
                queue_index(collection, candidate_ids=ids, automatic=True)
    except Exception as exc:
        logging.getLogger(__name__).info('Quant derived index unavailable result=%s type=%s', result_id, type(exc).__name__)


def attempt_parameter_contracts(plan: dict, attempts: list[dict], attempt_id: str) -> dict:
    """Preserve namespaced domains across nested mutation/combination branches."""
    contracts = {}
    seed_map = {seed['id']: seed for seed in plan['seeds']}
    for item in attempts:
        if item['operation'] == 'source_candidate':
            parameters = seed_map[item['parents'][0]]['candidate']['parameters']
            mapping = {row['name']: f'p{index}' for index, row in enumerate(sorted(parameters, key=lambda row: row['name']))}
            contracts[item['id']] = {row['name']: row for row in renamed(parameters, mapping)}
        elif item['operation'] == 'parameter_variant' or (item['operation'] == 'formula_mutation' and len(item['parents']) == 1):
            contracts[item['id']] = contracts[item['parents'][0]]
        else:
            contracts[item['id']] = {}
            for prefix, parent in zip(('a_', 'b_'), item['parents']):
                # Legacy rows were stored under namespaced keys without rewriting
                # their internal name. Rename from keys so nested branches align.
                parameters = [dict(row, name=key) for key, row in contracts[parent].items()]
                mapping = {key: prefix + key for key in contracts[parent]}
                contracts[item['id']].update({row['name']: row for row in renamed(parameters, mapping)})
    return contracts[attempt_id]
