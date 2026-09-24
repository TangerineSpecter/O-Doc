"""手动图片索引任务。进度和租约仅存在本机数据库。"""

import logging
import uuid
from datetime import timedelta

from django.db import models, transaction
from django.utils import timezone

from anthology.models import Anthology
from article.image_search_service import index_image
from article.models import Image, ImageIndexJob, ImageIndexLease, ImageVisualIndex


logger = logging.getLogger(__name__)
LEASE_SECONDS = 180


def create_index_job(coll_id, owner, image_ids, mode='reuse'):
    if mode not in {'reuse', 'refresh', 'index_only'}:
        raise ValueError('无效的建索引方式')
    if not Anthology.objects.filter(coll_id=coll_id, user_id=owner, type='image', is_valid=True).exists():
        raise ValueError('无权管理这个图片文集')
    if image_ids == 'all':
        ids = list(Image.objects.filter(coll_id=coll_id, is_valid=True).values_list('image_id', flat=True))
    elif isinstance(image_ids, list) and image_ids:
        ids = list(dict.fromkeys(str(value) for value in image_ids))
        if len(ids) > 2000 or Image.objects.filter(coll_id=coll_id, is_valid=True, image_id__in=ids).count() != len(ids):
            raise ValueError('所选图片无效或超过单次 2000 张的限制')
    else:
        raise ValueError('请选择要处理的图片')
    if not ids:
        raise ValueError('文集中没有可处理的图片')
    active = ImageIndexJob.objects.filter(coll_id=coll_id, owner=owner, state__in=['queued', 'running']).order_by('created_at').first()
    if active:
        if active.image_ids == ids and active.mode == mode:
            return active
        raise ValueError('这个文集已有处理中的任务')
    return ImageIndexJob.objects.create(coll_id=coll_id, owner=owner, image_ids=ids, mode=mode)


def serialize_job(job):
    return {
        'id': job.pk, 'state': job.state, 'mode': job.mode,
        'total': len(job.image_ids), 'completed': len(job.completed_ids),
        'failed': len(job.failures), 'failures': job.failures,
        'cancel_requested': job.cancel_requested,
    }


@transaction.atomic
def claim_job():
    lease, _ = ImageIndexLease.objects.get_or_create(pk='image-index')
    now = timezone.now()
    token = uuid.uuid4().hex
    won = ImageIndexLease.objects.filter(pk=lease.pk).filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__lte=now)
    ).update(owner=token, expires_at=now + timedelta(seconds=LEASE_SECONDS))
    if not won:
        return None
    if lease.job_id:
        ImageIndexJob.objects.filter(pk=lease.job_id, state='running').update(state='queued')
    job = ImageIndexJob.objects.filter(state='queued').order_by('created_at').first()
    if not job:
        ImageIndexLease.objects.filter(pk=lease.pk, owner=token).update(owner='', job_id='', expires_at=None)
        return None
    ImageIndexLease.objects.filter(pk=lease.pk, owner=token).update(job_id=job.pk)
    job.state = 'running'
    job.save(update_fields=['state', 'updated_at'])
    return job.pk, token


def execute_claim(claim):
    job_id, token = claim
    try:
        while True:
            if not ImageIndexLease.objects.filter(pk='image-index', owner=token, job_id=job_id, expires_at__gt=timezone.now()).exists():
                return
            job = ImageIndexJob.objects.get(pk=job_id)
            if job.cancel_requested:
                job.state = 'cancelled'
                job.save(update_fields=['state', 'updated_at'])
                return
            remaining = next((image_id for image_id in job.image_ids if image_id not in job.completed_ids), None)
            if not remaining:
                job.state = 'completed'
                job.save(update_fields=['state', 'updated_at'])
                return
            ImageIndexLease.objects.filter(pk='image-index', owner=token).update(expires_at=timezone.now() + timedelta(seconds=LEASE_SECONDS))
            try:
                if not Anthology.objects.filter(coll_id=job.coll_id, user_id=job.owner, type='image', is_valid=True).exists():
                    raise ValueError('文集已失效或不再属于任务发起人')
                image = Image.objects.get(pk=remaining, coll_id=job.coll_id, is_valid=True)
                index_image(image, mode=job.mode)
                job.failures.pop(remaining, None)
            except (ValueError, Image.DoesNotExist) as exc:
                job.failures[remaining] = str(exc)[:500]
                ImageVisualIndex.objects.update_or_create(image_id=remaining, defaults={'enabled': True, 'error': str(exc)[:500]}) if Image.objects.filter(pk=remaining).exists() else None
            except Exception:
                logger.exception('Image indexing failed: job=%s image=%s', job_id, remaining)
                job.failures[remaining] = '识图或建索引失败，请检查模型配置后重试'
                if Image.objects.filter(pk=remaining).exists():
                    ImageVisualIndex.objects.update_or_create(image_id=remaining, defaults={'enabled': True, 'error': job.failures[remaining]})
            job.completed_ids = [*job.completed_ids, remaining]
            job.save(update_fields=['completed_ids', 'failures', 'updated_at'])
    finally:
        ImageIndexLease.objects.filter(pk='image-index', owner=token).update(owner='', job_id='', expires_at=None)
