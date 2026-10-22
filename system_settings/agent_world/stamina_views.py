"""世界管理中的体力恢复设置接口。"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.response_utils import success_result, valid_result
from .farm_gate import guarded
from .stamina_settings import public_settings, save_rate


class StaminaSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_result(public_settings())

    @guarded
    def post(self, request):
        try:
            return success_result(save_rate(request.data.get('recovery_per_hour')))
        except ValueError as exc:
            return valid_result(str(exc), status=400)
