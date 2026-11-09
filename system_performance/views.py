from django.http import HttpResponse
from datetime import timedelta
from rest_framework.exceptions import NotFound, ValidationError
from system_logs.views import AdminView
from utils.response_utils import success_result
from . import collector, queries
from .database import database_state
from .models import PerformanceSample, PerformanceInflight
from .reports import export_sample
from .serializers import QuerySerializer, PolicySerializer
from .storage import load_policy, save_policy


class PerformanceView(AdminView):
    action = 'overview'

    def get(self, request, sample_id=None):
        query = QuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        options = query.validated_data
        if self.action == 'overview':
            from django.utils import timezone
            now = timezone.now()
            running = [dict(**row.state, updated=row.updated.isoformat(),
                            elapsed_ms=max(0, (now.timestamp() - row.state['started']) * 1000), status='running')
                       for row in PerformanceInflight.objects.filter(updated__gte=now - timedelta(minutes=5)).order_by('-updated')[:100]]
            return success_result({**queries.overview(options['hours']), 'policy': load_policy(), 'health': collector.health(), 'inflight': running})
        if self.action == 'rankings':
            return success_result(queries.rankings(options['hours'], options['kind']))
        if self.action == 'samples':
            return success_result(queries.sample_list(**options))
        if self.action in {'detail', 'report'}:
            sample = PerformanceSample.objects.filter(pk=sample_id).first()
            if not sample:
                raise NotFound('样本不存在、未保存或已清理')
            if self.action == 'detail':
                return success_result({'event': sample.evidence, 'baseline': queries.baseline(sample.evidence)})
            try:
                content = export_sample(sample)
            except ValueError:
                raise ValidationError('诊断报告超过大小上限')
            response = HttpResponse(content, content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename="performance-{sample.id}.zip"'
            response['Cache-Control'] = 'no-store'
            return response
        if self.action == 'database':
            return success_result(database_state())
        return success_result(load_policy())

    def put(self, request):
        if self.action != 'policy':
            raise ValidationError('不支持该操作')
        serializer = PolicySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        load_policy()
        value = save_policy(serializer.validated_data)
        collector.configure(value)
        return success_result(value)

    def post(self, request):
        if self.action != 'clear':
            raise ValidationError('不支持该操作')
        load_policy()
        value = save_policy({}, clear=True)
        collector.configure(value)
        return success_result(value)
