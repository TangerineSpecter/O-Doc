"""物品图标管理接口；处理请求契约，压缩与关联规则在领域模块。"""
import logging
from pathlib import Path
from django.conf import settings
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Case, Count, IntegerField, Q, Value, When
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from assets.models import Asset
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from utils.resource_assets import delete_asset_record_and_file, is_asset_referenced
from .item_icons import bind_icon, normalize_item_name, upload_icon
from .item_catalog_icons import catalog_icon_usage_counts
from .travel_models import AgentInventoryItem
from .travel_views import InventorySerializer, inventory_context

logger = logging.getLogger(__name__)


def paginate(rows, request):
    try:
        number = max(1, int(request.query_params.get('page', 1)))
        size = min(60, max(1, int(request.query_params.get('page_size', request.query_params.get('pageSize', 20)))))
    except (TypeError, ValueError) as exc:
        raise ValueError('分页参数无效') from exc
    page = Paginator(rows, size).get_page(number)
    return page, {'total': page.paginator.count, 'page': page.number, 'page_size': size}


def icon_data(asset, usage=0, recommended=False):
    return {'id': asset.pk, 'name': asset.name, 'url': f'/api/resource/view/{asset.pk}',
        'size': asset.file_size, 'width': asset.metadata.get('width', 256),
        'height': asset.metadata.get('height', 256), 'usage_count': usage,
        'recommended': recommended, 'file_exists': (Path(settings.MEDIA_ROOT) / asset.file_path).is_file()}


def owned_icons(owner):
    return Asset.objects.filter(uploader=owner, is_valid=True, source_type='item_icon', file_type='image')


class ItemIconListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = get_current_user_identifier(request)
        rows = owned_icons(owner).order_by('-upload_time', 'id')
        search = normalize_item_name(request.query_params.get('search', ''))
        if search:
            rows = rows.filter(Q(name__icontains=search) | Q(metadata__confirmed_names__icontains=search))
        item_id = request.query_params.get('item_id') or request.query_params.get('itemId')
        normalized = ''
        if item_id:
            item = AgentInventoryItem.objects.filter(pk=item_id, owner_id=owner).first()
            if not item:
                return valid_result('物品不存在', status=404)
            normalized = normalize_item_name(item.name)
            rows = list(rows)
            rows.sort(key=lambda row: normalized not in [normalize_item_name(row.name), *row.metadata.get('confirmed_names', [])])
        try:
            page, data = paginate(rows, request)
        except ValueError as exc:
            return valid_result(str(exc), status=400)
        ids = [asset.pk for asset in page]
        uses = dict(AgentInventoryItem.objects.filter(icon_asset_id__in=ids).values('icon_asset_id')
                    .annotate(count=Count('id')).values_list('icon_asset_id', 'count'))
        for asset_id, count in catalog_icon_usage_counts(ids).items():
            uses[asset_id] = uses.get(asset_id, 0) + count
        data['list'] = [icon_data(asset, uses.get(asset.pk, 0), bool(normalized and normalized in
            [normalize_item_name(asset.name), *asset.metadata.get('confirmed_names', [])])) for asset in page]
        return success_result(data)

    def post(self, request):
        upload = request.FILES.get('file')
        if not upload:
            return valid_result('请选择图片文件', status=400)
        name = str(request.data.get('name') or Path(upload.name).stem).strip()
        if not name or len(name) > 200:
            return valid_result('图标名称需要 1–200 个字符', status=400)
        try:
            asset, duplicate = upload_icon(upload, get_current_user_identifier(request), name)
            usage = (AgentInventoryItem.objects.filter(icon_asset_id=asset.pk).count()
                     + catalog_icon_usage_counts([asset.pk]).get(asset.pk, 0))
            return success_result({**icon_data(asset, usage), 'duplicate': duplicate})
        except ValueError as exc:
            return valid_result(str(exc), status=400)
        except Exception:
            logger.exception('物品图标保存失败')
            return valid_result('图片保存失败，请重试；原有关联未更改', status=500)


class ItemIconDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, asset_id):
        name = request.data.get('name')
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 200:
            return valid_result('图标名称需要 1–200 个字符', status=400)
        with transaction.atomic():
            asset = owned_icons(get_current_user_identifier(request)).select_for_update().filter(pk=asset_id).first()
            if not asset:
                return valid_result('图标不存在', status=404)
            asset.name = name.strip()
            asset.save(update_fields=['name', 'update_time'])
        usage = (AgentInventoryItem.objects.filter(icon_asset_id=asset.pk).count()
                 + catalog_icon_usage_counts([asset.pk]).get(asset.pk, 0))
        return success_result(icon_data(asset, usage))

    def delete(self, request, asset_id):
        with transaction.atomic():
            asset = owned_icons(get_current_user_identifier(request)).select_for_update().filter(pk=asset_id).first()
            if not asset:
                return valid_result('图标不存在', status=404)
            if is_asset_referenced(asset):
                return valid_result('图标正在被物品使用，请先解除关联', status=409)
            delete_asset_record_and_file(asset)
            return success_result()


class InventoryManageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = get_current_user_identifier(request)
        rows = AgentInventoryItem.objects.filter(owner_id=owner)
        actor_id = request.query_params.get('agent_id') or request.query_params.get('agentId')
        if actor_id:
            rows = rows.filter(actor_id=actor_id)
        search = request.query_params.get('search', '').strip()
        if search:
            rows = rows.filter(name__icontains=search)
        empty = Q(icon_asset_id__isnull=True) | Q(icon_asset_id='')
        picture = request.query_params.get('picture', 'all')
        if picture == 'missing':
            rows = rows.filter(empty)
        elif picture == 'set':
            rows = rows.exclude(empty)
        elif picture != 'all':
            return valid_result('图片筛选条件无效', status=400)
        rows = rows.annotate(icon_order=Case(When(empty, then=Value(0)), default=Value(1), output_field=IntegerField()))
        rows = rows.order_by('icon_order', '-created_at', 'id')
        try:
            page, data = paginate(rows, request)
        except ValueError as exc:
            return valid_result(str(exc), status=400)
        items = list(page)
        data['list'] = InventorySerializer(items, many=True, context=inventory_context(items, owner)).data
        actors = AgentInventoryItem.objects.filter(owner_id=owner).values('actor_id', 'actor_name').distinct()
        from system_settings.models import Agent
        names = dict(Agent.objects.filter(pk__in={row['actor_id'] for row in actors}).values_list('pk', 'name'))
        unique = {row['actor_id']: names.get(row['actor_id']) or row['actor_name'] or '历史角色' for row in actors}
        data['agents'] = [{'id': key, 'name': value} for key, value in unique.items()]
        return success_result(data)


class InventoryIconView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, item_id):
        if 'asset_id' not in request.data:
            return valid_result('请提供 assetId，清除时传 null', status=400)
        asset_id = request.data['asset_id']
        if asset_id is not None and (not isinstance(asset_id, str) or not asset_id or len(asset_id) > 32):
            return valid_result('图片资源 ID 无效', status=400)
        try:
            item = bind_icon(item_id, get_current_user_identifier(request), asset_id)
            return success_result(InventorySerializer(item, context=inventory_context([item], item.owner_id)).data)
        except LookupError as exc:
            return valid_result(str(exc), status=404)
        except ValueError as exc:
            return valid_result(str(exc), status=400)
