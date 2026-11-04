"""Run small, resumable pages of the protected party statistics backfill."""
import json
import time

from django.core.management.base import BaseCommand, CommandError

from system_settings.agent_world.combat.migration_guard import is_protected
from system_settings.agent_world.combat.party_daily_backfill import DEFAULT_ACTOR_ROWS, backfill_batch

MAX_REPORTED_FAILURES = 100


class Command(BaseCommand):
    help = '在回填保护下连续处理多批组队每日贡献，每批释放锁，不删除原始事实。'

    def add_arguments(self, parser):
        parser.add_argument('--owner', default='')
        parser.add_argument('--after', default='')
        parser.add_argument('--batch-size', type=int, default=10)
        parser.add_argument('--batch-seconds', type=int, default=10)
        parser.add_argument('--max-seconds', type=int, default=60)
        parser.add_argument('--max-batches', type=int, default=20)
        parser.add_argument('--pause-seconds', type=float, default=0.5)
        parser.add_argument('--max-source-rows', type=int, default=20000)
        parser.add_argument('--max-actor-rows', type=int, default=DEFAULT_ACTOR_ROWS)

    def handle(self, *args, **options):
        if not is_protected():
            raise CommandError('请先在本进程启用 ODOC_COMBAT_BACKFILL_PROTECT=1，并按方案隔离同步写入')
        if (not 1 <= options['batch_size'] <= 50 or not 1 <= options['batch_seconds'] <= 60
                or not 1 <= options['max_seconds'] <= 3600 or not 1 <= options['max_batches'] <= 1000
                or not 0 <= options['pause_seconds'] <= 5):
            raise CommandError('批次大小、时间或间隔超出允许范围')
        started = time.monotonic()
        cursor = options['after']
        summary = {'batches': 0, 'processed': 0, 'created': 0, 'failures': [], 'failures_total': 0,
                   'failure_details_truncated': False,
                   'has_more': True, 'next_after': cursor, 'stop_reason': 'batch_limit', 'cleanup_ready': False}
        while summary['batches'] < options['max_batches']:
            remaining = options['max_seconds'] - (time.monotonic() - started)
            if remaining < 1 and summary['batches']:
                summary['stop_reason'] = 'time_limit'
                break
            try:
                result = backfill_batch(options['owner'] or None, after=cursor, limit=options['batch_size'],
                    max_source_rows=options['max_source_rows'], max_actor_rows=options['max_actor_rows'],
                    max_seconds=max(1, min(options['batch_seconds'], int(remaining))))
            except ValueError as exc:
                raise CommandError(str(exc)) from exc
            summary['batches'] += 1
            summary['processed'] += result['processed']
            summary['created'] += result['created']
            summary['failures_total'] += len(result['failures'])
            available = MAX_REPORTED_FAILURES - len(summary['failures'])
            summary['failures'].extend(result['failures'][:available])
            summary['failure_details_truncated'] = summary['failures_total'] > len(summary['failures'])
            summary['has_more'] = result['has_more']
            cursor = result['next_after']
            summary['next_after'] = cursor if result['has_more'] else ''
            if not result['has_more']:
                summary['stop_reason'] = 'complete_with_failures' if summary['failures_total'] else 'complete'
                break
            if not result['processed']:
                summary['stop_reason'] = 'no_progress'
                break
            remaining = options['max_seconds'] - (time.monotonic() - started)
            if remaining < 1:
                summary['stop_reason'] = 'time_limit'
                break
            if options['pause_seconds']:
                time.sleep(min(options['pause_seconds'], max(0, remaining - 1)))
        self.stdout.write(json.dumps(summary, ensure_ascii=False, indent=2))
