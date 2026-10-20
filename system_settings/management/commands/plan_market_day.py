"""为居民生成当日市场规划；默认跳过已生成或已失败的当天计划。"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from system_settings.agent_world.life_config import effective_settings
from system_settings.agent_world.life_models import LifeConfig
from system_settings.agent_world.market_planning import ensure_plan
from system_settings.models import Agent


class Command(BaseCommand):
    help = '生成当日市场规划（预算、采购目标、装备目标）'

    def add_arguments(self, parser):
        parser.add_argument('--owner', help='只处理该账号')
        parser.add_argument('--agent', help='只处理该居民')

    def handle(self, *args, **options):
        configs = LifeConfig.objects.filter(migrated=True)
        if options['owner']:
            configs = configs.filter(pk=options['owner'])
        now = timezone.now()
        done = 0
        for config in configs:
            agent_ids = effective_settings(config, now).get('agent_ids', [])
            if options['agent']:
                agent_ids = [actor for actor in agent_ids if actor == options['agent']]
            for actor_id in agent_ids:
                if not Agent.objects.filter(pk=actor_id, archived_at__isnull=True).exists():
                    continue
                plan = ensure_plan(config.pk, actor_id, now)
                if plan:
                    done += 1
                    self.stdout.write(f'{actor_id}: {plan.plan_date} {plan.status} budget={plan.budget}')
        self.stdout.write(f'已处理 {done} 位居民。')
