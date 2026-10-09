from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from system_settings.models import Agent
from .execution import execution_lease
from .travel_models import TravelJourney, TravelNode, TravelRuntime, AgentInventoryItem
from .travel_publication import insert_photo
from assets.models import Asset


class JourneySerializer(serializers.ModelSerializer):
    class Meta:
        model = TravelJourney
        fields = ['id', 'actor_id', 'status', 'phase', 'snapshot', 'destination_id', 'departed_at', 'arrived_at', 'returned_at', 'article_id', 'created_at']


class InventorySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    icon_url = serializers.SerializerMethodField()
    icon_asset_id = serializers.SerializerMethodField()

    def get_icon_asset_id(self, item):
        if (item.source or {}).get('sku', '').startswith('dish.'):
            return self.context.get('dish_icons', {}).get(item.source['sku'])
        return item.icon_asset_id

    def get_icon_url(self, item):
        asset_id = self.get_icon_asset_id(item)
        valid = self.context.get('icon_assets')
        if valid is None:
            valid = set(Asset.objects.filter(pk=asset_id, uploader=item.owner_id,
                source_type='item_icon', file_type='image', is_valid=True).values_list('pk', flat=True))
        return f'/api/resource/view/{asset_id}' if asset_id in valid else ''

    def get_actor_name(self, item):
        return self.context.get('actor_names', {}).get(item.actor_id, item.actor_name)

    class Meta:
        model = AgentInventoryItem
        fields = ['id', 'actor_id', 'actor_name', 'origin_actor_id', 'origin_actor_name', 'rarity', 'value', 'name', 'kind', 'quantity', 'source', 'created_at', 'icon_asset_id', 'icon_url']


def inventory_context(items, owner):
    from .cooking_models import CookingCatalog
    catalog = CookingCatalog.objects.filter(pk=owner).first()
    dish_icons = catalog.item_icons if catalog else {}
    return {
        'dish_icons': dish_icons,
        'actor_names': dict(Agent.objects.filter(pk__in={item.actor_id for item in items}).values_list('pk', 'name')),
        'icon_assets': set(Asset.objects.filter(pk__in=({item.icon_asset_id for item in items if item.icon_asset_id} | set(dish_icons.values())),
            uploader=owner, source_type='item_icon', file_type='image', is_valid=True).values_list('pk', flat=True)),
    }


class TravelListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = TravelJourney.objects.filter(owner_id=get_current_user_identifier(request))
        actor = request.GET.get('agent_id') or request.GET.get('agentId')
        if actor:
            rows = rows.filter(actor_id=actor)
        return success_result(JourneySerializer(rows[:100], many=True).data)


class InventoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = AgentInventoryItem.objects.filter(owner_id=get_current_user_identifier(request)).order_by('-created_at')
        actor = request.GET.get('agent_id') or request.GET.get('agentId')
        if actor:
            rows = rows.filter(actor_id=actor)
        items = list(rows[:200])
        return success_result(InventorySerializer(items, many=True,
            context=inventory_context(items, get_current_user_identifier(request))).data)


class TravelDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, journey_id):
        row = get_object_or_404(TravelJourney, pk=journey_id, owner_id=get_current_user_identifier(request))
        data = JourneySerializer(row).data
        data['nodes'] = list(row.nodes.order_by('updated_at').values('id', 'kind', 'status', 'input', 'result', 'error'))
        return success_result(data)

    def post(self, request, journey_id):
        row = get_object_or_404(TravelJourney, pk=journey_id, owner_id=get_current_user_identifier(request))
        operation = request.data.get('action')
        if operation not in ['pause', 'resume', 'end', 'query_image', 'regenerate_image', 'use_image', 'abandon_image']:
            return valid_result('操作无效', status=400)
        # 人工操作与后台节点使用同一锁，不能在扣费或发布中途改状态。
        with execution_lease(TravelRuntime, {'pk': row.pk}) as token:
            if not token:
                return valid_result('当前节点执行中，请稍后操作', status=409)
            row.refresh_from_db()
            runtime = TravelRuntime.objects.get(pk=row.pk)
            try:
                if operation in ['pause', 'resume', 'end']:
                    if row.status in ['completed', 'skipped']:
                        raise ValueError('旅行已经结束')
                    if operation == 'pause':
                        row.status = 'paused'
                    elif operation == 'resume':
                        row.status = 'active'
                        runtime.authorized, runtime.attempts, runtime.next_at = True, 0, timezone.now()
                    else:
                        if row.departed_at:
                            row.returned_at = timezone.now()
                            row.snapshot = {**row.snapshot, 'ended_early': True}
                            row.phase, row.status = 'journal', 'active'
                            runtime.authorized, runtime.attempts, runtime.next_at = True, 0, timezone.now()
                        else:
                            row.status, row.phase = 'skipped', 'done'
                    row.save()
                    from .travel_activity import update_activity
                    update_activity(row)
                else:
                    if not row.article_id:
                        raise ValueError('日记尚未发布')
                    photo = dict(row.snapshot.get('photo', {}))
                    if photo.get('status') == 'inserted' and operation != 'regenerate_image':
                        raise ValueError('图片已插入，无需再次处理')
                    if operation == 'abandon_image':
                        photo['status'] = 'abandoned'
                    elif operation == 'use_image':
                        from assets.models import Asset
                        from utils.resource_assets import get_resource_view_url
                        asset = get_object_or_404(Asset, pk=request.data.get('asset_id'), is_valid=True, uploader=row.owner_id)
                        if not str(asset.mime_type or '').startswith('image/'):
                            raise ValueError('请选择可访问的图片资源')
                        insert_photo(row, get_resource_view_url(asset.pk))
                        photo = row.snapshot['photo']
                    elif operation == 'regenerate_image':
                        if request.data.get('confirm_charge') is not True:
                            raise ValueError('重新生成可能再次计费，需明确确认')
                        if photo.get('status') not in ['manual', 'abandoned', 'inserted']:
                            raise ValueError('图片仍在处理中，请查询原任务')
                        # 人工重新生成是一项新意图；仅刷新生图参数，旅行经历等仍使用原快照。
                        if row.task_id:
                            from system_settings.models import AgentTask
                            current = AgentTask.objects.get(pk=row.task_id).travel_config or {}
                            config = dict(row.snapshot.get('config', {}))
                            config.update({key: current.get(key, default) for key, default in (
                                ('image_model_id', ''), ('image_aspect_ratio', '16:9'), ('image_size', '1K'))})
                            row.snapshot = {**row.snapshot, 'config': config}
                        row.snapshot = {**row.snapshot, 'photo_history': [*row.snapshot.get('photo_history', []), photo]}
                        photo = {'status': 'pending', 'attempt': photo.get('attempt', 0)+1, 'insertion_position': 'end',
                            'previous_image_url': photo.get('image_url') if photo.get('status') == 'inserted' else photo.get('previous_image_url')}
                    else:
                        if not photo.get('task_id') and not photo.get('request'):
                            photo['status'] = 'pending'
                        else:
                            photo['status'] = 'generating'
                    row.snapshot = {**row.snapshot, 'photo': photo}
                    row.save(update_fields=['snapshot', 'updated_at'])
                    runtime.authorized = True
                    TravelRuntime.objects.update_or_create(pk=f'{row.pk}:photo', defaults={'authorized': True, 'photo_started_at': None, 'next_at': timezone.now()})
                runtime.save(update_fields=['authorized', 'attempts', 'next_at'])
            except ValueError as exc:
                return valid_result(str(exc), status=400)
        return success_result(JourneySerializer(row).data)
