"""分类配图异步恢复。请求与结果同步，本机授权与执行锁不进入快照。"""
import hashlib
import logging
import re
import time
from django.db import transaction
from django.utils import timezone
from article.models import Article
from article.version_service import create_article_version
from prompts.models import ImageGenerationTask
from system_settings.models import WorldAction, WorldActionRuntime
from system_mcp.image_generation import image_generation_options
from system_mcp.image_generation_tasks import generate_image, get_image_generation_result
from system_mcp.image_generation import MCP_USER_ID
from .execution import execution_lease
from .publish_image_prompt import build_prompt

logger = logging.getLogger(__name__)
ACTIVE = ('pending', 'generating')
POST_PHOTO_MARKER = re.compile(r'!\[帖子配图\]\([^)]+\)')
_poll_times = {}  # 本机轮询节流，不写入业务快照。
_started_times = {}


def _photo_task(action, photo):
    request_id = (photo.get('request') or {}).get('request_id')
    if not request_id:
        return None
    return ImageGenerationTask.objects.filter(user_id=MCP_USER_ID,
        agent_key=str(action.agent_id or ''), request_id=request_id).first()


def _elapsed_seconds(action, task):
    # 任务创建时间持久化，后端重启不会重新获得完整的等待窗口。
    started = task.created_at if task else action.updated_at
    return max(0, int((timezone.now() - started).total_seconds()))


def runtime_id(action):
    return 'post-photo:' + hashlib.sha256(str(action.pk).encode()).hexdigest()[:29]


def content_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


def _post_rule(action, article, *, use_current_config=False):
    snapshot = action.snapshot
    category_id = (snapshot.get('selection') or {}).get('category_id') or article.agent_post_category_ref_id
    # 首次发布沿用执行快照；人工补图/重试允许使用用户修正后的任务设置。
    config = action.task.publish_config if use_current_config and action.task_id else snapshot.get('config')
    rules = (config or {}).get('rules') or []
    return next((rule for rule in rules if rule.get('category_id') == category_id), {
        'category_id': str(category_id or ''), 'image_enabled': True,
        'image_subject': 'auto', 'image_prompt': '',
    })


def prepare_photo(action, article, rule=None, *, force=False, attempt=0):
    rule = rule if rule is not None else _post_rule(action, article)
    if not force and not rule.get('image_enabled'):
        return
    photo = {'status': 'pending', 'attempt': attempt, 'content_hash': content_hash(article.content)}
    action.snapshot = {**action.snapshot, 'photo': photo}
    try:
        options = image_generation_options(action.agent, model_id=rule.get('image_model_id'), scene='travel_photo')
        if not options.get('configured'):
            raise ValueError(options.get('message', '请先配置生图模型'))
        references = options.get('agent_reference_images', {})
        if not options.get('supports_reference_images'):
            if rule.get('image_subject') == 'agent':
                raise ValueError('包含 Agent 时请选择支持角色参考图的生图模型')
            references = {}
        prompt, refs = build_prompt(article, rule, references)
        photo['request'] = {'request_id': f'post:{action.pk}:0', 'model_id': options['model_id'],
                            'prompt': prompt, 'reference_image_ids': refs}
        if options.get('mode') != 'automatic':
            photo['request'].update(aspect_ratio=options['default_aspect_ratio'], image_size=options['default_image_size'])
        WorldActionRuntime.objects.update_or_create(pk=runtime_id(action), defaults={'enabled': True})
    except Exception as exc:
        logger.warning('帖子配图配置失败 action=%s error_type=%s', action.pk, type(exc).__name__)
        photo.update(status='failed', error=str(exc)[:300] if isinstance(exc, ValueError) else '配图配置失败，请检查模型与角色参考图')


def public_photo(action, article=None):
    photo = action.snapshot.get('photo', {}) if action else {}
    value = {k: photo[k] for k in ('status', 'error', 'image_url', 'asset_id', 'attempt') if k in photo}
    content = article.content if article is not None else (
        Article.objects.filter(pk=action.snapshot.get('post_id'), is_valid=True).values_list('content', flat=True).first() if action else ''
    )
    value['has_image'] = bool(content and POST_PHOTO_MARKER.search(content))
    if action and photo.get('status') in (*ACTIVE, 'query_required', 'submission_unknown'):
        task = _photo_task(action, photo)
        value.update(stage=task.status if task else 'pending', elapsed_seconds=_elapsed_seconds(action, task),
                     last_updated_at=(task.updated_at if task else action.updated_at).isoformat())
        if task and task.error_message:
            value['error'] = task.error_message
        value['can_retry_download'] = bool(task and task.status == 'download_pending' and task.image_url)
        value['retry_after_seconds'] = max(0, int(30 - (time.monotonic() - _poll_times.get(runtime_id(action), -60))))
        runtime = WorldActionRuntime.objects.filter(pk=runtime_id(action)).first()
        value['recovering'] = bool(runtime and runtime.enabled and runtime.until and runtime.until > timezone.now())
        # 后台停滞也不能让页面永久转圈；人工查询后留出一轮后台处理时间。
        if (photo.get('status') in ACTIVE and value['elapsed_seconds'] >= 1800
                and (timezone.now() - action.updated_at).total_seconds() >= 60):
            value.update(status='query_required', error='等待超过30分钟，需查询原请求确认结果；不会自动重新生成')
    if action and photo.get('status') in ACTIVE and not WorldActionRuntime.objects.filter(pk=runtime_id(action), enabled=True).exists():
        value.update(status='paused', error='当前设备尚未恢复配图，请查询原请求继续处理')
    return value


def _remove_photo_marker(content):
    match = POST_PHOTO_MARKER.search(content)
    if not match:
        return content, False
    prefix = content[:match.start()].rstrip('\n')
    suffix = content[match.end():].lstrip('\n')
    if prefix and suffix:
        return prefix + '\n\n' + suffix, True
    return prefix or suffix, True


def _replace_photo_marker(content, image_url):
    marker = f'![帖子配图]({image_url})'
    match = POST_PHOTO_MARKER.search(content)
    if match:
        return content[:match.start()] + marker + content[match.end():]
    return marker + ('\n\n' + content if content else '')


def _save_article_content(article, content):
    if article.content == content:
        return
    create_article_version(article, source='post_photo', operator_id=article.author)
    article.content = content
    article.is_rag_synced = False
    article.save(update_fields=['content', 'is_rag_synced', 'updated_at'])


@transaction.atomic
def attach_photo(action, photo, *, force=False):
    article = Article.objects.select_for_update().filter(pk=action.snapshot['post_id'], is_valid=True,
        agent_post_author_id=action.actor_id, author=action.snapshot['config']['owner_id']).first()
    if not article:
        photo.update(status='abandoned', error='帖子已删除或归属发生变化')
    elif not force and content_hash(article.content) != photo['content_hash']:
        photo.update(status='manual', error='正文已修改，请确认后插入已生成图片')
    else:
        content = article.content
        image = '![帖子配图](' + photo['image_url'] + ')'
        manual_request = str((photo.get('request') or {}).get('request_id', '')).startswith('post-manual:')
        if manual_request:
            content = _replace_photo_marker(content, photo['image_url'])
        elif image not in content:
            content += '\n\n' + image
        _save_article_content(article, content)
        photo.update(status='inserted', error='')
    action.snapshot = {**action.snapshot, 'photo': photo}
    action.save(update_fields=['snapshot', 'updated_at'])


def recover_photo(action, *, query_only=False):
    identifier = runtime_id(action)
    if not WorldActionRuntime.objects.filter(pk=identifier, enabled=True).exists():
        return  # 同步到另一设备后须由用户显式恢复，不能自动再次收费。
    with execution_lease(WorldActionRuntime, {'pk': identifier}) as token:
        if not token:
            return
        action.refresh_from_db()
        photo = dict(action.snapshot.get('photo', {}))
        if photo.get('status') not in ACTIVE or not action.agent_id:
            return
        now = time.monotonic()
        if now - _poll_times.get(identifier, -60) < 30:
            return
        _poll_times[identifier] = now
        _started_times.setdefault(identifier, now)
        if not Article.objects.filter(pk=action.snapshot.get('post_id'), is_valid=True).exists():
            photo.update(status='abandoned', error='帖子已删除')
        else:
            try:
                task = _photo_task(action, photo) if query_only else None
                if query_only and not task:
                    raise ValueError('未找到已提交的原生图任务，无法查询；不会重新提交生图')
                task_id = task.pk if task else photo.get('task_id')
                result = get_image_generation_result({'task_id': task_id}, agent=action.agent) if task_id else generate_image(photo['request'], agent=action.agent)
                if result.get('task_id'):
                    photo['task_id'] = result['task_id']
                if not WorldActionRuntime.objects.filter(pk=identifier, enabled=True, token=token).exists():
                    return
                if result['status'] == 'succeeded':
                    photo.update(image_url=result['image_url'], asset_id=result['asset_id'])
                    with transaction.atomic():
                        locked = WorldAction.objects.select_for_update().get(pk=action.pk)
                        if locked.snapshot.get('photo', {}).get('request') == photo.get('request'):
                            attach_photo(locked, photo)
                    return
                photo['status'] = 'generating' if result['status'] in ('pending', 'submitting', 'generating', 'download_pending') else result['status']
                photo['error'] = result.get('message', '')[:300]
                if photo['status'] in ACTIVE and _elapsed_seconds(action, _photo_task(action, photo)) >= 1800:
                    photo.update(status='query_required', error='等待超过30分钟，已暂停自动查询；可查询原请求，不会重新提交生图')
            except ValueError as exc:
                photo.update(status='query_required', error=str(exc)[:300])
            except Exception:
                logger.exception('帖子配图处理失败 action=%s', action.pk)
                # 保留原请求，显式查询使用同一幂等键，不能以新请求自动重试。
                photo.update(status='query_required', error='配图处理异常，请查询原请求结果')
        if not WorldActionRuntime.objects.filter(pk=identifier, enabled=True, token=token).exists():
            return
        with transaction.atomic():
            locked = WorldAction.objects.select_for_update().get(pk=action.pk)
            if locked.snapshot.get('photo', {}).get('request') == photo.get('request'):
                locked.snapshot = {**locked.snapshot, 'photo': photo}
                locked.save(update_fields=['snapshot', 'updated_at'])


def recover_photos():
    enabled = set(WorldActionRuntime.objects.filter(pk__startswith='post-photo:', enabled=True).values_list('pk', flat=True))
    if not enabled:
        return
    actions = WorldAction.objects.filter(status='success', snapshot__photo__status__in=ACTIVE).select_related('agent').order_by('updated_at', 'pk').iterator()
    processed = 0
    for action in actions:
        if runtime_id(action) not in enabled:
            continue
        try:
            recover_photo(action)
        except Exception:
            logger.exception('帖子配图恢复失败 action=%s', action.pk)
        processed += 1
        if processed >= 5:
            break


def reset_photo_runtime():
    WorldActionRuntime.objects.filter(pk__startswith='post-photo:').update(enabled=False, token='', until=None)
    _poll_times.clear()
    _started_times.clear()


@transaction.atomic
def operate_photo(action, operation):
    action = WorldAction.objects.select_for_update().get(pk=action.pk)
    photo = dict(action.snapshot.get('photo', {}))
    runtime = WorldActionRuntime.objects.select_for_update().filter(pk=runtime_id(action)).first()
    if runtime and runtime.until and runtime.until > timezone.now():
        raise ValueError('配图正在处理，请稍后操作')
    if operation == 'use_image':
        if photo.get('status') != 'manual' or not photo.get('image_url'):
            raise ValueError('没有待插入的图片')
        attach_photo(action, photo, force=True)
        return action
    if operation == 'query':
        if not photo.get('request') or photo.get('status') in ('inserted', 'manual', 'abandoned'):
            raise ValueError('没有可查询的配图请求')
        if time.monotonic() - _poll_times.get(runtime_id(action), -60) < 30:
            raise ValueError('刚刚已查询原请求，请等待30秒再试')
        photo.update(status='pending')
        _poll_times.pop(runtime_id(action), None)
        _started_times.pop(runtime_id(action), None)
    elif operation == 'remove':
        if photo.get('status') not in ('inserted', 'failed', 'cancelled', 'manual'):
            raise ValueError('帖子当前没有可移除的配图')
        article = Article.objects.select_for_update().filter(pk=action.snapshot.get('post_id'), is_valid=True,
            agent_post_author_id=action.actor_id, author=(action.snapshot.get('config') or {}).get('owner_id')).first()
        if not article:
            raise ValueError('帖子已删除或归属发生变化')
        content, removed = _remove_photo_marker(article.content)
        if not removed:
            raise ValueError('帖子当前没有可移除的配图')
        _save_article_content(article, content)
        photo.update(status='removed', error='')
        for key in ('image_url', 'asset_id', 'task_id'):
            photo.pop(key, None)
        action.snapshot = {**action.snapshot, 'photo': photo}
        action.save(update_fields=['snapshot', 'updated_at'])
        if runtime:
            runtime.enabled = False
            runtime.token = ''
            runtime.until = None
            runtime.save(update_fields=['enabled', 'token', 'until'])
        return action
    elif operation in ('generate', 'retry'):
        if operation == 'generate' and photo.get('status') not in (None, 'removed'):
            raise ValueError('请使用“重新生成”处理现有配图')
        if operation == 'retry' and photo.get('status') not in ('inserted', 'removed', 'failed', 'cancelled', 'manual'):
            raise ValueError('请先查询原请求，或等待当前配图任务完成')
        article = Article.objects.select_for_update().filter(pk=action.snapshot.get('post_id'), is_valid=True,
            agent_post_author_id=action.actor_id, author=(action.snapshot.get('config') or {}).get('owner_id')).first()
        if not article:
            raise ValueError('帖子已删除或归属发生变化')
        previous = photo
        original_request = previous.get('request')
        attempt = int(previous.get('attempt', -1)) + 1
        rule = _post_rule(action, article, use_current_config=True)
        prepare_photo(action, article, rule, force=True, attempt=attempt)
        photo = action.snapshot.get('photo', {})
        if photo.get('request'):
            original_request_id = str((original_request or {}).get('request_id', ''))
            manual_request = (operation == 'generate'
                              or action.pk.startswith('post-manual-photo:')
                              or previous.get('status') in ('inserted', 'removed', 'manual')
                              or original_request_id.startswith('post-manual:')
                              or (previous.get('status') in ('failed', 'cancelled') and not original_request_id))
            prefix = 'post-manual:' if manual_request else 'post:'
            photo['request']['request_id'] = f'{prefix}{action.pk}:{attempt}'
            if operation == 'retry' and previous.get('status') in ('failed', 'cancelled') and original_request:
                if original_request.get('reference_image_ids') and not photo['request'].get('reference_image_ids'):
                    raise ValueError('原场景使用角色参考图，请选择支持参考图的模型并保留角色主体模式')
                for key in ('prompt', 'reference_image_ids'):
                    if key in original_request:
                        photo['request'][key] = original_request[key]
    else:
        raise ValueError('未知操作')
    _poll_times.pop(runtime_id(action), None)
    _started_times.pop(runtime_id(action), None)
    action.snapshot = {**action.snapshot, 'photo': photo}
    action.save(update_fields=['snapshot', 'updated_at'])
    if photo.get('status') in ACTIVE and photo.get('request'):
        WorldActionRuntime.objects.update_or_create(pk=runtime_id(action), defaults={'enabled': True})
    elif runtime:
        runtime.enabled = False
        runtime.token = ''
        runtime.until = None
        runtime.save(update_fields=['enabled', 'token', 'until'])
    return action
