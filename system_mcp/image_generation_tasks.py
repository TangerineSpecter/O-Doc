"""通用生图提交、查询与原结果下载恢复；不触发发帖。"""
import uuid
import logging
from contextlib import contextmanager
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from system_logs.capture import request_context

from assets.models import Asset
from prompts.article_illustration import get_saved_article_illustration, save_article_illustration
from prompts.generation import _download_generated_images, _validate_image_content
from prompts.models import ImageGenerationTask
from system_settings.grsai_images import GrsaiImageClient, GrsaiImageError
from system_settings.image_generation_options import resolve_image_generation_request
from system_settings.models import AIModel, Agent
from system_settings.newapi_images import NewApiImageClient
from system_settings.sync_state import canonical_hash
from utils.resource_assets import get_resource_view_url
from .image_generation import MCP_USER_ID, resolve_image_model, supports_references, validate_generation_arguments
from .image_references import load_reference_images

ACTIVE = {'submitting', 'generating', 'download_pending'}
LEASE_DURATION = timedelta(minutes=3)
logger = logging.getLogger(__name__)


@contextmanager
def image_task_context(task: ImageGenerationTask):
    data = task.request_data
    options = data.get('provider_options', {})
    token = request_context.set({**request_context.get(), 'task_id': task.pk,
        'image_request_id': task.request_id, 'agent_id': task.agent_key,
        'model_id': task.model_id, 'provider_task_id': task.provider_task_id,
        'reference_image_count': len(data.get('reference_image_ids', [])),
        'image_aspect_ratio': data.get('aspect_ratio', ''), 'image_size': data.get('image_size', ''),
        'image_dimensions': options.get('aspectRatio', '') if 'x' in options.get('aspectRatio', '') else ''})
    try:
        yield
    finally:
        request_context.reset(token)


def _scope(agent: Agent | None) -> dict:
    return {'user_id': MCP_USER_ID, 'agent_key': str(agent.pk) if agent else ''}


def _output(task: ImageGenerationTask) -> dict:
    result = {'task_id': task.pk, 'request_id': task.request_id, 'status': task.status}
    if task.status == 'succeeded':
        if Asset.objects.filter(pk=task.asset_id, uploader=task.user_id, is_valid=True).exists():
            url = get_resource_view_url(task.asset_id)
            result.update(asset_id=task.asset_id, image_url=url, markdown=f'![生成图片]({url})')
        else:
            result.update(status='failed', message='生成图片已被删除，不会自动重新生图')
    elif task.status in ACTIVE:
        result['retry_after_seconds'] = 5
    if task.error_message:
        result['message'] = task.error_message
    return result


def _write(task: ImageGenerationTask, **values) -> None:
    for key, value in values.items():
        setattr(task, key, value)
    task.save(update_fields=[*values, 'updated_at'])


def _model(task: ImageGenerationTask) -> AIModel:
    model = AIModel.objects.select_related('provider').filter(pk=task.model_id, type='image_generation').first()
    if not model or model.provider.type != task.provider_type:
        raise GrsaiImageError('该生成任务使用的模型已失效', status_code=400)
    if task.request_data.get('provider_config_hash') != _provider_config_hash(model):
        raise GrsaiImageError('该生成任务的服务地址或模型配置已改变，请恢复原配置后查询', status_code=400)
    return model


def _provider_config_hash(model: AIModel) -> str:
    # Credentials may be rotated, but a pending task must not move to another service.
    return canonical_hash({'provider_id': str(model.provider_id), 'model_name': model.name,
                           'base_url': model.provider.base_url, 'provider_type': model.provider.type})


def _accept_result(task: ImageGenerationTask, result) -> None:
    values = {'provider_task_id': result.task_id, 'error_message': ''}
    if result.status == 'succeeded':
        values.update(status='download_pending', image_url=result.image_urls[0])
    else:
        values['status'] = 'generating'
    _write(task, **values)


def _download(task: ImageGenerationTask, client, content: bytes | str | None = None) -> None:
    marker = f'mcp-image:{task.pk}'
    saved = get_saved_article_illustration(task_id=marker, user_id=task.user_id)
    if saved is None:
        if task.provider_type == 'Grsai':
            image = _download_generated_images((task.image_url,))[0]
        else:
            image = _validate_image_content(content if isinstance(content, bytes) else client.fetch_image(task.image_url))
        saved = save_article_illustration(image=image, user_id=task.user_id, task_id=marker, original_name='生成图片')
    _write(task, status='succeeded', asset_id=saved['id'], error_message='')


def generate_image(arguments: object, agent: Agent | None = None) -> dict:
    data = validate_generation_arguments(arguments)
    request_id = data.pop('request_id', None) or uuid.uuid4().hex
    digest = canonical_hash(data)
    scope = _scope(agent)
    existing = ImageGenerationTask.objects.filter(**scope, request_id=request_id).first()
    if existing:
        if existing.input_hash != digest:
            raise ValueError('相同 request_id 不可用于不同生图参数')
        return _output(existing)
    try:
        model = resolve_image_model(data.get('model_id'))
        references = data['reference_image_ids']
        if references and not supports_references(model):
            raise ValueError('当前模型不支持参考图，请选择支持以图生图的 Grsai 模型')
        options = resolve_image_generation_request(model, {key: data[key] for key in ('aspect_ratio', 'image_size') if key in data}, scene='generic')
        images = load_reference_images(references, user_id=MCP_USER_ID)
        client = GrsaiImageClient(model) if model.provider.type == 'Grsai' else NewApiImageClient(model)
    except GrsaiImageError as exc:
        raise ValueError(str(exc)) from exc
    task, created = ImageGenerationTask.objects.get_or_create(**scope, request_id=request_id, defaults={
        'input_hash': digest, 'request_data': {**data, 'provider_options': options,
                                             'provider_config_hash': _provider_config_hash(model)},
        'model_id': str(model.pk), 'provider_type': model.provider.type,
        'lease_until': timezone.now() + LEASE_DURATION,
    })
    if not created:
        if task.input_hash != digest:
            raise ValueError('相同 request_id 不可用于不同生图参数')
        return _output(task)
    try:
        if task.provider_type == 'Grsai':
            with image_task_context(task):
                result = client.generate(data['prompt'], generation_options=options, reference_images=images, asynchronous=True)
            _accept_result(task, result)
            if task.status == 'download_pending':
                _download(task, client)
        else:
            with image_task_context(task):
                result = client.generate(data['prompt'])
            first = result.images[0]
            _write(task, status='download_pending', image_url=first if isinstance(first, str) else '')
            _download(task, client, first)
    except GrsaiImageError as exc:
        if task.status == 'submitting':
            status = 'failed' if exc.status_code < 500 else 'submission_unknown'
            _write(task, status=status, error_message=str(exc)[:200])
        else:
            if task.image_url:
                _write(task, error_message='图片下载失败，请查询同一 task_id 恢复下载')
            else:
                _write(task, status='failed', error_message='图片数据未能保存，不会自动重复生成')
    except Exception as exc:
        # Provider acceptance may already have happened. Never automatically resubmit.
        logger.warning('Image generation persistence failed: task=%s phase=%s error_type=%s', task.pk, task.status, type(exc).__name__)
        status = 'download_pending' if task.image_url else 'submission_unknown'
        _write(task, status=status, error_message='结果保存未完成，请查询同一 task_id；不会自动重复生成')
    finally:
        _write(task, lease_until=None)
    return _output(task)


def get_image_generation_result(arguments: object, agent: Agent | None = None) -> dict:
    if not isinstance(arguments, dict) or set(arguments) != {'task_id'}:
        raise ValueError('请仅提供 task_id')
    task_id = arguments['task_id']
    if not isinstance(task_id, str) or len(task_id) != 32 or any(c not in '0123456789abcdef' for c in task_id):
        raise ValueError('生成任务 ID 无效')
    task = ImageGenerationTask.objects.filter(pk=task_id, **_scope(agent)).first()
    if task is None:
        raise ValueError('生成任务不存在或无权访问')
    if task.status not in ACTIVE:
        return _output(task)
    now = timezone.now()
    lease = now + LEASE_DURATION
    claimed = ImageGenerationTask.objects.filter(pk=task.pk).filter(Q(lease_until__isnull=True) | Q(lease_until__lte=now)).update(lease_until=lease)
    if not claimed:
        return _output(task)
    task.refresh_from_db()
    try:
        if task.status == 'submitting':
            _write(task, status='submission_unknown', error_message='无法确认服务商是否接收请求，请勿自动重新生成')
        else:
            model = _model(task)
            client = GrsaiImageClient(model) if task.provider_type == 'Grsai' else NewApiImageClient(model)
            if task.status == 'generating':
                with image_task_context(task):
                    _accept_result(task, client.get_result(task.provider_task_id))
            if task.status == 'download_pending':
                _download(task, client)
    except GrsaiImageError as exc:
        if exc.status_code == 422:
            _write(task, status='failed', error_message=str(exc)[:200])
        else:
            _write(task, error_message=str(exc)[:200])
    except Exception as exc:
        logger.warning('Image generation query failed: task=%s phase=%s error_type=%s', task.pk, task.status, type(exc).__name__)
        _write(task, error_message='结果暂未保存，请稍后查询同一 task_id')
    finally:
        ImageGenerationTask.objects.filter(pk=task.pk, lease_until=lease).update(lease_until=None)
    return _output(task)
