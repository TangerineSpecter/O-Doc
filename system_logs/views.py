import io
import json
import zipfile
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from rest_framework.exceptions import NotFound
from utils.response_utils import success_result
from . import store
from .capture import capture
from .parsers import DiagnosticReportParser
from .serializers import QuerySerializer, SelectionSerializer, PolicySerializer, ReportSerializer


class Administrator(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class ReportThrottle(UserRateThrottle):
    rate = '30/min'
    scope = 'system_logs_report'


class AdminView(APIView):
    permission_classes = [Administrator]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        return response


class LogsView(AdminView):
    def get(self, request):
        serializer = QuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        return success_result(store.list_events(serializer.validated_data))


class OverviewView(AdminView):
    def get(self, request):
        return success_result(store.overview())


class DetailView(AdminView):
    def get(self, request, event_id):
        event = store.detail(event_id)
        if event is None:
            raise NotFound()
        return success_result(event)


class DeleteView(AdminView):
    def post(self, request):
        serializer = SelectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        store.delete(serializer.validated_data['ids'])
        return success_result(store.overview())


class ClearView(AdminView):
    def post(self, request):
        store.delete()
        return success_result(store.overview())


class PolicyView(AdminView):
    def put(self, request):
        serializer = PolicySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        store.set_policy(**serializer.validated_data)
        return success_result(store.overview())


def render_event(event):
    return json.dumps(event, ensure_ascii=False, indent=2).encode('utf-8')


class DownloadView(AdminView):
    def post(self, request):
        serializer = SelectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data['ids']
        events = [store.detail(event_id) for event_id in ids]
        if not events or any(event is None for event in events):
            raise NotFound('日志不存在或已被清理')
        if len(events) == 1:
            response = HttpResponse(render_event(events[0]), content_type='text/plain; charset=utf-8')
            filename = f'exception-{ids[0]}.txt'
        else:
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
                for event in events:
                    archive.writestr(f"exception-{event['id']}.txt", render_event(event))
            response = HttpResponse(buffer.getvalue(), content_type='application/zip')
            filename = 'exceptions.zip'
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Cache-Control'] = 'no-store'
        return response


class ReportView(APIView):
    parser_classes = [DiagnosticReportParser]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ReportThrottle]

    def post(self, request):
        serializer = ReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        event_id = data.pop('event_id')
        request_id = data.pop('request_id', '')
        capture('浏览器操作异常', **data, request_id=request_id,
                fault_key=f'{request_id}:0' if request_id else f'frontend:{request.user.pk}:{event_id}',
                user_id=request.user.pk, source='frontend')
        return success_result()
