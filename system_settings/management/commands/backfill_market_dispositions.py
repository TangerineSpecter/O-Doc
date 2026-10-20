"""把历史可交易库存补进处置标记队列；默认只入队，不调用模型。"""
from django.core.management.base import BaseCommand, CommandError

from system_settings.agent_world.market_disposition import aggregate, enqueue
from system_settings.agent_world.market_disposition_worker import run
from system_settings.agent_world.travel_models import AgentInventoryItem
from system_settings.models import Agent


class Command(BaseCommand):
    help = '扫描历史背包，把可交易 sku 加入市场处置待标记队列；--run 同时处理队列'

    def add_arguments(self, parser):
        parser.add_argument('--owner', help='只处理该账号')
        parser.add_argument('--agent', help='只处理该居民')
        parser.add_argument('--run', action='store_true', help='入队后立即运行标记 worker')
        parser.add_argument('--limit', type=int, default=20, help='本次最多询问的问题数')
        parser.add_argument('--seconds', type=int, default=60, help='本次 worker 最长秒数')

    def handle(self, *args, **options):
        rows = AgentInventoryItem.objects.values_list('owner_id', 'actor_id').distinct()
        if options['owner']:
            rows = rows.filter(owner_id=options['owner'])
        if options['agent']:
            rows = rows.filter(actor_id=options['agent'])
        pairs = list(rows)
        if not pairs:
            raise CommandError('没有匹配的背包记录')

        queued = 0
        actors = set()
        for owner, actor_id in pairs:
            if not Agent.objects.filter(pk=actor_id, archived_at__isnull=True).exists():
                continue
            actors.add((owner, actor_id))
            for entry in aggregate(owner, actor_id):
                if entry['quantity'] <= 0:
                    continue
                enqueue(owner, actor_id, entry['sku'], entry['quantity'],
                        source='backfill', operation='backfill')
                queued += 1
        self.stdout.write(f'已扫描 {len(actors)} 位居民，入队 {queued} 个 sku。')
        if options['run']:
            result = run(limit=options['limit'], seconds=options['seconds'])
            self.stdout.write(f"标记 worker：处理 {result['processed']} 个任务，"
                              f"剩余问题额度 {result['remaining_questions']}，待处理 {result['pending']}。")
