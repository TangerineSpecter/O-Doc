from rest_framework import serializers

from quant.models import MT4Attachment, MT4Backtest, MT4Expert
from .parser import normalize_metric_prefixes
from .parameters import preserve_hidden_parameters, project_report_parameters


def _parameters(value):
    if not isinstance(value, list) or len(value) > 200:
        raise serializers.ValidationError('参数须为不超过 200 项的列表')
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get('name'), str) or not isinstance(item.get('value'), str):
            raise serializers.ValidationError('参数名称和值必须是文本')
        if len(item['name']) > 255 or len(item['value']) > 2000:
            raise serializers.ValidationError('参数名称或值过长')
        if any(key in item and (not isinstance(item[key], str) or len(item[key]) > 2000) for key in ('label', 'type', 'description')):
            raise serializers.ValidationError('参数说明格式无效')
    return value


class ExpertSerializer(serializers.ModelSerializer):
    class Meta:
        model = MT4Expert
        fields = ['id', 'name', 'category', 'version', 'source_url', 'forum_url', 'requirements', 'minimum_capital', 'timeframe', 'account_requirement',
                  'notes', 'trading_logic', 'parameters', 'parameter_sets', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_parameters(self, value):
        value = _parameters(value)
        names = [item['name'].strip() for item in value]
        if any(not name for name in names) or len(set(names)) != len(names):
            raise serializers.ValidationError('参数名称不能为空或重复')
        return value

    def validate_parameter_sets(self, value):
        if not isinstance(value, list) or len(value) > 100:
            raise serializers.ValidationError('参数组合须为不超过 100 项的列表')
        for item in value:
            if not isinstance(item, dict) or not isinstance(item.get('name'), str) or not item['name'].strip() or len(item['name']) > 255:
                raise serializers.ValidationError('参数组合名称无效')
            _parameters(item.get('parameters'))
        return value


class ReportDataField(serializers.JSONField):
    def to_representation(self, value):
        value = super().to_representation(value)
        if isinstance(value, dict):
            value = project_report_parameters(value)
            if isinstance(value.get('metrics'), list):
                value['metrics'] = normalize_metric_prefixes(value['metrics'])
        return value


class TestSerializer(serializers.ModelSerializer):
    data = ReportDataField()

    class Meta:
        model = MT4Backtest
        fields = ['id', 'expert_id', 'title', 'description', 'conclusion', 'data', 'report_hash', 'created_at', 'updated_at']
        read_only_fields = ['id', 'expert_id', 'report_hash', 'created_at', 'updated_at']

    def update(self, instance, validated_data):
        if 'data' in validated_data:
            data = preserve_hidden_parameters(instance.data, validated_data['data'])
            if len(data.get('parameters', [])) > 200:
                raise serializers.ValidationError('参数须为不超过 200 项的列表（包含原始报告隐藏项）')
            validated_data['data'] = data
        return super().update(instance, validated_data)

    def validate_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('回测数据格式无效')
        if 'parameters' in value:
            _parameters(value['parameters'])
        fields = value.get('fields', {})
        if not isinstance(fields, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in fields.items()):
            raise serializers.ValidationError('回测条件必须是文本')
        metrics = value.get('metrics', [])
        if not isinstance(metrics, list) or len(metrics) > 500 or any(not isinstance(row, list) or len(row) > 20 or any(not isinstance(cell, str) or len(cell) > 2000 for cell in row) for row in metrics):
            raise serializers.ValidationError('回测指标格式无效')
        events = value.get('events', [])
        event_keys = ('sequence', 'time', 'type', 'order', 'lots', 'price', 'stop_loss', 'take_profit', 'profit', 'balance')
        if not isinstance(events, list) or len(events) > 200000 or any(not isinstance(event, dict) or any(not isinstance(event.get(key), str) or len(event[key]) > 255 for key in event_keys) for event in events):
            raise serializers.ValidationError('交易事件格式无效')
        return value


class TestSummarySerializer(TestSerializer):
    # The summary query must supply this projection; it never reads deferred
    # `data`, avoiding an extra query or deserializing large event histories.
    data = ReportDataField(source='_summary_data', read_only=True)


class AttachmentSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='asset.original_name', read_only=True)
    file_type = serializers.CharField(source='asset.file_type', read_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = MT4Attachment
        fields = ['id', 'asset_id', 'backtest_id', 'role', 'name', 'file_type', 'url', 'created_at']
        read_only_fields = fields

    def get_url(self, instance):
        action = 'view' if instance.asset.file_type == 'image' else 'download'
        return f'/api/resource/{action}/{instance.asset_id}'
