from rest_framework import serializers
from .metrics import DEFAULT_POLICY


class QuerySerializer(serializers.Serializer):
    hours = serializers.IntegerField(default=24, min_value=1, max_value=720)
    kind = serializers.ChoiceField(choices=['', 'request', 'stream', 'sql', 'ai', 'task', 'http'], default='')
    operation = serializers.CharField(max_length=240, default='', allow_blank=True)
    page = serializers.IntegerField(default=1, min_value=1, max_value=10000)


class PolicySerializer(serializers.Serializer):
    enabled = serializers.BooleanField(required=False)

    def get_fields(self):
        fields = super().get_fields()
        for key in DEFAULT_POLICY:
            if key == 'enabled':
                continue
            high = 365 if key.endswith('_days') else 2000 if key == 'max_mb' else 3600000
            fields[key] = serializers.IntegerField(min_value=1, max_value=high, required=False)
        return fields
