"""Backfill synchronized daily contributions for completed fishing trips."""
import json

from django.core.management.base import BaseCommand, CommandError

from system_settings.agent_world.fishing.daily_backfill import backfill, backfill_batch
from utils.sync_policy import SyncError


class Command(BaseCommand):
    help = '在回填保护下生成已结束出钓的每日贡献；不删除钓鱼事实。'

    def add_arguments(self, parser):
        parser.add_argument('--owner', default='')
        parser.add_argument('--trip', default='')
        parser.add_argument('--after', default='')
        parser.add_argument('--limit', type=int, default=5)
        parser.add_argument('--max-source-rows', type=int, default=20000)
        parser.add_argument('--max-seconds', type=int, default=10)

    def handle(self, *args, **options):
        limit = options['max_source_rows']
        if not 1 <= limit <= 50000:
            raise CommandError('--max-source-rows 必须在 1 至 50000 之间')
        if options['trip'] and not options['owner']:
            raise CommandError('指定 --trip 时必须同时指定 --owner')
        try:
            if options['trip']:
                result = backfill(options['owner'], options['trip'], max_source_rows=limit)
            else:
                result = backfill_batch(options['owner'] or None, after=options['after'], limit=options['limit'],
                                        max_source_rows=limit, max_seconds=options['max_seconds'])
        except (ValueError, KeyError, TypeError, SyncError) as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
