"""Inspect retention coverage and source gaps without changing business data."""
import json

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from system_settings.agent_world.farm_gate import farm_gate
from system_settings.agent_world.combat.models import Exploration
from system_settings.agent_world.combat.retention_cleanup import _candidates
from system_settings.agent_world.combat.retention_policy import retention_window
from system_settings.agent_world.combat.retention_gate import inspect_statistics_backlog


class Command(BaseCommand):
    help = '只读检查战斗统计阻断、隔离历史缺口和当前保留窗口的清理候选；不写摘要、不删除事实。'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=20)

    def handle(self, *args, **options):
        limit = options['limit']
        if not 1 <= limit <= 100:
            raise CommandError('--limit 必须在 1 至 100 之间')
        try:
            days, cutoff = retention_window(timezone.now())
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        with farm_gate(), transaction.atomic():
            status = inspect_statistics_backlog()
            parties, solos = _candidates(cutoff, limit)
            gaps = list(Exploration.objects.filter(pk__in=status['historical_solo_gap_ids'])
                        .order_by('ended_at', 'pk').values('id', 'actor_name', 'ended_at')[:limit])
            result = {'retention_days': days, 'retention_cutoff': cutoff, 'statistics': status, 'historical_gap_sample': gaps,
                      'candidate_parties': parties, 'candidate_solos': solos,
                      'cleanup_ready': False,
                      'note': '缺口不补造出发事实、不生成结算、不删除原数据。候选仍须在清理事务中校验全部来源链、资产及恢复快照。'}
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2, default=str))
