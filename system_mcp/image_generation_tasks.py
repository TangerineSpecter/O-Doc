"""通用生图提交、查询与原结果下载恢复；不触发发帖。"""
import uuid
import logging
import requests
from contextlib import contextmanager
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from system_logs.capture import request_context

from assets.models import Asset
from prompts.article_illustration import get_saved_article_illustration, save_article_illustration
from prompts.generation import _validate_image_content
from prompts.models import ImageGenerationTask
from system_settings.grsai_images import GrsaiImageClient, GrsaiImageError
from system_settings.image_generation_options import (get_image_generation_profile, resolve_image_generation_request,
                                                      supports_transparent_background)
from system_settings.models import AIModel, Agent
from system_settings.newapi_images import NewApiImageClient
from system_settings.sync_state import canonical_hash
from utils.resource_assets import get_resource_view_url
from utils.web_parser import fetch_remote_image, WebParserError
from .image_generation import MCP_USER_ID, resolve_image_model, supports_references, validate_generation_arguments
from .image_references import load_reference_images
from .image_task_lifecycle import BATTLE_HEAD_WAIT_SECONDS, expire_battle_head_tasks, write_image_task

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


def _scope(agent: Agent | None, user_id: str = MCP_USER_ID) -> dict:
    return {'user_id': user_id, 'agent_key': str(agent.pk) if agent else ''}


def _output(task: ImageGenerationTask) -> dict:
    result = {'task_id': task.pk, 'request_id': task.request_id, 'status': task.status}
    if task.request_data.get('scene') in ('battle_head', 'loadout_portrait'):
        result.update(created_at=task.created_at.isoformat(), updated_at=task.updated_at.isoformat(),
                      elapsed_seconds=max(0, int((timezone.now() - task.created_at).total_seconds())),
                      wait_limit_seconds=BATTLE_HEAD_WAIT_SECONDS)
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
    if task.request_data.get('scene') in ('battle_head', 'loadout_portrait'):
        write_image_task(task, **values)
        return
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


def _download_generated_images(image_urls: list[str]) -> list:
    """Fetch provider images without inheriting a configured loopback proxy."""
    images = []
    for image_url in dict.fromkeys(image_urls):
        with requests.Session() as session:
            session.trust_env = False
            try:
                fetched = fetch_remote_image(image_url, session=session)
            except WebParserError as exc:
                raise GrsaiImageError(f'图片下载失败：{exc}', retryable=True) from exc
        images.append(_validate_image_content(fetched.content))
    if not images:
        raise GrsaiImageError('图片服务没有返回可保存的图片')
    return images


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
            # 保留远端 URL/实际连接校验；不把环境代理的回环地址当成图片源。
            image = _download_generated_images([task.image_url])[0]
        else:
            image = _validate_image_content(content if isinstance(content, bytes) else client.fetch_image(task.image_url))
        if task.request_data.get('scene') == 'loadout_portrait':
            from system_settings.loadout_portrait import prepare_portrait
            try:
                image = prepare_portrait(image, transparent=(
                    task.request_data.get('provider_options', {}).get('background') == 'transparent'))
            except ValueError as exc:
                raise GrsaiImageError(str(exc), status_code=422) from exc
        source_type = 'agent_art' if task.request_data.get('scene') in ('battle_head', 'loadout_portrait') else 'content'
        saved = save_article_illustration(image=image, user_id=task.user_id, task_id=marker,
                                          original_name='生成图片', source_type=source_type)
    _write(task, status='succeeded', asset_id=saved['id'], error_message='')


def generate_image(arguments: object, agent: Agent | None = None, *, user_id: str = MCP_USER_ID,
                   scene: str = 'generic') -> dict:
    if agent:
        from system_settings.agent_availability import require_active_agent
        agent = require_active_agent(agent)
    data = validate_generation_arguments(arguments)
    request_id = data.pop('request_id', None) or uuid.uuid4().hex
    digest = canonical_hash(data)
    scope = _scope(agent, user_id)
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
        request_options = {key: data[key] for key in ('aspect_ratio', 'image_size') if key in data}
        if get_image_generation_profile(model).mode == 'automatic':
            request_options = {}
        options = resolve_image_generation_request(model, request_options, scene=scene)
        native_background_requested = scene == 'loadout_portrait' or (
            scene == 'battle_head' and data.get('background_mode') == 'transparent')
        if native_background_requested and supports_transparent_background(model):
            # Ask the provider for alpha instead of relying only on prompt wording.
            options = {**options, 'background': 'transparent'}
        images = load_reference_images(references, user_id=user_id)
        client = GrsaiImageClient(model) if model.provider.type == 'Grsai' else NewApiImageClient(model)
    except GrsaiImageError as exc:
        raise ValueError(str(exc)) from exc
    from system_settings.agent_world.farm_gate import farm_gate
    from django.db import transaction
    with farm_gate(), transaction.atomic():
        if agent:
            require_active_agent(agent)
        if scene == 'loadout_portrait':
            active_task = ImageGenerationTask.objects.filter(
                **scope, request_data__scene=scene, status__in=ACTIVE,
            ).order_by('-created_at').first()
            if active_task:
                return _output(active_task)
        task, created = ImageGenerationTask.objects.get_or_create(**scope, request_id=request_id, defaults={
            'input_hash': digest, 'request_data': {**data, 'scene': scene, 'provider_options': options,
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
        if task.request_data.get('scene') == 'loadout_portrait' and exc.status_code == 422:
            _write(task, status='failed', error_message=str(exc)[:200])
        elif task.status == 'submitting':
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


def get_image_generation_result(arguments: object, agent: Agent | None = None, *, user_id: str = MCP_USER_ID) -> dict:
    if agent:
        from system_settings.agent_availability import require_active_agent
        require_active_agent(agent)
    if not isinstance(arguments, dict) or set(arguments) != {'task_id'}:
        raise ValueError('请仅提供 task_id')
    task_id = arguments['task_id']
    if not isinstance(task_id, str) or len(task_id) != 32 or any(c not in '0123456789abcdef' for c in task_id):
        raise ValueError('生成任务 ID 无效')
    task = ImageGenerationTask.objects.filter(pk=task_id, **_scope(agent, user_id)).first()
    if task is None:
        raise ValueError('生成任务不存在或无权访问')
    if task.request_data.get('scene') in ('battle_head', 'loadout_portrait'):
        expire_battle_head_tasks(user_id, task.agent_key, task.request_data['scene'])
        task.refresh_from_db()
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
