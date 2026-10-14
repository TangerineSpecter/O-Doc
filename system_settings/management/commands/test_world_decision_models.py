"""Compare world decision chat models through the normal life-planning path.

This command makes real provider requests and records their token usage. It only
asks for a one-slot proposal; it never applies the proposal to the world.
"""
import json
import time
from datetime import timedelta
from unittest.mock import patch

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q
from django.utils import timezone

from system_settings.models import AIModel, Agent
from system_settings.agent_world.life_models import LifeConfig, LifeProfile
from system_settings.agent_world.life_budget_policy import allows_spending
from system_settings.agent_world.life_time import local_time


DEFAULT_MODEL_SELECTORS = ('qwen3.8-flash', 'deepseek-v4.1', 'glm-5.3-flash')
TEST_SLOT_ID = 'world-decision-model-test-slot'


def resolve_chat_models(selectors: list[str]) -> list[AIModel]:
    """Resolve model IDs, exact names, or unique name prefixes."""
    models = []
    used_ids = set()
    queryset = AIModel.objects.filter(type='chat').select_related('provider')
    for raw_selector in selectors:
        selector = raw_selector.strip()
        if not selector:
            continue
        exact = list(queryset.filter(
            Q(pk=selector) | Q(name__iexact=selector) | Q(display_name__iexact=selector)
        ).distinct())
        matches = exact or list(queryset.filter(
            Q(name__istartswith=selector) | Q(display_name__istartswith=selector)
        ).distinct())
        if len(matches) != 1:
            if not matches:
                raise CommandError(f'未找到对话模型：{selector}')
            names = ', '.join(f'{model.display_name or model.name} [{model.pk}]' for model in matches)
            raise CommandError(f'模型选择不唯一「{selector}」：{names}；请传入模型 ID')
        model = matches[0]
        if model.pk in used_ids:
            raise CommandError(f'模型重复指定：{model.display_name or model.name}')
        used_ids.add(model.pk)
        models.append(model)
    if not models:
        raise CommandError('请至少指定一个对话模型')
    return models


def comparison_context(context: dict, scheduled_at) -> dict:
    """Give each model the same one-slot, no-spending decision opportunity."""
    free_activities = [
        dict(activity) for activity in context.get('activities', [])
        if isinstance(activity, dict)
        and isinstance(activity.get('kind'), str)
        and not allows_spending(activity['kind'])
    ]
    return {
        **context,
        'activities': free_activities,
        'slots': [{
            'id': TEST_SLOT_ID,
            'time': scheduled_at.isoformat(),
            'current_activity': 'unplanned',
            'spent': '0.00',
        }],
    }


class Command(BaseCommand):
    help = '真实调用世界决策模型并比较生活规划输出；不会固化计划或推进世界状态。'

    def add_arguments(self, parser):
        parser.add_argument('--agent-id', required=True, help='世界中的居民 ID')
        parser.add_argument(
            '--models',
            default=','.join(DEFAULT_MODEL_SELECTORS),
            help='逗号分隔的模型 ID、完整名称或唯一名称前缀；默认使用截图中的三个模型名',
        )

    def handle(self, *args, **options):
        agent = Agent.objects.filter(pk=options['agent_id'], archived_at__isnull=True).first()
        if not agent:
            raise CommandError('居民不存在或已归档')
        profile = LifeProfile.objects.filter(pk=agent.pk).first()
        if not profile:
            raise CommandError('该居民尚未加入世界，无法构造真实生活决策上下文')
        if not LifeConfig.objects.filter(pk=profile.owner_id).exists():
            raise CommandError('该居民的世界配置不存在，测试未做任何更改')

        selectors = options['models'].split(',')
        models = resolve_chat_models(selectors)
        for model in models:
            if not model.provider.api_key:
                raise CommandError(f'提供商「{model.provider.name}」尚未配置 API Key')

        from system_settings.agent_world.life_proposal_context import readonly_proposal_context
        from system_settings.agent_world.life_plan_proposal import propose
        from system_settings.agent_world import life_planner
        from system_settings.agent_world.memory.recall import recall_scope
        from utils.token_usage import usage_scope

        context = readonly_proposal_context(profile.owner_id, agent)
        scheduled_at = local_time(timezone.now()) + timedelta(hours=1)
        context = comparison_context(context, scheduled_at)
        results = []

        with recall_scope():
            for model in models:
                label = model.display_name or model.name
                self.stdout.write(f'正在测试 {label}（{model.provider.name}）…')
                started = time.monotonic()
                try:
                    # Keep the production prompt, completion adapter, JSON parsing,
                    # and proposal validation. Override only model selection in memory.
                    with usage_scope(agent=agent, owner_id=profile.owner_id, purpose='planning'):
                        with patch(
                            'system_settings.decision.routing.candidates',
                            return_value=[model.pk],
                        ), patch('system_settings.agent_world.life_activity_decision.jev_enabled', return_value=False):
                            proposal = propose(agent, context, life_planner.ask)
                    selection = proposal['plans'][0]
                    result = {
                        'model': label,
                        'provider': model.provider.name,
                        'status': 'success',
                        'activity': selection['activity'],
                        'reason': selection['reason'],
                        'elapsed_seconds': round(time.monotonic() - started, 1),
                    }
                except Exception as exc:
                    result = {
                        'model': label,
                        'provider': model.provider.name,
                        'status': 'failed',
                        'error_type': type(exc).__name__,
                        'elapsed_seconds': round(time.monotonic() - started, 1),
                    }
                    status_code = getattr(exc, 'status_code', None)
                    if type(status_code) is int:
                        result['http_status'] = status_code
                results.append(result)
                self.stdout.write(json.dumps(result, ensure_ascii=False))

        succeeded = sum(result['status'] == 'success' for result in results)
        self.stdout.write(f'完成：{succeeded}/{len(results)} 个模型返回并通过规划校验。')
        self.stdout.write('结果只包含测试提议；世界日程和居民资产未被修改。')
