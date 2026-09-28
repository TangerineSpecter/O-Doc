from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result
from .item_catalog import item_catalog


class ItemCatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_result(item_catalog(get_current_user_identifier(request)))
