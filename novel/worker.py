"""Per-request workers with local leases, durable outputs and explicit retry."""
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import httpx
from django.conf import settings
from django.db import close_old_connections, transaction
from django.utils import timezone
from openai import OpenAI
from utils.ai_service import AIService
from utils.token_usage import create_completion, usage_scope
from system_settings.models import SystemSetting
from .generation import prepare, finish
from .locking import project_lock
from .models import Job, Run, Revision

logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='novel')
streams = {}
stream_lock = threading.Lock()


def dispatch(run_id):
    if getattr(settings, 'NOVEL_DISABLE_WORKERS', False):
        return
    executor.submit(execute, run_id)


def interrupt(run_id):
    with stream_lock:
        stream = streams.get(run_id)
    if stream:
        stream.close()


def completion(run, messages):
    editor = run.kind in ('review', 'check', 'blueprint', 'chat')
    system = SystemSetting.objects.filter(key='system_ai_config').values_list('value', flat=True).first() or {}
    writer_id = run.project.writer_model_id or AIService._get_config_value(system, 'defaultChatModelId', 'default_chat_model_id')
    model_id = (run.project.editor_model_id or AIService._get_config_value(system, 'simpleChatModelId', 'simple_chat_model_id') or writer_id) if editor else writer_id
    config = AIService.get_client_config_for_model(model_id) if model_id else AIService.get_default_client_config(use_simple_model=editor)
    if config.get('model_type') != 'chat':
        raise ValueError('请选择对话模型')
    run.model_name = config['model_name']
    run.save(update_fields=['model_name', 'updated_at'])
    output, finish_reason, usage = '', None, None
    deadline = time.monotonic() + 300
    client = OpenAI(api_key=config['api_key'], base_url=config['base_url'], max_retries=0, timeout=httpx.Timeout(30, read=30))
    stream = None
    try:
        with usage_scope(owner_id=run.project.anthology.user_id, record=run, purpose='novel', phase=run.kind):
            stream = create_completion(client, config, retries=0, model=config['model_name'], messages=messages,
                                       stream=True, extra_body=AIService._thinking_options(config) or None)
            with stream_lock:
                streams[run.pk] = stream
            last_flush = 0
            for chunk in stream:
                if time.monotonic() > deadline or Job.objects.filter(run=run, cancelled=True).exists():
                    raise InterruptedError('任务已取消或超时')
                if getattr(chunk, 'usage', None):
                    usage = chunk.usage.model_dump()
                for choice in chunk.choices:
                    output += choice.delta.content or ''
                    if choice.finish_reason:
                        finish_reason = choice.finish_reason
                if len(output) > 100000:
                    raise ValueError('输出超过单章上限')
                if time.monotonic() - last_flush > .4:
                    Job.objects.filter(run=run).update(preview=output, stage='生成中', lease_until=timezone.now() + timedelta(minutes=6))
                    last_flush = time.monotonic()
            if finish_reason != 'stop' or not output.strip():
                raise ValueError('模型输出被截断或未正常结束，请重试')
    finally:
        with stream_lock:
            streams.pop(run.pk, None)
        if stream:
            stream.close()
        client.close()
    return output, usage


def execute(run_id):
    close_old_connections()
    try:
        initial = Run.objects.get(pk=run_id)
        with project_lock(initial.project_id), transaction.atomic():
            run = Run.objects.select_related('project__anthology', 'chapter').get(pk=run_id)
            job = Job.objects.filter(run=run).first()
            if not job or job.cancelled or run.status != 'pending' or not run.project.anthology.is_valid:
                return
            run.status = 'running'
            run.save()
            job.lease_until = timezone.now() + timedelta(minutes=6)
            job.stage = '组装本章资料'
            job.save()
        with usage_scope(owner_id=run.project.anthology.user_id, record=run, purpose='novel', phase='retrieve'):
            messages, mode = prepare(run)
        output, usage = completion(run, messages)
        with project_lock(run.project_id), transaction.atomic():
            run.refresh_from_db()
            if run.status != 'running' or Job.objects.filter(run=run, cancelled=True).exists():
                return
            run.result = dict(finish(run, output, mode), usage=usage, usage_known=usage is not None)
            run.status = 'completed'
            run.save()
            Job.objects.filter(run=run).update(preview=output, stage='已完成', lease_until=None)
    except Exception as exc:
        logger.warning('Novel task failed id=%s type=%s', run_id, type(exc).__name__)
        run = Run.objects.filter(pk=run_id).first()
        if run and run.status in ('pending', 'running'):
            with project_lock(run.project_id), transaction.atomic():
                run.refresh_from_db()
                if run.status not in ('pending', 'running'):
                    return
                run.status = 'cancelled' if Job.objects.filter(run=run, cancelled=True).exists() else 'failed'
                # Never leak provider credentials or raw HTTP bodies to task records.
                from rest_framework.exceptions import ValidationError
                run.error = str(exc.detail)[:300] if isinstance(exc, ValidationError) else ('输出不完整，请重试' if isinstance(exc, ValueError) else '任务中断或模型调用失败，请检查配置后重试')
                run.save()
                Job.objects.filter(run=run).update(stage=run.error, lease_until=None)
    finally:
        close_old_connections()


def recover(run):
    job = Job.objects.filter(run=run).first()
    if run.status in ('pending', 'running') and (not job or (job.lease_until and job.lease_until < timezone.now())):
        run.status = 'interrupted'
        run.error = '执行已中断，需手动重试；不会自动再次调用模型'
        run.save()
    return run


def index_safely(revision_id):
    close_old_connections()
    try:
        from .retrieval import index_revision
        revision = Revision.objects.filter(pk=revision_id).first()
        if revision:
            index_revision(revision)
    except Exception:
        logger.warning('Novel indexing failed revision=%s; keyword fallback remains active', revision_id)
    finally:
        close_old_connections()
