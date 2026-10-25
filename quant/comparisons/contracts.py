"""HTTP/frozen contracts; user variable names stay in lists or raw JSON strings."""
import copy
import json
import platform
import re

import numpy
import pandas
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from quant.experiments.contracts import unpack_seed
from quant.experiments.search import recipe
from quant.research.contracts import digest
from .kernel import validate_policy

METHOD = 'controlled-output-comparison-v1'
ENGINE = 'quant-controlled-expression-1'
SIDE_FIELDS = {'id', 'candidate', 'candidate_hash', 'source_id', 'source_hash', 'report_id', 'report_hash', 'bindings', 'parameters'}
PLAN_FIELDS = {'version', 'method', 'name', 'left', 'right', 'dataset_id', 'dataset_hash', 'policy', 'engine_version', 'runtime'}


class ComparisonInput(serializers.Serializer):
    request_key = serializers.RegexField(r'^[A-Za-z0-9_-]{16,64}$')
    name = serializers.CharField(max_length=200)
    dataset_id = serializers.CharField(max_length=40)
    left = serializers.DictField()
    right = serializers.DictField()
    policy = serializers.DictField()

    def validate_policy(self, value):
        if set(value) != {'absolute_tolerance', 'relative_tolerance', 'warmup_bars'}:
            raise ValidationError('对照需明确绝对/相对容差和共同预热行数')
        policy = {'version': 1, **value}
        validate_policy(policy)
        return policy


class MergeInput(serializers.Serializer):
    request_key = serializers.RegexField(r'^[A-Za-z0-9_-]{16,64}$')
    comparison_id = serializers.CharField(max_length=40)
    name = serializers.CharField(max_length=200)
    reason = serializers.CharField(max_length=3000, allow_blank=True, trim_whitespace=False)


class WithdrawalInput(serializers.Serializer):
    request_key = serializers.RegexField(r'^[A-Za-z0-9_-]{16,64}$')
    reason = serializers.CharField(max_length=3000, allow_blank=True, trim_whitespace=False)


class Query(serializers.Serializer):
    factor_id = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')
    offset = serializers.IntegerField(min_value=0, default=0)
    limit = serializers.IntegerField(min_value=1, max_value=40, default=20)


def request_key(value) -> bool:
    return isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{16,64}', value) is not None


def runtime() -> dict:
    return {'python': platform.python_version(), 'numpy': numpy.__version__, 'pandas': pandas.__version__}


def side(candidate, raw: dict) -> dict:
    if (not isinstance(raw, dict) or set(raw) != {'candidate_id', 'bindings', 'parameters'}
            or raw['candidate_id'] != candidate.pk):
        raise ValidationError('对照两侧需明确候选、全部实际参数和输入列')
    seed = unpack_seed({**raw, 'variants': []}, candidate.data)
    return {'id': candidate.pk, 'candidate': copy.deepcopy(candidate.data), 'candidate_hash': candidate.content_hash,
        'source_id': candidate.report.source_id, 'source_hash': candidate.report.source.content_hash,
        'report_id': candidate.report_id, 'report_hash': candidate.report.content_hash,
        'bindings': seed['bindings'], 'parameters': seed['parameters']}


def validate_plan(plan: dict) -> None:
    if (not isinstance(plan, dict) or set(plan) != PLAN_FIELDS or type(plan['version']) is not int
            or plan['version'] != 1 or plan['method'] != METHOD or plan['engine_version'] != ENGINE
            or not isinstance(plan['name'], str) or not 1 <= len(plan['name'].strip()) <= 200):
        raise ValidationError('因子对照版本、名称或字段无效')
    if len(json.dumps(plan, ensure_ascii=False, allow_nan=False)) > 1_000_000:
        raise ValidationError('因子对照快照超过大小上限')
    validate_policy(plan['policy'])
    if (not isinstance(plan['runtime'], dict) or set(plan['runtime']) != {'python', 'numpy', 'pandas'}
            or any(not isinstance(value, str) or not 1 <= len(value) <= 100 for value in plan['runtime'].values())):
        raise ValidationError('对照计算环境记录无效')
    for field in ('left', 'right'):
        value = plan[field]
        if not isinstance(value, dict) or set(value) != SIDE_FIELDS:
            raise ValidationError('对照候选快照字段无效')
        if value['candidate_hash'] != digest(value['candidate']):
            raise ValidationError('对照候选内容哈希无效')
        for key in ('id', 'source_id', 'report_id'):
            if not isinstance(value[key], str) or not 1 <= len(value[key]) <= 40:
                raise ValidationError('对照候选出处格式无效')
        for key in ('candidate_hash', 'source_hash', 'report_hash'):
            if not isinstance(value[key], str) or not re.fullmatch('[0-9a-f]{64}', value[key]):
                raise ValidationError('对照候选出处哈希格式无效')
        recipe(value['candidate'], value['bindings'], value['parameters'])
    if plan['left']['id'] == plan['right']['id']:
        raise ValidationError('请选择两个不同候选；同一候选的参数研究请使用参数实验')
    if (not isinstance(plan['dataset_id'], str) or not 1 <= len(plan['dataset_id']) <= 40
            or not isinstance(plan['dataset_hash'], str) or not re.fullmatch('[0-9a-f]{64}', plan['dataset_hash'])):
        raise ValidationError('对照行情引用无效')


def comparison_hash(plan: dict, result: dict) -> str:
    return digest({'plan': plan, 'result': result})


def merge_hash(collection_id: str, comparison_id: str, comparison_digest: str, name: str, reason: str, curation: dict) -> str:
    return digest({'version': 1, 'anthology': collection_id, 'comparison': comparison_id,
        'comparison_hash': comparison_digest, 'name': name, 'reason': reason, 'curation': curation})


def withdrawal_hash(collection_id: str, merge_id: str, merge_digest: str, reason: str) -> str:
    return digest({'version': 1, 'anthology': collection_id, 'merge': merge_id, 'merge_hash': merge_digest, 'reason': reason})
