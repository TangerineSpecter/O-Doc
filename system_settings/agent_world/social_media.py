"""文字先发布。生图意图持久化后提交，未知结果不自动重新付费。"""
import logging
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from .farm_gate import farm_gate
from .life_time import local_time, storage_time
from .social_models import Moment, SocialConfig
from .social_config import settings_for


def prepare_image(moment, agent, cfg, prompt):
    try:
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 8000: raise ValueError('配图提示词无效')
        midnight = storage_time(local_time().replace(hour=0, minute=0, second=0, microsecond=0))
        count = Moment.objects.filter(owner_id=moment.owner_id, actor_id=moment.actor_id, created_at__gte=midnight).exclude(image_state={}).count()
        if count >= cfg['daily_images']: raise ValueError('今日自主配图额度已用完')
        from system_mcp.image_generation import image_generation_options
        options = image_generation_options(agent, model_id=cfg['image_model_id'], scene='moment')
        if not options.get('configured'): raise ValueError(options.get('message') or '未配置生图模型')
        refs = list(dict.fromkeys(options.get('agent_reference_images', {}).values()))
        if refs and not options.get('supports_reference_images'): raise ValueError('模型不支持角色参考图')
        from system_settings.image_generation_options import resolve_image_generation_request
        from system_mcp.image_generation import resolve_image_model
        resolve_image_generation_request(resolve_image_model(options['model_id']), {'aspect_ratio': cfg['image_aspect_ratio'], 'image_size': cfg['image_size']}, scene='moment')
        request = {'request_id': f'moment:{moment.pk}:0', 'prompt': prompt + '\n只表现已发生的生活片段，情绪服从实际经历；按角色参考图保持身份，不捏造共同经历。',
                   'reference_image_ids': refs, 'model_id': options['model_id'], 'aspect_ratio': cfg['image_aspect_ratio'], 'image_size': cfg['image_size']}
        moment.image_state = {'status': 'pending', 'request': request, 'attempt': 0}
    except Exception as exc:
        moment.image_state = {'status': 'failed', 'error': str(exc)}
    moment.save()


def retry_image(moment):
    if not moment.actor_id.startswith('agent-id:') or not moment.image_state.get('request'): raise ValueError('此动态没有可重新生成的请求')
    if moment.image_state.get('status') in ('pending', 'generating'): raise ValueError('原请求正在进行，请先查询结果')
    from system_settings.models import Agent
    agent = Agent.objects.filter(pk=moment.actor_id[9:]).first()
    config = SocialConfig.objects.get(pk=moment.owner_id)
    cfg = settings_for(config, agent.pk if agent else None)
    if not agent or not cfg['image_enabled'] or len(moment.images) >= 9: raise ValueError('居民或配图能力不可用')
    state = moment.image_state
    from system_mcp.image_generation import resolve_image_model, supports_references
    from system_settings.grsai_images import GrsaiImageError
    try:
        model = resolve_image_model(cfg['image_model_id'])
    except GrsaiImageError as exc:
        raise ValueError(str(exc)) from exc
    if state['request'].get('reference_image_ids') and not supports_references(model):
        raise ValueError('当前模型不支持原请求的参考图，请选择支持参考图的模型')
    request = {**state['request'], 'model_id': str(model.pk),
               'aspect_ratio': cfg['image_aspect_ratio'], 'image_size': cfg['image_size']}
    attempt = state.get('attempt', 0) + 1
    request['request_id'] = f'moment:{moment.pk}:{attempt}'
    from system_settings.image_generation_options import resolve_image_generation_request
    resolve_image_generation_request(model, {'aspect_ratio': request['aspect_ratio'], 'image_size': request['image_size']}, scene='moment')
    moment.image_state = {'status': 'pending', 'request': request, 'attempt': attempt, 'manual': True}
    moment.save()


def image_runtime_id(moment_id: str) -> str:
    from .life_schedule import stable_id
    return 'social-img:' + stable_id(moment_id)[:28]


def queue_manual_image(moment: Moment) -> None:
    # 本机执行许可不参与同步，恢复会清除 social-* 运行许可。
    from system_settings.models import WorldActionRuntime
    from .social_media_worker import start_manual_image_worker
    WorldActionRuntime.objects.update_or_create(pk=image_runtime_id(moment.pk), defaults={'enabled': True})
    transaction.on_commit(start_manual_image_worker, robust=True)


def recover_image(moment):
    from system_settings.models import Agent, WorldActionRuntime
    from .execution import execution_lease
    from system_mcp.image_generation_tasks import generate_image, get_image_generation_result
    runtime_id = image_runtime_id(moment.pk)
    with execution_lease(WorldActionRuntime, {'pk': runtime_id}) as token:
        if not token: return
        with farm_gate(), transaction.atomic():
            moment = Moment.objects.select_for_update().get(pk=moment.pk)
            if not moment.is_valid or moment.image_state.get('status') not in ('pending', 'generating'): return
            if moment.image_state.get('manual'):
                if not WorldActionRuntime.objects.filter(pk=runtime_id, enabled=True, token=token).exists(): return
            else:
                config = SocialConfig.objects.filter(pk=moment.owner_id).first()
                if not config or not settings_for(config, moment.actor_id[9:])['enabled']: return
            state = dict(moment.image_state)
            agent = Agent.objects.filter(pk=moment.actor_id[9:]).first()
            if not agent:
                moment.image_state = {**state, 'status': 'failed', 'error': '居民不存在，配图请求已停止'}
                moment.save()
                WorldActionRuntime.objects.filter(pk=runtime_id, token=token).update(enabled=False)
                return
        last = state.get('polled_at')
        if last and local_time()-local_time(timezone.datetime.fromisoformat(last)) < timedelta(minutes=1): return
        try:
            if state.get('task_id'):
                result = get_image_generation_result({'task_id': state['task_id']}, agent=agent)
            else:
                result = generate_image(state['request'], agent=agent)
            state.update(task_id=result['task_id'], status='generating', polled_at=local_time().isoformat())
            if result['status'] == 'succeeded':
                state['status'] = 'succeeded'
            elif result['status'] in ('failed', 'submission_unknown'):
                state.update(status='failed', error=result.get('message') or result['status'])
            elif local_time()-local_time(moment.created_at) > timedelta(minutes=30) and not state.get('manual'):
                state.update(status='manual', error='配图等待超时，原请求保留；可人工恢复查询')
            with farm_gate(), transaction.atomic():
                row = Moment.objects.select_for_update().get(pk=moment.pk)
                if not WorldActionRuntime.objects.filter(pk=runtime_id, token=token).exists(): return
                if row.image_state.get('request') != state['request']: return
                # 查询按钮可能在原调用进行时提交，保留最新的人工处理意愿。
                if row.image_state.get('manual'):
                    state['manual'] = True
                    if state['status'] == 'manual':
                        state['status'] = 'generating'
                        state.pop('error', None)
                if result['status'] == 'succeeded' and row.is_valid and len(row.images) < 9:
                    row.images = list(dict.fromkeys([*row.images, result['asset_id']]))
                row.image_state = state; row.save()
                if state['status'] not in ('pending', 'generating'):
                    WorldActionRuntime.objects.filter(pk=runtime_id, token=token).update(enabled=False)
        except Exception as exc:
            state.update(status='failed', error=str(exc)[:1000])
            with farm_gate(), transaction.atomic():
                row = Moment.objects.select_for_update().get(pk=moment.pk)
                if not WorldActionRuntime.objects.filter(pk=runtime_id, token=token).exists(): return
                if row.image_state.get('request') != state.get('request'): return
                row.image_state = state
                row.save()
                WorldActionRuntime.objects.filter(pk=runtime_id, token=token).update(enabled=False)


def recover_images(*, manual_only: bool = False) -> None:
    from system_settings.models import WorldActionRuntime
    rows = Moment.objects.filter(is_valid=True, image_state__status__in=['pending', 'generating'])
    if manual_only:
        rows = rows.filter(image_state__manual=True)
    handled = 0
    for row in rows.order_by('created_at').iterator():
        if row.image_state.get('manual'):
            allowed = WorldActionRuntime.objects.filter(pk=image_runtime_id(row.pk), enabled=True).exists()
        else:
            config = SocialConfig.objects.filter(pk=row.owner_id).first()
            allowed = config and settings_for(config, row.actor_id[9:])['enabled']
        if allowed:
            handled += 1
            try:
                recover_image(row)
            except Exception:
                logging.getLogger(__name__).exception('朋友圈配图恢复失败 moment=%s', row.pk)
            if handled >= 10: break
