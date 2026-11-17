import hashlib
import logging
import shutil
import tempfile
import time
import uuid
from contextlib import ExitStack
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from filelock import FileLock, Timeout

from anthology.models import Anthology
from article.models import Article
from assets.models import Asset
from utils.resource_assets import get_resource_view_url
from .models import VideoNoteJob
from .pipeline import generate
from .storage import UploadNeeded, VideoError, job_directory, remove_job_directory, runtime_root, validate_runtime_root
from .writing import render

logger = logging.getLogger(__name__)


def publish(job, result):
    title, source, overview, notes, segments, frames, warning = result
    with ExitStack() as cleanup:
        with transaction.atomic():
            current = VideoNoteJob.objects.select_for_update().get(pk=job.pk)
            if current.state != 'running':
                return
            coll = Anthology.objects.select_for_update().filter(pk=job.coll_id, type='article',
                                                               user_id=job.owner, is_valid=True).first()
            if not coll:
                raise VideoError('目标文集已删除或无法写入')
            name = title[:240]
            suffix = 1
            while Article.objects.filter(author=job.owner, coll_id=job.coll_id, title=name).exists():
                suffix += 1
                name = f'{title[:240]}（{suffix}）'
            ids = {idx: uuid.uuid4().hex[:16] for idx in frames}
            content = render(source, overview, notes, segments, {i: get_resource_view_url(v) for i, v in ids.items()})
            article = Article.objects.create(title=name, content=content, coll_id=job.coll_id, author=job.owner,
                                             source_url=job.source_url, creation_source='video_note')
            for idx, path in frames.items():
                asset_id = ids[idx]
                relative = Path('image') / f'{asset_id}.jpg'
                target = Path(settings.MEDIA_ROOT) / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as dest, path.open('rb') as src:
                    cleanup.callback(target.unlink, missing_ok=True)
                    shutil.copyfileobj(src, dest)
                Asset.objects.create(id=asset_id, name=target.name, original_name=target.name, file_type='image',
                                     file_extension='.jpg', file_size=target.stat().st_size, mime_type='image/jpeg',
                                     file_hash=hashlib.md5(path.read_bytes()).hexdigest(), file_path=str(relative),
                                     uploader=job.owner, source_type='content', linked_article=article, is_linked=True)
            coll.count = Article.objects.filter(coll_id=coll.pk, is_valid=True).count()
            coll.save(update_fields=['count', 'updated_at'])
            current.state, current.stage, current.message = 'completed', '已完成', warning
            current.article_id, current.title = article.pk, name
            current.save()
        cleanup.pop_all()


def process(job, root):
    started = time.monotonic()

    def progress(stage, **changes):
        if time.monotonic() - started > 7200:
            raise VideoError('处理超过两小时，请缩短视频后重试')
        VideoNoteJob.objects.filter(pk=job.pk).update(state='running', stage=stage, message='',
                                                       updated_at=timezone.now(), **changes)
    try:
        progress('准备处理')
        directory = job_directory(root, job.pk, create=True)
        # Interrupted workers may leave decoded tracks. Upload and transcript live one level above.
        for attempt in directory.glob('attempt-*'):
            if attempt.is_symlink() or attempt.resolve().parent != directory:
                raise VideoError('视频处理中间目录超出允许范围')
            shutil.rmtree(attempt, ignore_errors=True)
        with tempfile.TemporaryDirectory(dir=directory, prefix='attempt-') as attempt:
            result = generate(job, Path(attempt), progress)
            progress('保存文章和截图')
            publish(job, result)
        remove_job_directory(root, job.pk)
    except Exception as exc:
        if not isinstance(exc, VideoError):
            logger.warning('Video note job %s failed: %s', job.pk, type(exc).__name__)
        needs_file = isinstance(exc, UploadNeeded)
        message = str(exc) if isinstance(exc, VideoError) else '处理失败，请检查模型或服务配置后重试'
        VideoNoteJob.objects.filter(pk=job.pk, state='running').update(
            state='awaiting_upload' if needs_file else 'failed', stage='等待上传视频' if needs_file else '处理失败',
            message=message[:500], updated_at=timezone.now())


def clean_expired(root):
    root = validate_runtime_root(root)
    cutoff = timezone.now() - timedelta(hours=24)
    for directory in root.iterdir():
        if directory.is_symlink() or not directory.is_dir() or len(directory.name) != 36:
            continue
        try:
            job_id = uuid.UUID(directory.name)
        except ValueError:
            continue
        with transaction.atomic():
            job = VideoNoteJob.objects.select_for_update().filter(pk=job_id).first()
            # A UUID-shaped name alone does not establish ownership of a directory.
            if job and (job.state == 'completed' or (job.state in ('failed', 'awaiting_upload') and job.updated_at < cutoff)):
                remove_job_directory(root, job_id)


def tick(clean=False):
    root = runtime_root()
    # OS releases the device lock on worker exit. The next holder resumes an interrupted job.
    try:
        with FileLock(root / 'worker.lock', timeout=0):
            if clean:
                clean_expired(root)
            job = VideoNoteJob.objects.filter(state__in=['queued', 'running']).order_by('created_at').first()
            if job:
                process(job, root)
    except Timeout:
        return
