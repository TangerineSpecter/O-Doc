"""Authenticated equipment-portrait generation and explicit application endpoints."""
import math

from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework import serializers

from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .agent_world.farm_gate import guarded
from .loadout_portrait import SCENE, build_portrait_request


class PortraitApplicationInput(serializers.Serializer):
    task_id = serializers.CharField(max_length=32, required=False)
    asset_id = serializers.CharField(max_length=32, required=False)
    scale = serializers.FloatField(min_value=0.6, max_value=1.5, required=False)
    offset_x = serializers.FloatField(min_value=-20, max_value=20, required=False)
    offset_y = serializers.FloatField(min_value=-20, max_value=20, required=False)

    def validate_scale(self, value):
        if not math.isfinite(value):
            raise serializers.ValidationError('显示比例须为有限数字')
        return value

    def validate_offset_x(self, value):
        if not math.isfinite(value):
            raise serializers.ValidationError('水平偏移须为有限数字')
        return value

    def validate_offset_y(self, value):
        if not math.isfinite(value):
            raise serializers.ValidationError('垂直偏移须为有限数字')
        return value

    def validate(self, values):
        if not values:
            raise serializers.ValidationError('请提供立绘任务 ID 或显示设置')
        if 'task_id' in values and 'asset_id' in values:
            raise serializers.ValidationError('请只选择一种立绘来源')
        if isinstance(self.initial_data.get('scale'), bool):
            raise serializers.ValidationError('显示比例须为数字')
        for field, label in (('offset_x', '水平偏移'), ('offset_y', '垂直偏移')):
            if isinstance(self.initial_data.get(field), bool):
                raise serializers.ValidationError(f'{label}须为数字')
        return values


class LoadoutPortraitActions:
    @action(detail=True, methods=['get', 'put', 'delete'], url_path='loadout-portrait', permission_classes=[IsAuthenticated])
    @guarded
    def loadout_portrait(self, request, pk=None):
        from assets.models import Asset
        from prompts.models import ImageGenerationTask
        from utils.resource_assets import extract_resource_id_from_view_url, get_resource_view_url
        agent = self.get_object()
        owner = get_current_user_identifier(request)
        current_id = extract_resource_id_from_view_url(agent.loadout_portrait)
        if current_id and Asset.objects.filter(pk=current_id).exclude(uploader=owner).exists():
            return valid_result('无权访问其他账号的立绘', status=403)
        if request.method == 'PUT':
            payload = PortraitApplicationInput(data=request.data)
            if not payload.is_valid():
                return valid_result('立绘保存参数无效', data=payload.errors, status=400)
            data = payload.validated_data
            if 'task_id' in data:
                task = ImageGenerationTask.objects.filter(
                    pk=data['task_id'], user_id=owner, agent_key=str(agent.pk),
                    request_data__scene=SCENE, status='succeeded',
                ).first()
                if not task or not Asset.objects.filter(pk=task.asset_id, uploader=owner, is_valid=True, file_type='image').exists():
                    return valid_result('请选择当前 Agent 已完成的立绘结果', status=400)
                agent.loadout_portrait = get_resource_view_url(task.asset_id)
            elif 'asset_id' in data:
                asset = Asset.objects.filter(
                    pk=data['asset_id'], uploader=owner, is_valid=True, file_type='image',
                ).first()
                if not asset:
                    return valid_result('请选择当前账号已上传的有效图片', status=400)
                agent.loadout_portrait = get_resource_view_url(asset.pk)
            elif not current_id or not Asset.objects.filter(pk=current_id, uploader=owner, is_valid=True, file_type='image').exists():
                return valid_result('请先应用一张立绘，再调整显示设置', status=400)
            if 'scale' in data:
                agent.loadout_portrait_scale = data['scale']
            if 'offset_x' in data:
                agent.loadout_portrait_offset_x = data['offset_x']
            if 'offset_y' in data:
                agent.loadout_portrait_offset_y = data['offset_y']
            agent.save(update_fields=[
                'loadout_portrait', 'loadout_portrait_scale',
                'loadout_portrait_offset_x', 'loadout_portrait_offset_y', 'updated_at',
            ])
        elif request.method == 'DELETE':
            agent.loadout_portrait = ''
            agent.loadout_portrait_scale = 1.0
            agent.loadout_portrait_offset_x = 0.0
            agent.loadout_portrait_offset_y = 0.0
            agent.save(update_fields=[
                'loadout_portrait', 'loadout_portrait_scale',
                'loadout_portrait_offset_x', 'loadout_portrait_offset_y', 'updated_at',
            ])
        asset_id = extract_resource_id_from_view_url(agent.loadout_portrait)
        if asset_id and not Asset.objects.filter(pk=asset_id, uploader=owner, is_valid=True).exists():
            return success_result({'image_url': '', 'asset_id': '', 'scale': 1.0, 'offset_x': 0.0, 'offset_y': 0.0})
        return success_result({
            'image_url': agent.loadout_portrait, 'asset_id': asset_id or '',
            'scale': agent.loadout_portrait_scale,
            'offset_x': agent.loadout_portrait_offset_x,
            'offset_y': agent.loadout_portrait_offset_y,
        })

    @action(detail=True, methods=['get'], url_path='loadout-portrait-options', permission_classes=[IsAuthenticated])
    def loadout_portrait_options(self, request, pk=None):
        from system_mcp.image_generation import image_generation_options, supports_references
        from .models import AIModel
        agent = self.get_object()
        result = image_generation_options(agent, request.query_params.get('model_id') or request.query_params.get('modelId'), SCENE, get_current_user_identifier(request))
        result['models'] = [{'value': str(model.pk), 'label': model.display_name or model.name}
                            for model in AIModel.objects.select_related('provider').filter(type='image_generation')
                            if supports_references(model)]
        return success_result(result)

    @action(detail=True, methods=['get', 'post', 'delete'], url_path='loadout-portrait-generation', permission_classes=[IsAuthenticated])
    def loadout_portrait_generation(self, request, pk=None):
        from prompts.models import ImageGenerationTask
        from system_mcp.image_generation import image_generation_options
        from system_mcp.image_generation_tasks import _output, generate_image, get_image_generation_result, ACTIVE
        from system_mcp.image_task_lifecycle import expire_battle_head_tasks, cancel_battle_head_task
        from .agent_availability import require_active_agent
        from rest_framework.exceptions import ValidationError
        agent = self.get_object()
        owner = get_current_user_identifier(request)
        require_active_agent(agent)
        scope = {'user_id': owner, 'agent_key': str(agent.pk), 'request_data__scene': SCENE}
        expire_battle_head_tasks(owner, str(agent.pk), SCENE)
        task_id = request.query_params.get('task_id') or request.query_params.get('taskId')
        try:
            if request.method == 'DELETE':
                return success_result(_output(cancel_battle_head_task(task_id or '', owner, str(agent.pk), SCENE)))
            if request.method == 'GET':
                if task_id:
                    if not ImageGenerationTask.objects.filter(pk=task_id, **scope).exists():
                        return valid_result('立绘任务不存在或无权访问', status=404)
                    return success_result(get_image_generation_result({'task_id': task_id}, agent, user_id=owner))
                return success_result([_output(task) for task in ImageGenerationTask.objects.filter(**scope).exclude(status='discarded').order_by('-created_at')[:10]])
            active = ImageGenerationTask.objects.filter(**scope, status__in=ACTIVE).order_by('-created_at').first()
            if active:
                return success_result(_output(active))
            if not isinstance(request.data, dict):
                return valid_result('生图参数格式无效', status=400)
            data = dict(request.data)
            if data.get('model_id') is not None and not isinstance(data['model_id'], str):
                return valid_result('生图模型 ID 无效', status=400)
            options = image_generation_options(agent, data.get('model_id'), SCENE, owner)
            if not options.get('configured'):
                return valid_result(options.get('message') or '请先配置生图模型', status=400)
            data = build_portrait_request(agent, data, options, owner_id=owner)
            return success_result(generate_image(data, agent, user_id=owner, scene=SCENE))
        except (ValueError, ValidationError) as exc:
            return valid_result(str(exc), status=400)
