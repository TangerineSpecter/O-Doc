from django.db import transaction
from quant.locking import collection_lock
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import MethodNotAllowed
from utils.response_utils import success_result
from quant.models import FactorIndexJob
from quant.views import QuantView
from .indexing import index_status, job_data, queue_index
from .presentation import graph_data


class GraphView(QuantView):
    def get(self, request, coll_id):
        focus = request.query_params.get('candidate_id', '')
        if len(focus) > 40:
            raise serializers.ValidationError('候选标识无效')
        return success_result(graph_data(self.collection, focus))


class IndexView(QuantView):
    def get(self, request, coll_id, job_id=None):
        if job_id:
            raise MethodNotAllowed('GET')
        return success_result(index_status(self.collection))

    def post(self, request, coll_id, job_id=None):
        if job_id:
            with collection_lock(self.collection.pk), transaction.atomic():
                job = get_object_or_404(FactorIndexJob, pk=job_id, anthology=self.collection)
                if job.status in ('pending', 'running'):
                    job.status, job.lease_until, job.error = 'cancelled', None, '用户停止了本机索引任务'
                    job.save(update_fields=['status', 'lease_until', 'error', 'updated_at'])
            return success_result(job_data(job))
        job = queue_index(self.collection)
        return success_result({'job': job_data(job) if job else None, 'index': index_status(self.collection)})
