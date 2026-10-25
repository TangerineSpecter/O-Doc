"""HTTP and immutable plan contracts; parameter maps retain their literal names."""
import json
from quant.factors.expression import parameter_value
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from .search import recipe, validate_plan, validate_engine, SUPPORTED_VERSIONS
from .backtest import partitions


class StartInput(serializers.Serializer):
    request_key = serializers.RegexField(r'^[A-Za-z0-9_-]{16,64}$')
    name = serializers.CharField(max_length=200)
    dataset_id = serializers.CharField(max_length=40)
    # Lists avoid the application's camel-case middleware changing user names.
    seeds = serializers.ListField(child=serializers.DictField(), min_length=1, max_length=8)
    config = serializers.DictField()
    proposal_id = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')


def unpack_seed(raw: dict, candidate: dict) -> dict:
    if set(raw) != {'candidate_id', 'bindings', 'parameters', 'variants'}:
        raise ValidationError('父代需包含候选、输入绑定、实际参数和候选参数组')
    def pairs(rows, field):
        if not isinstance(rows, list) or len(rows) > 30 or any(not isinstance(row, dict) or set(row) != {'name', field} or not isinstance(row['name'], str) for row in rows):
            raise ValidationError('输入绑定/参数列表无效')
        result = {row['name']: row[field] for row in rows}
        if len(result) != len(rows):
            raise ValidationError('输入或参数名称重复')
        return result
    variants = raw['variants']
    if not isinstance(variants, list) or len(variants) > 16:
        raise ValidationError('每个父代最多 16 组候选参数')
    value = {'id': raw['candidate_id'], 'candidate': candidate, 'bindings': pairs(raw['bindings'], 'column'),
        'parameters': pairs(raw['parameters'], 'value'), 'variants': [pairs(row, 'value') for row in variants]}
    recipe(candidate, value['bindings'], value['parameters'])
    # Bound even rejected variants: never accept arbitrarily large nested JSON.
    for variant in value['variants']:
        for parameter in variant.values():
            valid = parameter_value(parameter)
            if not valid:
                raise ValidationError('候选参数必须为有限数值、布尔或有界字符串')
    return value


def validate_frozen(plan: dict, dataset: dict) -> None:
    base_fields = {'version', 'engine_version', 'name', 'dataset_hash', 'seeds', 'config'}
    proposal_fields = {'proposal_id', 'proposal_hash', 'proposal_adapted'} if isinstance(plan, dict) and plan.get('version') == 2 else set()
    if not isinstance(plan, dict) or set(plan) != base_fields | proposal_fields:
        raise ValidationError('实验方案字段无效')
    if type(plan['version']) is not int or plan['version'] not in (1, 2) or plan['engine_version'] not in SUPPORTED_VERSIONS or not isinstance(plan['name'], str) or not 0 < len(plan['name'].strip()) <= 200:
        raise ValidationError('实验方案版本或名称无效')
    if proposal_fields and (not isinstance(plan['proposal_id'], str) or not 1 <= len(plan['proposal_id']) <= 40 or not isinstance(plan['proposal_hash'], str) or len(plan['proposal_hash']) != 64 or type(plan['proposal_adapted']) is not bool):
        raise ValidationError('AI 提案引用格式无效')
    validate_plan(plan['seeds'], plan['config'])
    validate_engine(plan['engine_version'], plan['config'])
    if 'walk_forward' in plan['config']:
        from .temporal import windows
        windows(len(dataset['rows']), plan['config']['walk_forward'], plan['config']['gap'])
    else:
        partitions(len(dataset['rows']), gap=plan['config']['gap'])
    if len(json.dumps(plan, allow_nan=False)) > 500_000:
        raise ValidationError('实验方案超过大小上限')
    for seed in plan['seeds']:
        if set(seed) != {'id', 'candidate', 'bindings', 'parameters', 'variants'}:
            raise ValidationError('父代快照字段无效')
        recipe(seed['candidate'], seed['bindings'], seed['parameters'])
