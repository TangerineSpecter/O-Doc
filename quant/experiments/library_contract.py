"""Executable library options and reproducible selection reasons, without ORM or models."""
import json
from rest_framework.exceptions import ValidationError
from quant.factors.expression import expression_hash
from quant.research.contracts import digest
from .contracts import unpack_seed
from .proposal_contract import validate_values
from .search import recipe, combine, FIELDS

METHOD = 'related-library-v1'
LIMIT = 2000
EXTRA_LIMIT = 4


def option(identity, data):
    if data['role'] not in ('factor', 'signal', 'filter'):
        raise ValidationError('非研究信号模块')
    parameters = {row['name']: json.loads(row['default_value']) for row in data['parameters']}
    bindings = {row['name']: row['name'].lower() for row in data['inputs']}
    if not set(bindings.values()) <= FIELDS:
        raise ValidationError('输入语义不足，不能自动映射行情')
    seed = unpack_seed({'candidate_id': identity, 'bindings': [{'name': k, 'column': v} for k, v in bindings.items()],
        'parameters': [{'name': k, 'value': v} for k, v in parameters.items()], 'variants': []}, data)
    validate_values(data, parameters)
    return {key: seed[key] for key in ('id', 'candidate', 'bindings', 'parameters')}


def compatible(candidate, parents):
    value = recipe(candidate['candidate'], candidate['bindings'], candidate['parameters'])
    for parent in parents:
        try:
            other = recipe(parent['candidate'], parent['bindings'], parent['parameters'])
            combine(value, other, 'and' if value['output_type'] == 'boolean_series' else 'mean')
            return True
        except ValidationError:
            continue
    return False


def reason(data, parents, semantic=None):
    shared_tags = sorted(set(data['tags']) & set().union(*(set(row['candidate']['tags']) for row in parents)))
    same_family = data['family'] != 'other' and data['family'] in {row['candidate']['family'] for row in parents}
    similarity = semantic['similarity'] if semantic else 0
    return {'shared_tags': shared_tags, 'same_family': same_family, 'semantic': semantic,
        'rank_score': round(min(len(shared_tags), 4) + int(same_family) * 2 + similarity * 4, 8)}


def structural_key(value):
    return expression_hash(value['candidate'])


def summary(context):
    if not context:
        return None
    names = {row['id']: row['candidate']['name'] for row in context['options']}
    return {key: context[key] for key in ('method', 'scanned', 'eligible', 'scan_limit', 'omitted_for_size')} | {
        'candidates': [{**row, 'name': names[row['candidate_id']]} for row in context['retrieved']],
        'claim': 'semantic_and_contract_relevance_only_not_performance'}


def validate_context(context, base, candidates, relations, *, collection_id, source_ids):
    """Historical selection is frozen; validate selected evidence, not today's ranking pool."""
    required = {'version', 'method', 'scan_limit', 'scanned', 'eligible', 'omitted_for_size', 'options', 'retrieved'}
    if isinstance(context, dict) and context.get('version') in (2, 3, 4, 5):
        required.add('research_memory')
    if isinstance(context, dict) and context.get('version') in (4,5):
        required.add('fixed_validation')
    if isinstance(context,dict) and context.get('version')==5 and 'selection_diagnostic' in context:
        required.add('selection_diagnostic')
    if not isinstance(context, dict) or set(context) != required or type(context['version']) is not int or context['version'] not in (1, 2, 3, 4, 5) or context['method'] != METHOD or context['scan_limit'] != LIMIT:
        raise ValidationError('跨库研究上下文版本无效')
    if any(type(context[key]) is not int or not 0 <= context[key] <= LIMIT for key in ('scanned', 'eligible', 'omitted_for_size')) or context['eligible'] > context['scanned']:
        raise ValidationError('跨库研究扫描统计无效')
    options, retrieved = context['options'], context['retrieved']
    if not isinstance(options, list) or not isinstance(retrieved, list) or len(retrieved) + context['omitted_for_size'] > min(EXTRA_LIMIT, context['eligible']) or len(options) != len(base) + len(retrieved) or options[:len(base)] != base:
        raise ValidationError('跨库研究基础父代或检索数量不一致')
    identities = {row['id'] for row in base}
    known = {structural_key(row) for row in base}
    for selected, info in zip(options[len(base):], retrieved):
        if not isinstance(selected, dict) or not isinstance(info, dict) or set(info) != {'candidate_id', 'source_id', 'report_id', 'entry_id', 'entry_title', 'reason', 'selection'}:
            raise ValidationError('跨库候选出处不完整')
        identity = info['candidate_id']
        candidate = candidates.get(identity, {})
        if not candidate or candidate['collection_id'] != collection_id or candidate['source_id'] in source_ids or identity in identities:
            raise ValidationError('跨库候选重复、跨文集或未提供不同来源')
        if any(info[key] != candidate[key] for key in ('source_id', 'report_id', 'entry_id')) or not isinstance(info['entry_title'], str):
            raise ValidationError('跨库候选来源引用不一致')
        expected = option(identity, candidate['data'])
        if digest(selected) != digest(expected) or structural_key(selected) in known or not compatible(selected, base):
            raise ValidationError('跨库候选契约、基线、去重或组合类型无效')
        details = info['reason']
        semantic = details.get('semantic') if isinstance(details, dict) else None
        if semantic is not None:
            if not isinstance(semantic, dict) or set(semantic) != {'relation_id', 'parent_id', 'similarity'}:
                raise ValidationError('跨库语义关联依据无效')
            edge = relations.get(semantic['relation_id'], {})
            if edge.get('kind') != 'semantic_similar' or {str(edge.get('left')), str(edge.get('right'))} != {identity, semantic['parent_id']} or semantic['parent_id'] not in {row['id'] for row in base} or edge.get('evidence', {}).get('similarity') != semantic['similarity']:
                raise ValidationError('跨库语义关联不对应所选父代')
        if details != reason(selected['candidate'], base, semantic) or info['selection'] not in ('related', 'diversity'):
            raise ValidationError('跨库检索理由或排序依据不一致')
        identities.add(identity); known.add(structural_key(selected))
