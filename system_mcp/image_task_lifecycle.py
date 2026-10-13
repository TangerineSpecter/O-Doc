"""战斗头像等待边界；取消不承诺撤销服务商已经接收的请求。"""
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from prompts.models import ImageGenerationTask

ACTIVE_IMAGE_STATUSES = {'submitting', 'generating', 'download_pending'}
STOPPED_IMAGE_STATUSES = {'cancelled', 'timed_out', 'discarded'}
BATTLE_HEAD_WAIT_SECONDS = 15 * 60


def write_image_task(task: ImageGenerationTask, **values) -> None:
    # Query/submission can finish after DELETE. Lock the persisted row so that
    # a late provider response cannot turn a stopped task back into an active one.
    with transaction.atomic():
        saved = ImageGenerationTask.objects.select_for_update().get(pk=task.pk)
        if saved.status in STOPPED_IMAGE_STATUSES:
            task.refresh_from_db()
            return
        if values.get('status') in STOPPED_IMAGE_STATUSES and saved.status not in ACTIVE_IMAGE_STATUSES:
            task.refresh_from_db()
            return
        for key, value in values.items():
            setattr(saved, key, value)
        saved.save(update_fields=[*values, 'updated_at'])
        task.refresh_from_db()


def expire_battle_head_tasks(user_id: str, agent_key: str) -> None:
    cutoff = timezone.now() - timedelta(seconds=BATTLE_HEAD_WAIT_SECONDS)
    tasks = ImageGenerationTask.objects.filter(
        user_id=user_id, agent_key=agent_key, request_data__scene='battle_head',
        status__in=ACTIVE_IMAGE_STATUSES, created_at__lte=cutoff,
    )
    for task in tasks:
        write_image_task(task, status='timed_out', lease_until=None,
                         error_message='已等待 15 分钟，自动停止等待；服务商是否完成尚未确认，可重新生成')


def cancel_battle_head_task(task_id: str, user_id: str, agent_key: str) -> ImageGenerationTask:
    selected = ImageGenerationTask.objects.filter(
        pk=task_id, user_id=user_id, agent_key=agent_key, request_data__scene='battle_head',
    ).first()
    if selected is None:
        raise ValueError('生成任务不存在或无权访问')
    if selected.status in ACTIVE_IMAGE_STATUSES:
        # Earlier versions allowed duplicate submissions. Stop older pending
        # requests as well so they cannot block the user's next generation.
        tasks = ImageGenerationTask.objects.filter(
            user_id=user_id, agent_key=agent_key, request_data__scene='battle_head',
            status__in=ACTIVE_IMAGE_STATUSES, created_at__lte=selected.created_at,
        )
        for task in tasks:
            write_image_task(task, status='cancelled', lease_until=None,
                             error_message='已取消本地等待；服务商可能仍继续处理，迟到结果不会载入')
    selected.refresh_from_db()
    return selected


def recover_battle_head_task(task_id: str, user_id: str, agent_key: str) -> ImageGenerationTask:
    """Manually query a timed-out request once; never submit a new generation."""
    from .image_generation_tasks import _model, _download, image_task_context
    from system_settings.grsai_images import GrsaiImageClient, GrsaiImageError
    from system_settings.newapi_images import NewApiImageClient

    task = ImageGenerationTask.objects.filter(
        pk=task_id, user_id=user_id, agent_key=agent_key, request_data__scene='battle_head',
    ).first()
    if task is None:
        raise ValueError('生成任务不存在或无权访问')
    if task.status != 'timed_out':
        return task
    now = timezone.now()
    lease = now + timedelta(minutes=3)
    claimed = ImageGenerationTask.objects.filter(pk=task.pk, status='timed_out').filter(
        Q(lease_until__isnull=True) | Q(lease_until__lte=now),
    ).update(lease_until=lease)
    if not claimed:
        raise ValueError('原任务结果正在查询，请稍后重试')
    try:
        model = _model(task)
        client = GrsaiImageClient(model) if task.provider_type == 'Grsai' else NewApiImageClient(model)
        image_url = task.image_url
        if not image_url:
            if not task.provider_task_id or task.provider_type != 'Grsai':
                raise ValueError('服务商任务 ID 不可查询，请重新生成')
            with image_task_context(task):
                result = client.get_result(task.provider_task_id)
            if result.status != 'succeeded':
                return task
            image_url = result.image_urls[0]
        with transaction.atomic():
            saved = ImageGenerationTask.objects.select_for_update().get(pk=task.pk)
            if saved.status != 'timed_out' or saved.lease_until != lease:
                task.refresh_from_db()
                return task
            saved.status = 'download_pending'
            saved.image_url = image_url
            saved.error_message = ''
            saved.save(update_fields=['status', 'image_url', 'error_message', 'updated_at'])
        task.refresh_from_db()
        _download(task, client)
    except GrsaiImageError as exc:
        raise ValueError(str(exc)) from exc
    finally:
        ImageGenerationTask.objects.filter(pk=task.pk, lease_until=lease).update(lease_until=None)
    task.refresh_from_db()
    return task
