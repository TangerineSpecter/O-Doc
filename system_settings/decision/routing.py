"""Scene policy and bounded, read-only model fallback; business writes stay outside."""
import json
import time
import logging
from collections.abc import Callable
from openai import APIError, OpenAIError
from requests import RequestException
from utils.ai_service import AIService, AIAuthenticationError
from utils.bounded_completion import complete, AIBoundedRequestError, AIOutputTruncated, AIStreamIncomplete
from utils.completion_options import thinking_options
from utils.ai_observer import check_ai_control, emit_ai_event
from system_settings.models import AIModel, SystemSetting

SCENES = {'fishing_spot': '钓鱼地点选择', 'fishing_duration': '钓鱼时长选择',
          'fishing_bait': '钓鱼携带鱼饵', 'fishing_duel': '鱼王猜拳', 'lottery_quantity': '大乐透购票数量', 'lottery_number': '大乐透逐位选号', 'market': '市场选择', 'market_disposition': '市场处置标记', 'market_equipment': '装备购买判断',
          'market_plan': '市场日规划选择',
          'life_activity': '生活活动选择', 'life_budget': '生活预算选择',
          'farm_queue': '农场种植队列规划',
          'cooking_recipe': '美食菜谱选择', 'cooking_quantity': '美食份数选择',
          'cooking_continue': '美食继续制作', 'cooking_ingredient_strategy': '美食用料策略',
          'alchemy_recipe': '炼金配方选择', 'alchemy_quantity': '炼金瓶数选择',
          'alchemy_continue': '炼金继续制作',
          'social_action': '社交行为选择', 'bounty_accept': '悬赏接单选择',
          'travel_destination': '旅行目的地', 'travel_visit': '旅行游览', 'travel_event': '旅行遭遇',
          'combat_preparation': '迷宫探索准备', 'combat_listing_price': '探索装备挂牌定价'}
# Usage purpose per scene. Exploration preparation shares one purpose on both paths: the
# structured questions here and the single text plan recorded by preparation.prepare.
SCENE_PURPOSES = {'social_action': 'social', 'combat_preparation': 'exploration_prepare'}
logger = logging.getLogger(__name__)
# Each provider owns this window, including its one format repair.
# Earlier hangs do not reduce it and must not skip the next provider.
MODEL_ATTEMPT_SECONDS = 60
MODEL_ERRORS = (AIAuthenticationError, OpenAIError, APIError, RequestException, TimeoutError, AIBoundedRequestError, AIOutputTruncated, AIStreamIncomplete)


class ToolOperationFailure(RuntimeError):
    """A tool failure is not a model failure; restore its state before any retry."""


class InvalidModelOutput(ValueError):
    pass


def owner_for(agent, task=None) -> str | None:
    if task:
        from system_settings.agent_world.life_config import task_owner
        owner = task_owner(task)
        if owner:
            return owner
    identity = getattr(agent, 'pk', None)
    if not identity:
        return None
    from system_settings.agent_world.life_models import LifeProfile
    return LifeProfile.objects.filter(pk=identity).values_list('owner_id', flat=True).first()


def jev_enabled(owner: str | None, scene: str) -> bool:
    if not owner or scene not in SCENES:
        return False
    from system_settings.agent_world.life_models import LifeConfig
    settings = LifeConfig.objects.filter(pk=owner).values_list('settings', flat=True).first() or {}
    return settings.get('jev_enabled', False) is True and scene not in settings.get('jev_excluded_scenes', [])


def candidates(agent, *, task=None, decision=False, owner=None, model_only=False) -> list[str]:
    if model_only:
        identity = getattr(agent, 'model_id', None)
        return [identity] if identity and AIModel.objects.filter(pk=identity, type='chat').exists() else []
    ids = []
    if task and task.model_id:
        ids.append(task.model_id)
    elif decision:
        from system_settings.agent_world.life_models import LifeConfig
        settings = LifeConfig.objects.filter(pk=owner or owner_for(agent)).values_list('settings', flat=True).first() or {}
        ids.append(settings.get('decision_model_id'))
    ids.append(agent.model_id)
    config = SystemSetting.objects.filter(pk='system_ai_config').values_list('value', flat=True).first() or {}
    ids.append(AIService._get_config_value(config, 'defaultChatModelId', 'default_chat_model_id'))
    return list(dict.fromkeys(identity for identity in ids if identity and AIModel.objects.filter(pk=identity, type='chat').exists()))


def report(scene, model_id, exc):
    # No provider bodies or prompts in diagnostics.
    emit_ai_event('model_fallback', f'{scene}：模型失败，尝试下一层', 'warning', model_id=model_id,
                  failure_type=type(exc).__name__)
    logger.warning('Model fallback scene=%s model=%s failure=%s', scene, model_id, type(exc).__name__)


def run_models(agent, invoke: Callable, *, task=None, decision=False, owner=None, deadline=None,
               scene='模型请求', check=None, model_only=False):
    """invoke must perform no replayable writes; tool callers retain their effect ledger.

    ``deadline`` is not a shared pool. A provider that hangs does not stop the
    next provider with 「当前阶段总时限已耗尽」.
    """
    _ = deadline
    models = candidates(agent, task=task, decision=decision, owner=owner, model_only=model_only)
    last = None
    for identity in models:
        check_ai_control()
        if check:
            check()  # Cancellation, leases, authorization are not model failures.
        try:
            config = AIService.get_client_config_for_model(identity)
        except (AIModel.DoesNotExist, ValueError) as exc:
            last = exc
            report(scene, identity, exc)
            continue
        try:
            from utils.token_usage import usage_scope
            with usage_scope(agent=agent, task=task, owner_id=owner, phase=scene):
                result = invoke(config)
        except MODEL_ERRORS + (InvalidModelOutput,) as exc:
            last = exc
            report(scene, identity, exc)
            continue
        check_ai_control()
        if check:
            check()
        return result
    if last:
        raise last
    raise ValueError('未配置可用的任务、Agent 或系统默认对话模型')


def complete_json(agent, prompt: str, validate: Callable, *, task=None, decision=False, owner=None,
                  deadline=None, seconds=180, scene='模型请求', check=None, max_tokens=None, passthrough=(),
                  model_only=False, repair_invalid=True, attempt_seconds=None):
    # Callers still pass a stage clock. It does not size or cancel later providers.
    _ = (deadline, seconds)
    window_seconds = MODEL_ATTEMPT_SECONDS if attempt_seconds is None else float(attempt_seconds)
    if not 0 < window_seconds < float('inf'):
        raise ValueError('模型等待时间必须为正数')
    def invoke(config):
        # Repair budget and prompt stay on this provider. A previous provider's
        # invalid or empty output must not shorten or rewrite the next request.
        repair_used = False
        text = prompt
        model_deadline = time.monotonic() + window_seconds
        while True:
            remaining = model_deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('当前模型时限已耗尽')
            attempt = min(remaining, window_seconds)
            raw = complete(config, text, json_output=True, extra_body=thinking_options(config),
                           max_tokens=max_tokens, deadline_seconds=attempt, max_deadline_seconds=attempt,
                           allow_retries=False)
            if check:
                check()
            try:
                cleaned = AIService.strip_thinking(raw).strip() if isinstance(raw, str) else ''
                if not cleaned:
                    raise ValueError('模型返回内容为空')
                value = json.loads(cleaned.removeprefix('```json').removeprefix('```').removesuffix('```').strip())
                if not isinstance(value, dict):
                    raise ValueError('输出必须是对象')
                return validate(value)
            except (ValueError, TypeError, KeyError) as exc:
                if isinstance(exc, passthrough):
                    raise
                reason = 'JSON 格式无效' if isinstance(exc, json.JSONDecodeError) else str(exc)[:200]
                if repair_used or not repair_invalid:
                    raise InvalidModelOutput('模型输出未通过场景校验：' + reason) from exc
                repair_used = True
                text = prompt + '\n上次输出未通过校验，请只返回规定JSON并遵守候选与字段要求。校验原因：' + reason
    return run_models(agent, invoke, task=task, decision=decision, owner=owner, deadline=deadline,
                      scene=scene, check=check, model_only=model_only)


def choose_connections(owner, state, choices, *, deadline, instructions=None, question_id='next_action',
                       max_probability=False, scene='决策选择'):
    """Try decision connections in failover order. Each call owns its own minute.

    The caller deadline only decides whether the chain starts. A hang does not
    skip the next connection or the separate text-model minute. Raises
    DecisionUnavailable after every connection fails, or TimeoutError when the
    deadline had already passed.
    """
    from .jev import REQUEST_TIMEOUT_SECONDS, choose, DecisionUnavailable
    from .failover import attempt_plan, clear_sticky, remember_success
    check_ai_control()
    if time.monotonic() >= deadline:
        raise TimeoutError('当前阶段总时限已耗尽')
    ids, sticky_id = attempt_plan(owner)
    prompt = instructions or '根据人物偏好和当前真实条件，从合法候选中选择一个。未执行计划不是经历。'
    saw_sticky_failure = False
    last = None
    for connection_id in ids:
        check_ai_control()
        try:
            result, confidence = choose(
                owner, state, choices, deadline=time.monotonic() + REQUEST_TIMEOUT_SECONDS,
                instructions=prompt, question_id=question_id, connection_id=connection_id,
                max_probability=max_probability)
        except (DecisionUnavailable, TimeoutError) as exc:
            last = exc
            if connection_id == sticky_id:
                saw_sticky_failure = True
            report(scene, f'decision:{connection_id}', exc)
            continue
        check_ai_control()
        remember_success(owner, connection_id)
        return result, confidence
    if saw_sticky_failure:
        clear_sticky(owner)
    raise last or DecisionUnavailable('没有可用的决策模型连接')


def choose_scene(owner, agent, scene, state, choices, *, deadline, question_id=None,
                 instructions=None, include_role=True, max_probability=False, return_confidence=False,
                 task=None):
    """None means use the normal model. Empty/sole choices never call a provider."""
    if not choices:
        return None
    if len(choices) == 1:
        result = next(iter(choices))
        return (result, 1.0) if return_confidence else result
    if not jev_enabled(owner, scene) or len(choices) > 255:
        return None
    from .jev import DecisionUnavailable
    from system_settings.agent_role import role_text
    from utils.token_usage import usage_scope
    decision_state = ({'role': role_text(agent, 'social' if scene == 'social_action' else 'decision'),
                       'context': state} if include_role else state)
    # A scene answered for a task belongs to that task, even when it also has a scene purpose.
    if task:
        purpose = 'task'
    else:
        purpose = SCENE_PURPOSES.get(scene) or ('task' if scene.startswith('travel_') else 'planning')
    try:
        with usage_scope(owner_id=owner, agent=agent, task=task, purpose=purpose, phase=SCENES[scene]):
            result, confidence = choose_connections(
                owner, decision_state, choices, deadline=deadline, instructions=instructions,
                question_id=question_id or scene, max_probability=max_probability, scene=scene)
    except DecisionUnavailable:
        return None
    except TimeoutError as exc:
        # Market calls choose_connections directly and still stops on its own clock.
        # Schedule and travel callers treat None as the text-model path.
        report(scene, 'decision:deadline', exc)
        return None
    return (result, confidence) if return_confidence else result
