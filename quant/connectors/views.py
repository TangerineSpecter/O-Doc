import json
from django.shortcuts import get_object_or_404
from django.db import transaction
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from quant.views import QuantView
from quant.access import owned_collection
from quant.locking import collection_lock
from quant.models import ExternalConnector, ConnectorSecret, ExternalResponse
from quant.research.contracts import digest
from utils.response_utils import success_result
from .services import config, present, preview, execute


class ConnectorInput(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    config_json = serializers.CharField(max_length=100000)
    secrets_json = serializers.CharField(max_length=20000, required=False)


class Payload(serializers.Serializer):
    context_json = serializers.CharField(max_length=120000, default='{}')
    response_json = serializers.CharField(max_length=2200000, required=False)
    config_json = serializers.CharField(max_length=100000, required=False)


def decode(text):
    try: return json.loads(text)
    except (ValueError, TypeError) as exc: raise serializers.ValidationError('需要有效JSON') from exc


class ConnectorView(QuantView):
    def get(self, request, coll_id, connector_id=None, action=None):
        rows = ExternalConnector.objects.filter(anthology=self.collection)
        if action == 'responses':
            results = ExternalResponse.objects.filter(connector__anthology=self.collection)
            if connector_id: results = results.filter(connector_id=connector_id)
            return success_result({'items': [{'id': r.pk, 'connector_id': r.connector_id, 'data_json': json.dumps(r.data, ensure_ascii=False),
                'created_at': r.created_at.isoformat()} for r in results[:30]]})
        if connector_id: return success_result(present(get_object_or_404(rows, pk=connector_id)))
        return success_result({'items': [present(r) for r in rows]})

    def post(self, request, coll_id, connector_id=None, action=None):
        if action == 'preview':
            form = Payload(data=request.data); form.is_valid(raise_exception=True)
            values = form.validated_data
            cfg = decode(values['config_json']) if 'config_json' in values else get_object_or_404(ExternalConnector, pk=connector_id, anthology=self.collection).config
            if 'response_json' not in values: raise serializers.ValidationError('请提供响应JSON样例')
            return success_result(preview(cfg, decode(values['response_json']), decode(values['context_json'])))
        form = ConnectorInput(data=request.data); form.is_valid(raise_exception=True)
        values = form.validated_data; cfg = config(decode(values['config_json']))
        row = get_object_or_404(ExternalConnector, pk=connector_id, anthology=self.collection) if connector_id else ExternalConnector(anthology=self.collection)
        row.name, row.config, row.content_hash = values['name'], cfg, digest(cfg)
        row.save()
        if 'secrets_json' in values:
            secrets = decode(values['secrets_json'])
            if not isinstance(secrets, dict) or any(not isinstance(v, str) for v in secrets.values()): raise serializers.ValidationError('本机密钥须为名称与字符串值的JSON对象')
            ConnectorSecret.objects.update_or_create(connector=row, defaults={'values': secrets})
        return success_result(present(row))


class ConnectorExecuteView(QuantView):
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        # HTTP waits outside a database transaction; ownership is checked again before publication.
        APIView.initial(self, request, *args, **kwargs)
        self.collection = owned_collection(request, kwargs['coll_id'])

    def post(self, request, coll_id, connector_id):
        collection = owned_collection(request, coll_id)
        row = get_object_or_404(ExternalConnector, pk=connector_id, anthology=collection)
        form = Payload(data=request.data); form.is_valid(raise_exception=True)
        data = execute(row, decode(form.validated_data['context_json']))
        with collection_lock(coll_id), transaction.atomic():
            owned_collection(request, coll_id)
            current = get_object_or_404(ExternalConnector, pk=connector_id, anthology=collection)
            if current.content_hash != row.content_hash: raise serializers.ValidationError('请求期间连接配置已改变，请重新确认后执行')
            result = ExternalResponse.objects.create(connector=current, data=data, content_hash=digest(data))
        return success_result({'id': result.pk, 'connector_id': row.pk, 'data_json': json.dumps(data, ensure_ascii=False), 'created_at': result.created_at.isoformat()})
