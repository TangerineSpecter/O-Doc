"""Process a bounded page of shared-party daily contributions."""
import json

from django.core.management.base import BaseCommand, CommandError

from system_settings.agent_world.combat.party_daily_backfill import DEFAULT_ACTOR_ROWS, backfill_batch


class Command(BaseCommand):
    help = '在回填保护下分批生成组队每日贡献；不删除原始事实。'

    def add_arguments(self, parser):
        parser.add_argument('--owner', default='')
        parser.add_argument('--after', default='')
        parser.add_argument('--limit', type=int, default=5)
        parser.add_argument('--max-source-rows', type=int, default=20000)
        parser.add_argument('--max-actor-rows', type=int, default=DEFAULT_ACTOR_ROWS)
        parser.add_argument('--max-seconds', type=int, default=10)

    def handle(self, *args, **options):
        try:
            result = backfill_batch(options['owner'] or None, after=options['after'], limit=options['limit'],
                                    max_source_rows=options['max_source_rows'], max_actor_rows=options['max_actor_rows'],
                                    max_seconds=options['max_seconds'])
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
