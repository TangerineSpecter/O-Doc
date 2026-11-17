import uuid
from pathlib import Path

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from anthology.models import Anthology
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .models import VideoNoteJob
from .sources import share_url
from .storage import MAX_BYTES, VideoError, job_directory, runtime_root, store_upload


def owned_collection(owner, coll_id):
    return get_object_or_404(Anthology, coll_id=coll_id, user_id=owner, type='article', is_valid=True)


def project(job):
    return {key: getattr(job, key) for key in ('id', 'state', 'stage', 'title', 'message', 'source_url',
                                              'article_id', 'created_at')}


class JobsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = get_current_user_identifier(request)
        coll = owned_collection(owner, request.query_params.get('coll_id'))
        jobs = VideoNoteJob.objects.filter(owner=owner, coll_id=coll.pk).order_by('-created_at')[:50]
        return success_result([project(job) for job in jobs])

    def post(self, request):
        owner = get_current_user_identifier(request)
        coll = owned_collection(owner, request.data.get('coll_id'))
        try:
            url = share_url(request.data.get('share_text', ''))
            request_id = uuid.UUID(str(request.data.get('request_id')))
        except (VideoError, ValueError) as exc:
            return valid_result(str(exc) if isinstance(exc, VideoError) else '请求标识无效', status=400)
        with transaction.atomic():
            Anthology.objects.select_for_update().get(pk=coll.pk)
            job, _ = VideoNoteJob.objects.get_or_create(owner=owner, request_id=request_id,
                                                       defaults={'source_url': url, 'coll_id': coll.pk})
            if job.coll_id != coll.pk or job.source_url != url:
                return valid_result('请求标识已用于其他视频', status=409)
        return success_result(project(job))


class JobActionView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, job_id, action):
        owner = get_current_user_identifier(request)
        job = get_object_or_404(VideoNoteJob.objects.select_for_update(), pk=job_id, owner=owner)
        owned_collection(owner, job.coll_id)
        if job.state not in {'failed', 'awaiting_upload'}:
            return valid_result('当前任务不能执行此操作', status=409)
        if action == 'upload':
            if int(request.META.get('CONTENT_LENGTH') or 0) > MAX_BYTES + 1024**2:
                return valid_result('视频文件超过 512 MiB', status=413)
            file = request.FILES.get('file')
            if not file or not 0 < file.size <= MAX_BYTES:
                return valid_result('请选择 512 MiB 以内的视频文件', status=400)
            try:
                directory = job_directory(runtime_root(), job.pk, create=True)
                store_upload(directory, file)
            except VideoError as exc:
                return valid_result(str(exc), status=409)
            if not job.title:
                job.title = Path(file.name).stem[:240] or '视频笔记'
        job.state, job.stage, job.message = 'queued', '等待处理', ''
        job.save()
        return success_result(project(job))
