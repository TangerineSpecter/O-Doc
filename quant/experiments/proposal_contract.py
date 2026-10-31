"""Executable research designs, restricted to supplied immutable parent contracts."""
import copy
from rest_framework import serializers
from quant.research.contracts import digest
from .contracts import unpack_seed
from .search import validate_plan, variant_recipe


class Seed(serializers.Serializer):
    candidate_id = serializers.CharField(max_length=40)
    variants = serializers.ListField(child=serializers.ListField(child=serializers.DictField(), max_length=30), max_length=16)


class Proposal(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    hypothesis = serializers.CharField(max_length=4000)
    falsification = serializers.CharField(max_length=3000)
    data_requirement = serializers.CharField(max_length=3000)
    evidence_refs = serializers.ListField(child=serializers.CharField(max_length=160), min_length=1, max_length=12)
    seeds = Seed(many=True, min_length=1, max_length=8)


def validate_proposal(value: dict, evidence: dict | None = None) -> dict:
    serializer = Proposal(data=value)
    serializer.is_valid(raise_exception=True)
    proposal = dict(serializer.validated_data)
    if evidence is None:
        return proposal
    options = {row['id']: row for row in evidence['planning_options']}
    facts = evidence['evidence']
    if any(ref not in facts or facts[ref] is None for ref in proposal['evidence_refs']):
        raise serializers.ValidationError('实验方案引用不存在的证据')
    seeds = []
    for proposed in proposal['seeds']:
        option = options.get(proposed['candidate_id'])
        if not option:
            raise serializers.ValidationError('实验方案选择了未提供或无权使用的父代')
        raw = {'candidate_id': option['id'], 'bindings': [{'name': name, 'column': column} for name, column in option['bindings'].items()],
            'parameters': [{'name': name, 'value': value} for name, value in option['parameters'].items()], 'variants': proposed['variants']}
        seed = unpack_seed(raw, option['candidate'])
        seen = {digest(seed['parameters'])}
        for variant in seed['variants']:
            variant_recipe(seed, variant)  # Only used signal parameters may change.
            fingerprint = digest(variant)
            if fingerprint in seen:
                raise serializers.ValidationError('AI 参数组重复或未改变基线')
            seen.add(fingerprint)
            validate_values(seed['candidate'], variant)
        validate_values(seed['candidate'], seed['parameters'])
        seeds.append(seed)
    config = facts['execution']['config']
    validate_plan(seeds, config)
    if sum(1 + len(seed['variants']) for seed in seeds) > config['max_candidates']:
        raise serializers.ValidationError('AI 父代与参数组总数超过已提供的实验预算')
    if 'library_retrieval' in evidence and len(seeds) > 1 and (config['generations'] < 2 or sum(1 + len(seed['variants']) for seed in seeds) >= config['max_candidates']):
        raise serializers.ValidationError('跨来源组合方案需至少 2 代，并为组合保留尝试预算')
    # Only declared scalar values; categorical text is data, never script execution.
    return proposal


def validate_values(candidate: dict, parameters: dict) -> None:
    """Domains are checked in recipe; also enforce legacy types and rolling bounds."""
    from .expression import MAX_WINDOW
    def visit(node):
        if node['op'] == 'program':
            from quant.algorithms.contract import validate_windows
            validate_windows(node, parameters)
            return
        if node['op'] in ('lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank'):
            window = node['args'][1]
            value = window['value'] if window['op'] == 'constant' else parameters[window['name']]
            if type(value) is not int or not 1 <= value <= MAX_WINDOW:
                raise serializers.ValidationError('AI 窗口参数必须为 1–2000 的整数')
        for child in node.get('args', []):
            visit(child)
    if candidate['expression'].get('op') == 'program':
        from quant.algorithms.contract import validate_windows
        validate_windows(candidate['expression'], parameters)
    else:
        visit(candidate['expression'])
    for row in candidate['parameters']:
        kind, value = row['type'].strip().lower(), parameters[row['name']]
        if ((kind in ('int', 'integer') and type(value) is not int)
                or (kind in ('bool', 'boolean') and type(value) is not bool)
                or (kind in ('float', 'double', 'number') and type(value) not in (int, float))):
            raise serializers.ValidationError('AI 参数值与已识别类型不一致')


def proposal_data(review: dict, evidence: dict) -> dict:
    proposed = validate_proposal(review['proposal'], evidence)
    options = {row['id']: row for row in evidence['planning_options']}
    seeds = []
    for item in proposed['seeds']:
        option = copy.deepcopy(options[item['candidate_id']])
        option['variants'] = [{row['name']: row['value'] for row in variant} for variant in item['variants']]
        seeds.append(option)
    return {**({'library_retrieval': evidence['library_retrieval']} if 'library_retrieval' in evidence else {}), 'version': 1, **{key: value for key, value in proposed.items() if key != 'seeds'},
        'seeds': seeds, 'config': copy.deepcopy(evidence['evidence']['execution']['config']),
        'evidence_hash': digest(evidence), 'status': 'unverified_requires_fresh_validation',
        'constraint_status': ('declared_domains_types_and_windows_checked_other_constraints_require_review'
            if any('domain' in row for seed in seeds for row in seed['candidate']['parameters'])
            else 'engine_types_and_windows_checked_other_constraints_require_review')}
