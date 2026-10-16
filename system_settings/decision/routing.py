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

SCENES = {'market': '市场选择', 'life_activity': '生活活动选择', 'life_budget': '生活预算选择',
          'cooking_recipe': '美食菜谱选择', 'cooking_quantity': '美食份数选择',
          'cooking_continue': '美食继续制作', 'cooking_ingredient_strategy': '美食用料策略',
          'social_action': '社交行为选择',
          'travel_destination': '旅行目的地', 'travel_visit': '旅行游览', 'travel_event': '旅行遭遇',
          'combat_preparation': '迷宫探索准备', 'combat_listing_price': '探索装备挂牌定价'}
logger = logging.getLogger(__name__)
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


def candidates(agent, *, task=None, decision=False, owner=None) -> list[str]:
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
               scene='模型请求', check=None):
    """invoke must perform no replayable writes; tool callers retain their effect ledger."""
    models = candidates(agent, task=task, decision=decision, owner=owner)
    last = None
    for identity in models:
        check_ai_control()
        if check:
            check()  # Cancellation, leases, authorization are not model failures.
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError('当前阶段总时限已耗尽')
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
                  deadline=None, seconds=180, scene='模型请求', check=None, max_tokens=None, passthrough=()):
    deadline = deadline if deadline is not None else time.monotonic() + seconds
    repair_used = False
    def invoke(config):
        nonlocal repair_used
        text = prompt
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('当前阶段总时限已耗尽')
            raw = complete(config, text, json_output=True, extra_body=thinking_options(config),
                           max_tokens=max_tokens, deadline_seconds=remaining, max_deadline_seconds=seconds,
                           allow_retries=False)
            if check:
                check()
            try:
                value = json.loads(AIService.strip_thinking(raw).strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip())
                if not isinstance(value, dict):
                    raise ValueError('输出必须是对象')
                return validate(value)
            except (ValueError, TypeError, KeyError) as exc:
                if isinstance(exc, passthrough):
                    raise
                reason = 'JSON 格式无效' if isinstance(exc, json.JSONDecodeError) else str(exc)[:200]
                if repair_used:
                    raise InvalidModelOutput('模型输出未通过场景校验：' + reason) from exc
                repair_used = True
                text = prompt + '\n上次输出未通过校验，请只返回规定JSON并遵守候选与字段要求。校验原因：' + reason
    return run_models(agent, invoke, task=task, decision=decision, owner=owner, deadline=deadline,
                      scene=scene, check=check)


def choose_scene(owner, agent, scene, state, choices, *, deadline, question_id=None,
                 instructions=None, include_role=True, max_probability=False, return_confidence=False):
    """None means use the normal model. Empty/sole choices never call a provider."""
    if not choices:
        return None
    if len(choices) == 1:
        result = next(iter(choices))
        return (result, 1.0) if return_confidence else result
    if not jev_enabled(owner, scene) or len(choices) > 255:
        return None
    from .jev import choose, DecisionUnavailable
    from .config import selected_connection_id
    from system_settings.agent_role import role_text
    from utils.token_usage import usage_scope
    check_ai_control()
    if time.monotonic() >= deadline:
        raise TimeoutError('当前阶段总时限已耗尽')
    try:
        connection_id = selected_connection_id(owner)
        with usage_scope(owner_id=owner, agent=agent, purpose='social' if scene == 'social_action' else 'task' if scene.startswith('travel_') else 'planning', phase=SCENES[scene]):
            decision_state = ({'role': role_text(agent, 'social' if scene == 'social_action' else 'decision'),
                               'context': state} if include_role else state)
            result, confidence = choose(owner, decision_state, choices, deadline=deadline,
                               instructions=instructions or '根据人物偏好和当前真实条件，从合法候选中选择一个。未执行计划不是经历。',
                               question_id=question_id or scene, connection_id=connection_id,
                               max_probability=max_probability)
        check_ai_control()
        return (result, confidence) if return_confidence else result
    except DecisionUnavailable as exc:
        report(scene, f'decision:{connection_id}', exc)
        return None
