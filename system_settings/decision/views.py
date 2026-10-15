"""Decision connection settings APIs; secrets are never returned."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .config import public_config, save_key, save_connection, delete_connection
from .jev import connection_test, DecisionUnavailable


def _owner(request):
    return get_current_user_identifier(request)


class DecisionConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_result(public_config(_owner(request)))

    def patch(self, request):
        if set(request.data) != {'api_key'}:
            return valid_result(msg='请提供 JEV 密钥，或使用 null 清除密钥', status=400)
        secret = request.data['api_key']
        if secret is not None and (not isinstance(secret, str) or not secret.strip() or len(secret) > 255):
            return valid_result(msg='密钥无效', status=400)
        owner = _owner(request)
        save_key(owner, secret.strip() if secret else None)
        return success_result(public_config(owner))


class DecisionConnectionCollectionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        allowed = {'name', 'protocol', 'base_url', 'model_id', 'api_key'}
        if set(request.data) - allowed or not {'name', 'protocol', 'base_url', 'model_id'}.issubset(request.data):
            return valid_result(msg='请提供连接名称、协议、服务地址和模型 ID', status=400)
        secret = request.data.get('api_key')
        if secret is not None and (not isinstance(secret, str) or len(secret) > 255):
            return valid_result(msg='API Key 无效', status=400)
        profile = {key: request.data[key] for key in ('name', 'protocol', 'base_url', 'model_id')}
        try:
            result = save_connection(_owner(request), profile, secret=secret,
                                     update_secret='api_key' in request.data)
            return success_result(result)
        except ValueError as exc:
            return valid_result(msg=str(exc), status=400)


class DecisionConnectionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, connection_id):
        allowed = {'name', 'protocol', 'base_url', 'model_id', 'api_key'}
        if not request.data or set(request.data) - allowed:
            return valid_result(msg='决策连接修改字段无效', status=400)
        secret = request.data.get('api_key')
        if secret is not None and (not isinstance(secret, str) or len(secret) > 255):
            return valid_result(msg='API Key 无效', status=400)
        profile = {key: value for key, value in request.data.items() if key in {'name', 'protocol', 'base_url', 'model_id'}}
        try:
            return success_result(save_connection(_owner(request), profile, connection_id=connection_id,
                                                  secret=secret, update_secret='api_key' in request.data))
        except ValueError as exc:
            return valid_result(msg=str(exc), status=400)

    def delete(self, request, connection_id):
        try:
            return success_result(delete_connection(_owner(request), connection_id))
        except ValueError as exc:
            return valid_result(msg=str(exc), status=400)


class DecisionTestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, connection_id='jev'):
        try:
            return success_result(connection_test(_owner(request), connection_id))
        except DecisionUnavailable as exc:
            return valid_result(msg=str(exc), status=502)
