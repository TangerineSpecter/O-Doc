from rest_framework import serializers
from anthology.models import Anthology
from system_settings.models import Agent, Skill
from .models import WorldCategory
from .publish_config import search_server


class TravelConfigSerializer(serializers.Serializer):
    collection_id = serializers.CharField(max_length=40)
    category_id = serializers.CharField(max_length=64)
    search_server_id = serializers.CharField(max_length=40)
    node_minutes = serializers.IntegerField(default=1, min_value=1, max_value=60)
    recent_cities = serializers.IntegerField(default=3, min_value=0, max_value=30)
    energy_cost = serializers.IntegerField(default=20, min_value=0, max_value=100)
    photo_enabled = serializers.BooleanField(default=True)
    owner_id = serializers.CharField(read_only=True)

    def validate(self, data):
        previous = self.context.get('previous', {})
        owner = self.context.get('owner_id') or previous.get('owner_id')
        collection = Anthology.objects.filter(pk=data['collection_id'], type='agent', is_valid=True).first()
        if not collection or (owner and collection.user_id != owner):
            raise serializers.ValidationError('请选择自己管理的有效 Agent 文集')
        if not WorldCategory.objects.filter(pk=data['category_id'], workflow_kind='travel', enabled=True).exists():
            raise serializers.ValidationError('请选择启用的旅行工作流分类')
        try:
            search_server(data)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        if self.context.get('enabled'):
            for agent in Agent.objects.filter(pk__in=self.context.get('agent_ids', [])):
                if not agent.model_id:
                    raise serializers.ValidationError(f'{agent.name} 未配置写作模型')
                if not bound_skill(agent, 'odoc_travel_journal'):
                    raise serializers.ValidationError(f'{agent.name} 未绑定启用的旅行游记 Skill')
        data['owner_id'] = owner or collection.user_id
        return data


def bound_skill(agent, key):
    return Skill.objects.filter(pk__in=agent.skills or [], skill_key=key, enabled=True).first()
