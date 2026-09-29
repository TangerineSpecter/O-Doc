from django.db import transaction
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .farm_gate import farm_gate
from .market_shop import shop_payload, config_for
from .market_queries import listings, history, sessions
from .market_sessions import cleanup


class MarketShopView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_result(shop_payload(get_current_user_identifier(request)))


class MarketConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = config_for(get_current_user_identifier(request))
        return success_result({'slot_count':config.slot_count})

    def patch(self, request):
        count = request.data.get('slot_count')
        if type(count) is not int or not 1 <= count <= 1000:
            return valid_result('商品位数量须为1至1000的整数', status=400)
        with farm_gate(), transaction.atomic():
            config = config_for(get_current_user_identifier(request))
            config.slot_count = count; config.save(update_fields=['slot_count','updated_at'])
        return success_result({'slot_count':count})


class MarketListView(APIView):
    permission_classes = [IsAuthenticated]
    kind = 'listings'

    def get(self, request):
        owner = get_current_user_identifier(request)
        with farm_gate():
            cleanup()
            try:
                result = {'listings':listings,'transactions':history,'sessions':sessions}[self.kind](owner, request.query_params)
            except ValueError as exc:
                return valid_result(str(exc), status=400)
        return success_result(result)
