from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .config import public_config, save_key
from .jev import connection_test, DecisionUnavailable


class DecisionConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_result(public_config(get_current_user_identifier(request)))

    def patch(self, request):
        if set(request.data) != {'api_key'}:
            return valid_result(msg='请提供密钥，或使用 null 清除密钥', status=400)
        secret = request.data['api_key']
        if secret is not None and (not isinstance(secret, str) or not secret.strip() or len(secret) > 255):
            return valid_result(msg='密钥无效', status=400)
        owner = get_current_user_identifier(request)
        save_key(owner, secret.strip() if secret else None)
        return success_result(public_config(owner))


class DecisionTestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            return success_result(connection_test(get_current_user_identifier(request)))
        except DecisionUnavailable as exc:
            return valid_result(msg=str(exc), status=502)
