from rest_framework import serializers
from anthology.models import Anthology
from system_settings.models import Agent, Skill
from system_mcp.image_generation import resolve_image_model
from system_settings.image_generation_options import COMMON_IMAGE_RATIOS, get_image_generation_profile, resolve_image_generation_request
from system_settings.grsai_images import GrsaiImageError
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
    image_model_id = serializers.CharField(max_length=40, allow_blank=True, default='')
    image_aspect_ratio = serializers.ChoiceField(choices=COMMON_IMAGE_RATIOS, default='1:1')
    image_size = serializers.ChoiceField(choices=['1K', '2K', '4K'], default='1K')
    owner_id = serializers.CharField(read_only=True)

    def validate_image_model_id(self, value):
        if value:
            try:
                resolve_image_model(value)
            except GrsaiImageError as exc:
                raise serializers.ValidationError(str(exc)) from exc
        return value

    def validate(self, data):
        if data.get('photo_enabled'):
            try:
                model = resolve_image_model(data.get('image_model_id'))
            except GrsaiImageError:
                model = None  # 缺少默认配图配置仍允许旅行与文字日记。
            if model and get_image_generation_profile(model).mode != 'automatic':
                try:
                    resolve_image_generation_request(model, {'aspect_ratio': data['image_aspect_ratio'], 'image_size': data['image_size']}, scene='generic')
                except ValueError as exc:
                    raise serializers.ValidationError(str(exc)) from exc
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
