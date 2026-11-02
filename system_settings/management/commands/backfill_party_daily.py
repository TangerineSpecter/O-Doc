"""Backfill a single verified party into synchronized daily contributions."""
import json

from django.core.management.base import BaseCommand, CommandError

from system_settings.agent_world.combat.party_daily_backfill import DEFAULT_ACTOR_ROWS, MAX_ACTOR_ROWS, backfill
from system_settings.agent_world.combat.party_daily_preview import preview
from utils.sync_policy import SyncError


class Command(BaseCommand):
    help = '预览或回填单场结束会话的每日击杀贡献；不删除原始事实。'

    def add_arguments(self, parser):
        parser.add_argument('--owner', required=True)
        parser.add_argument('--party', required=True)
        parser.add_argument('--max-source-rows', type=int, default=20000)
        parser.add_argument('--max-actor-rows', type=int, default=DEFAULT_ACTOR_ROWS)
        parser.add_argument('--apply', action='store_true', help='在回填保护启用时写入可同步贡献')

    def handle(self, *args, **options):
        limit = options['max_source_rows']
        if not 1 <= limit <= 50000:
            raise CommandError('--max-source-rows 必须在 1 至 50000 之间')
        if not 1 <= options['max_actor_rows'] <= MAX_ACTOR_ROWS:
            raise CommandError(f'--max-actor-rows 必须在 1 至 {MAX_ACTOR_ROWS} 之间')
        try:
            if options['apply']:
                result = backfill(options['owner'], options['party'], max_source_rows=limit,
                                  max_actor_rows=options['max_actor_rows'])
            else:
                result = preview(options['owner'], options['party'], max_source_rows=limit)
        except (ValueError, KeyError, TypeError, SyncError) as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
