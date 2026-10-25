"""Bounded batches of independent source materials, not concatenated prompts."""
import json
import re
from rest_framework import serializers
from quant.research.intake import IntakeInput

MAX_ITEMS = 20
MAX_BYTES = 1_000_000
ACTIVE = ('pending', 'running')
REASONS = {'completed': '本批分析结束', 'archived': '已归档，尚未启用分析',
    'waiting_model': '资料已归档，等待配置可用模型', 'cancelled': '已停止批次，保留已有报告',
    'wall_budget': '达到批次总耗时上限', 'interrupted': '本机执行已中断，等待显式重试',
    'executor_failed': '本机批次执行器不可用'}
SKIPS = {'source_unavailable': '来源已删除或不可用', 'invalid_input': '来源无法进入分析，请在研究详情检查材料与模型限制'}


class MaterialInput(IntakeInput):
    request_key = None
    analyze = None
    model_id = None


class BatchInput(serializers.Serializer):
    request_key = serializers.RegexField(r'^[a-zA-Z0-9_-]{16,64}$')
    name = serializers.CharField(max_length=200, default='批量收集')
    items = MaterialInput(many=True, min_length=1, max_length=MAX_ITEMS)
    analyze = serializers.BooleanField(default=True)
    model_id = serializers.CharField(max_length=40, allow_blank=True, default='')
    wall_seconds = serializers.IntegerField(min_value=30, max_value=3600, default=1800)

    def validate_items(self, value):
        if len(json.dumps(value, ensure_ascii=False).encode()) > MAX_BYTES:
            raise serializers.ValidationError('单批资料总量不能超过 1 MB，请拆分批次')
        return value


class RetryInput(serializers.Serializer):
    request_key = serializers.RegexField(r'^[a-zA-Z0-9_-]{16,64}$')
    model_id = serializers.CharField(max_length=40, allow_blank=True, default='')
    wall_seconds = serializers.IntegerField(min_value=30, max_value=3600, default=1800)


def validate_plan(plan):
    fields = {'version', 'name', 'sources', 'model_id', 'analyze', 'wall_seconds', 'parent_id', 'request_hash'}
    if not isinstance(plan, dict) or set(plan) != fields or type(plan['version']) is not int or plan['version'] != 1:
        raise serializers.ValidationError('批次计划版本或字段无效')
    if not isinstance(plan['name'], str) or not plan['name'].strip() or len(plan['name']) > 200:
        raise serializers.ValidationError('批次名称无效')
    if type(plan['analyze']) is not bool or type(plan['wall_seconds']) is not int or not 30 <= plan['wall_seconds'] <= 3600:
        raise serializers.ValidationError('批次执行预算无效')
    if not isinstance(plan['model_id'], str) or len(plan['model_id']) > 40:
        raise serializers.ValidationError('批次模型无效')
    if not isinstance(plan['parent_id'], str) or len(plan['parent_id']) > 40:
        raise serializers.ValidationError('重试批次引用无效')
    if not isinstance(plan['request_hash'], str) or not re.fullmatch(r'[0-9a-f]{64}', plan['request_hash']):
        raise serializers.ValidationError('批次请求摘要无效')
    sources = plan['sources']
    if (not isinstance(sources, list) or not 1 <= len(sources) <= MAX_ITEMS
            or any(not isinstance(item, str) or not item or len(item) > 40 for item in sources)
            or len(set(sources)) != len(sources)):
        raise serializers.ValidationError('批次来源数量、身份或重复记录无效')
    return plan
