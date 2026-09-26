from rest_framework import serializers


class QuerySerializer(serializers.Serializer):
    page = serializers.IntegerField(min_value=1, max_value=100000, default=1)
    module = serializers.CharField(max_length=100, required=False, allow_blank=True)
    q = serializers.CharField(max_length=200, required=False, allow_blank=True)
    since = serializers.FloatField(required=False, min_value=0)
    until = serializers.FloatField(required=False, min_value=0)

    def validate(self, data):
        import math
        for key in ('since', 'until'):
            if key in data and not math.isfinite(data[key]):
                raise serializers.ValidationError('时间范围无效')
        if data.get('since', 0) > data.get('until', float('inf')):
            raise serializers.ValidationError('开始时间不能晚于结束时间')
        return data


class SelectionSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.RegexField(r'^[a-f0-9]{32}$'), max_length=200)


class PolicySerializer(serializers.Serializer):
    days = serializers.IntegerField(min_value=1, max_value=3650)
    max_mb = serializers.IntegerField(min_value=1, max_value=10240)


class ReportSerializer(serializers.Serializer):
    event_id = serializers.RegexField(r'^[a-f0-9]{32}$')
    request_id = serializers.RegexField(r'^[a-f0-9]{32}$', required=False, allow_blank=True)
    module = serializers.ChoiceField(choices=['frontend', 'network', 'stream', 'article'])
    error_type = serializers.ChoiceField(choices=['runtime', 'render', 'network', 'timeout', 'http', 'system_error', 'stream'])
    path = serializers.CharField(max_length=500, required=False)
    operation = serializers.CharField(max_length=80, required=False)
    http_status = serializers.IntegerField(min_value=0, max_value=599, required=False)
    stack = serializers.CharField(max_length=12000, required=False, allow_blank=True)

    def to_internal_value(self, data):
        if isinstance(data, dict) and set(data) - set(self.fields):
            raise serializers.ValidationError('诊断事件包含不支持的字段')
        return super().to_internal_value(data)
