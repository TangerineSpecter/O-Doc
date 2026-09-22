from rest_framework import serializers

from utils.drf_utils import get_current_user_identifier
from .models import Whiteboard
from .services import normalize_document_payload


class WhiteboardSerializer(serializers.ModelSerializer):
    created_at = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()

    class Meta:
        model = Whiteboard
        fields = [
            'id', 'title', 'description', 'nodes', 'edges', 'view_offset', 'scale', 'insights',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    @staticmethod
    def _timestamp(value):
        return int(value.timestamp() * 1000)

    def get_created_at(self, obj):
        return self._timestamp(obj.created_at)

    def get_updated_at(self, obj):
        return self._timestamp(obj.updated_at)

    def validate(self, attrs):
        provided_fields = set(attrs)
        try:
            data = normalize_document_payload({
                'title': attrs.get('title', self.instance.title if self.instance else None),
                'description': attrs.get('description', self.instance.description if self.instance else ''),
                'nodes': attrs.get('nodes', self.instance.nodes if self.instance else []),
                'edges': attrs.get('edges', self.instance.edges if self.instance else []),
                'viewOffset': attrs.get('view_offset', self.instance.view_offset if self.instance else {'x': 80, 'y': 80}),
                'scale': attrs.get('scale', self.instance.scale if self.instance else 1),
                'insights': attrs.get('insights', self.instance.insights if self.instance else None),
            })
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        attrs.update({
            field_name: value
            for field_name, value in data.items()
            if self.instance is None or field_name in provided_fields
        })
        return attrs

    def create(self, validated_data):
        validated_data['user_id'] = get_current_user_identifier(self.context.get('request'))
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if not validated_data:
            return instance
        for field_name, value in validated_data.items():
            setattr(instance, field_name, value)
        instance.save(update_fields=[*validated_data.keys(), 'updated_at'])
        return instance
