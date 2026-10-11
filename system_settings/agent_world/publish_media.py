"""分类配图异步恢复。请求与结果同步，本机授权与执行锁不进入快照。"""
import hashlib
import logging
import time
from django.db import transaction
from django.utils import timezone
from article.models import Article
from article.version_service import create_article_version
from system_settings.models import WorldAction, WorldActionRuntime
from system_mcp.image_generation import image_generation_options
from system_mcp.image_generation_tasks import generate_image, get_image_generation_result
from .execution import execution_lease
from .publish_image_prompt import build_prompt

logger = logging.getLogger(__name__)
ACTIVE = ('pending', 'generating')
_poll_times = {}  # 本机轮询节流，不写入业务快照。
_started_times = {}


def runtime_id(action):
    return 'post-photo:' + hashlib.sha256(str(action.pk).encode()).hexdigest()[:29]


def content_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


def prepare_photo(action, article, rule=None):
    rule = rule if rule is not None else next((r for r in action.snapshot['config']['rules'] if r['category_id'] == action.snapshot['selection']['category_id']), {})
    if not rule.get('image_enabled'):
        return
    photo = {'status': 'pending', 'attempt': 0, 'content_hash': content_hash(article.content)}
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


def public_photo(action):
    photo = action.snapshot.get('photo', {}) if action else {}
    value = {k: photo[k] for k in ('status', 'error', 'image_url', 'asset_id', 'attempt') if k in photo}
    if action and photo.get('status') in ACTIVE and not WorldActionRuntime.objects.filter(pk=runtime_id(action), enabled=True).exists():
        value.update(status='paused', error='当前设备尚未恢复配图，请查询原请求继续处理')
    return value


@transaction.atomic
def attach_photo(action, photo, *, force=False):
    article = Article.objects.select_for_update().filter(pk=action.snapshot['post_id'], is_valid=True,
        agent_post_author_id=action.actor_id, author=action.snapshot['config']['owner_id']).first()
    if not article:
        photo.update(status='abandoned', error='帖子已删除或归属发生变化')
    elif not force and content_hash(article.content) != photo['content_hash']:
        photo.update(status='manual', error='正文已修改，请确认后插入已生成图片')
    else:
        marker = '\n\n![帖子配图](' + photo['image_url'] + ')'
        if marker not in article.content:
            create_article_version(article, source='post_photo', operator_id=article.author)
            article.content += marker
            article.is_rag_synced = False
            article.save(update_fields=['content', 'is_rag_synced', 'updated_at'])
        photo.update(status='inserted', error='')
    action.snapshot = {**action.snapshot, 'photo': photo}
    action.save(update_fields=['snapshot', 'updated_at'])


def recover_photo(action):
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
                result = get_image_generation_result({'task_id': photo['task_id']}, agent=action.agent) if photo.get('task_id') else generate_image(photo['request'], agent=action.agent)
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
                if photo['status'] in ACTIVE and now - _started_times[identifier] > 1800:
                    photo.update(status='query_required', error='等待超过30分钟，请手动查询原请求')
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
    if not photo:
        raise ValueError('此帖子没有分类配图任务')
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
        photo.update(status='pending')
        _poll_times.pop(runtime_id(action), None)
        _started_times.pop(runtime_id(action), None)
    elif operation == 'retry':
        if photo.get('status') not in ('failed', 'cancelled'):
            raise ValueError('请先查询原请求，确认失败后才能重新生成')
        article = Article.objects.get(pk=action.snapshot['post_id'], is_valid=True)
        attempt = photo.get('attempt', 0) + 1
        if not action.task_id or not action.agent_id:
            raise ValueError('任务或 Agent 已删除')
        # 配置失败也可在修复设置后重试；已有场景提示词保留。
        original = photo.get('request')
        rule = next((r for r in action.task.publish_config.get('rules', []) if r['category_id'] == action.snapshot['selection']['category_id']), {})
        action.snapshot = {k: v for k, v in action.snapshot.items() if k != 'photo'}
        prepare_photo(action, article, rule)
        photo = action.snapshot.get('photo', {})
        if not photo.get('request'):
            raise ValueError(photo.get('error', '分类配图已关闭'))
        photo['attempt'] = attempt
        photo['request']['request_id'] = f'post:{action.pk}:{attempt}'
        if original:
            if original.get('reference_image_ids') and not photo['request'].get('reference_image_ids'):
                raise ValueError('原场景使用角色参考图，请选择支持参考图的模型并保留角色主体模式')
            for key in ('prompt', 'reference_image_ids'):
                photo['request'][key] = original[key]
    else:
        raise ValueError('未知操作')
    _poll_times.pop(runtime_id(action), None)
    _started_times.pop(runtime_id(action), None)
    action.snapshot = {**action.snapshot, 'photo': photo}
    action.save(update_fields=['snapshot', 'updated_at'])
    WorldActionRuntime.objects.update_or_create(pk=runtime_id(action), defaults={'enabled': True})
    return action
