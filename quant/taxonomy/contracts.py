"""Pure bounded vocabulary contracts, with stable concepts and editable aliases."""
import copy
import json
import re
import unicodedata
from rest_framework import serializers
from quant.research.contracts import digest
from .builtins import DIMENSIONS, catalog

MAX_TERMS = 192
ID = r'^(?:' + '|'.join(DIMENSIONS) + r'):[a-z][a-z0-9_]{0,38}$'


def key(value: str) -> str:
    return unicodedata.normalize('NFKC', value).strip().casefold()


class Term(serializers.Serializer):
    id = serializers.RegexField(ID, max_length=48)
    dimension = serializers.ChoiceField(choices=tuple(DIMENSIONS))
    label = serializers.CharField(max_length=50)
    aliases = serializers.ListField(child=serializers.CharField(max_length=50), max_length=12)
    definition = serializers.CharField(max_length=500)
    active = serializers.BooleanField()

    def validate(self, value):
        if value['id'].split(':', 1)[0] != value['dimension']:
            raise serializers.ValidationError('词条编码与维度不一致')
        value['label'] = unicodedata.normalize('NFKC', value['label']).strip()
        seen, aliases = {key(value['label'])}, []
        for alias in value['aliases']:
            normalized = unicodedata.normalize('NFKC', alias).strip()
            if key(normalized) not in seen:
                seen.add(key(normalized)); aliases.append(normalized)
        value['aliases'] = aliases
        if len(value['label']) > 50 or any(len(alias) > 50 for alias in aliases):
            raise serializers.ValidationError('规范化后的名称或别名过长')
        return value


def core(term: dict) -> dict:
    return {field: term[field] for field in ('id', 'dimension', 'definition')}


def validate(data: dict, previous: dict | None = None) -> dict:
    if (not isinstance(data, dict) or set(data) != {'version', 'builtin_version', 'reason', 'terms'}
            or type(data['version']) is not int or data['version'] != 1
            or type(data['builtin_version']) is not int or data['builtin_version'] != 1
            or not isinstance(data['reason'], str) or not 0 < len(data['reason'].strip()) <= 3000):
        raise serializers.ValidationError('词表版本或修订说明无效')
    if not isinstance(data['terms'], list) or any(not isinstance(row, dict) or set(row) != set(Term().fields)
            or type(row.get('active')) is not bool for row in data['terms']):
        raise serializers.ValidationError('词条字段不完整或启用状态无效')
    serializer = Term(data=data['terms'], many=True, min_length=1, max_length=MAX_TERMS)
    serializer.is_valid(raise_exception=True)
    terms = list(serializer.validated_data)
    required = {row['id']: row for row in catalog()['terms']}
    prior = {row['id']: row for row in (previous or catalog())['terms']}
    current = {row['id']: row for row in terms}
    if len(current) != len(terms) or not set(prior) <= set(current) or not set(required) <= set(current):
        raise serializers.ValidationError('词条编码重复或删除了已有词条；请改为停用')
    names = set()
    for row in terms:
        old = prior.get(row['id']) or required.get(row['id'])
        if old and core(old) != core(row):
            raise serializers.ValidationError('稳定词条的维度和含义不可重用；请新建词条')
        if row['dimension'] == 'evidence' and row != required.get(row['id']):
            raise serializers.ValidationError('证据状态由业务记录决定，不能编辑或添加证据级别')
        name = (row['dimension'], key(row['label']))
        if name in names:
            raise serializers.ValidationError('同一维度的规范名称不能重复；别名歧义将单独展示')
        names.add(name)
    result = {'version': 1, 'builtin_version': 1, 'reason': data['reason'].strip(), 'terms': sorted(terms, key=lambda row: row['id'])}
    if len(json.dumps(result, ensure_ascii=False)) > 160000:
        raise serializers.ValidationError('词表超过大小上限')
    return result


def reference(data: dict, revision_id: str = '') -> dict:
    return {'version': 1, 'builtin_version': 1, 'revision_id': revision_id, 'content_hash': digest(data)}


def validate_ref(value: dict) -> dict:
    if (not isinstance(value, dict) or set(value) != {'version', 'builtin_version', 'revision_id', 'content_hash'}
            or type(value['version']) is not int or value['version'] != 1 or type(value['builtin_version']) is not int or value['builtin_version'] != 1
            or not isinstance(value['revision_id'], str) or len(value['revision_id']) > 40
            or not isinstance(value['content_hash'], str) or not re.fullmatch('[0-9a-f]{64}', value['content_hash'])):
        raise serializers.ValidationError('词表快照引用无效')
    return copy.deepcopy(value)
