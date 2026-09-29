from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .item_catalog import item_catalog
from .item_catalog_icons import set_catalog_item_icon, set_catalog_inventory_icon


class ItemCatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_result(item_catalog(get_current_user_identifier(request)))


class ItemCatalogIconView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, sku):
        if 'asset_id' not in request.data:
            return valid_result('请提供 assetId，清除时传 null', status=400)
        asset_id = request.data['asset_id']
        if asset_id is not None and (not isinstance(asset_id, str) or not asset_id or len(asset_id) > 32):
            return valid_result('图片资源 ID 无效', status=400)
        try:
            saved_id = set_catalog_item_icon(get_current_user_identifier(request), sku, asset_id)
            return success_result({'sku': sku, 'icon_asset_id': saved_id})
        except LookupError as exc:
            return valid_result(str(exc), status=404)
        except ValueError as exc:
            return valid_result(str(exc), status=400)


class ItemCatalogInventoryIconView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, item_id):
        if 'asset_id' not in request.data:
            return valid_result('请提供 assetId，清除时传 null', status=400)
        asset_id = request.data['asset_id']
        if asset_id is not None and (not isinstance(asset_id, str) or not asset_id or len(asset_id) > 32):
            return valid_result('图片资源 ID 无效', status=400)
        try:
            count = set_catalog_inventory_icon(get_current_user_identifier(request), item_id, asset_id)
            return success_result({'icon_asset_id': asset_id, 'updated_count': count})
        except LookupError as exc:
            return valid_result(str(exc), status=404)
        except ValueError as exc:
            return valid_result(str(exc), status=400)
