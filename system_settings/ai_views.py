import requests
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action

from system_settings.models import Agent, AIModel, AIProvider, GeoLocation
from system_settings.serializers import AIModelSerializer, AIProviderSerializer, GeoLocationSerializer
from utils.response_utils import success_result, valid_result


class AIProviderViewSet(viewsets.ModelViewSet):
    """
    AI提供商及模型配置接口
    """
    queryset = AIProvider.objects.all().order_by('-created_at')
    serializer_class = AIProviderSerializer

    # 【关键点】必须重写 list 方法，否则 DRF 默认只返回一个数组，前端就会报错
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        # 用 success_result 包裹数组，返回 { code: 200, data: [...] }
        return success_result(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return success_result(serializer.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        with transaction.atomic():
            server_id = instance.id
            self.perform_destroy(instance)
            for agent in Agent.objects.all():
                if server_id not in (agent.mcp_servers or []):
                    continue
                agent.mcp_servers = [item for item in agent.mcp_servers if item != server_id]
                agent.save(update_fields=['mcp_servers', 'updated_at'])
        return success_result()


class AIModelViewSet(viewsets.ModelViewSet):
    queryset = AIModel.objects.all()
    serializer_class = AIModelSerializer

    @staticmethod
    def _ollama_base_url(base_url):
        normalized = base_url.rstrip('/')
        if normalized.endswith('/v1'):
            normalized = normalized[:-3].rstrip('/')
        return normalized

    @staticmethod
    def _model_test_payload(model):
        if model.type == 'embedding':
            return '/embeddings', {
                'model': model.name,
                'input': 'O-Doc embedding connectivity test',
            }
        if model.type == 'rerank':
            return '/rerank', {
                'model': model.name,
                'query': 'O-Doc connectivity test',
                'documents': ['Connectivity test document.'],
            }
        return '/chat/completions', {
            'model': model.name,
            'messages': [{'role': 'user', 'content': 'Reply with OK.'}],
            'temperature': 0,
            'max_tokens': 8,
        }

    def _test_ollama_connection(self, model, started_at):
        provider = model.provider
        api_url = f"{self._ollama_base_url(provider.base_url)}/api/tags"
        response = requests.get(api_url, timeout=8)
        elapsed_ms = int((timezone.now() - started_at).total_seconds() * 1000)

        if not (200 <= response.status_code < 300):
            return valid_result(
                msg='连通性检测失败',
                data={
                    'ok': False,
                    'model_id': model.id,
                    'model_name': model.name,
                    'model_type': model.type,
                    'provider_name': provider.name,
                    'status_code': response.status_code,
                    'elapsed_ms': elapsed_ms,
                    'detail': response.text[:1000],
                }
            )

        data = response.json()
        model_names = {
            item.get('name') or item.get('model')
            for item in data.get('models', [])
            if isinstance(item, dict)
        }
        if model.name not in model_names:
            return valid_result(
                msg='连通性检测失败',
                data={
                    'ok': False,
                    'model_id': model.id,
                    'model_name': model.name,
                    'model_type': model.type,
                    'provider_name': provider.name,
                    'status_code': response.status_code,
                    'elapsed_ms': elapsed_ms,
                    'detail': f"Ollama 服务可访问，但未找到模型 {model.name}",
                }
            )

        return success_result({
            'ok': True,
            'model_id': model.id,
            'model_name': model.name,
            'model_type': model.type,
            'provider_name': provider.name,
            'status_code': response.status_code,
            'elapsed_ms': elapsed_ms,
        })

    @action(detail=True, methods=['post'])
    def test_connection(self, request, pk=None):
        model = self.get_object()
        provider = model.provider
        if not provider.base_url:
            return valid_result(msg='连通性检测失败', data='服务商 Base URL 不能为空')

        started_at = timezone.now()
        if provider.type == 'Ollama':
            try:
                return self._test_ollama_connection(model, started_at)
            except requests.RequestException as e:
                elapsed_ms = int((timezone.now() - started_at).total_seconds() * 1000)
                return valid_result(
                    msg='连通性检测失败',
                    data={
                        'ok': False,
                        'model_id': model.id,
                        'model_name': model.name,
                        'model_type': model.type,
                        'provider_name': provider.name,
                        'elapsed_ms': elapsed_ms,
                        'detail': str(e),
                    }
                )

        endpoint, payload = self._model_test_payload(model)
        api_url = f"{provider.base_url.rstrip('/')}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if provider.api_key:
            headers['Authorization'] = f"Bearer {provider.api_key}"

        try:
            response = requests.post(api_url, json=payload, headers=headers, timeout=20)
            elapsed_ms = int((timezone.now() - started_at).total_seconds() * 1000)
            if 200 <= response.status_code < 300:
                return success_result({
                    'ok': True,
                    'model_id': model.id,
                    'model_name': model.name,
                    'model_type': model.type,
                    'provider_name': provider.name,
                    'status_code': response.status_code,
                    'elapsed_ms': elapsed_ms,
                })

            return valid_result(
                msg='连通性检测失败',
                data={
                    'ok': False,
                    'model_id': model.id,
                    'model_name': model.name,
                    'model_type': model.type,
                    'provider_name': provider.name,
                    'status_code': response.status_code,
                    'elapsed_ms': elapsed_ms,
                    'detail': response.text[:1000],
                }
            )
        except requests.RequestException as e:
            elapsed_ms = int((timezone.now() - started_at).total_seconds() * 1000)
            return valid_result(
                msg='连通性检测失败',
                data={
                    'ok': False,
                    'model_id': model.id,
                    'model_name': model.name,
                    'model_type': model.type,
                    'provider_name': provider.name,
                    'elapsed_ms': elapsed_ms,
                    'detail': str(e),
                }
            )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        with transaction.atomic():
            server_id = instance.id
            self.perform_destroy(instance)
            for agent in Agent.objects.all():
                if server_id not in (agent.mcp_servers or []):
                    continue
                agent.mcp_servers = [item for item in agent.mcp_servers if item != server_id]
                agent.save(update_fields=['mcp_servers', 'updated_at'])
        return success_result()


class GeoLocationViewSet(viewsets.ModelViewSet):
    """地理位置配置接口"""

    queryset = GeoLocation.objects.all()
    serializer_class = GeoLocationSerializer

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return success_result(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return success_result()


