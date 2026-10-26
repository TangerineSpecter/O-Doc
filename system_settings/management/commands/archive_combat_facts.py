"""删除已被旧检查点覆盖的战斗事实，只保留最近一段与结算数据。"""
from django.core.management.base import BaseCommand

from system_settings.agent_world.combat.archive import archive_owners


class Command(BaseCommand):
    help = (
        '归档战斗事实：删除保留期之前、且已被检查点覆盖的 CombatFact，'
        '检查点、探索结算与回顾记录保留。建议先运行 checkpoint_combat_history。'
    )

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=7, help='保留最近多少天的战斗事实，默认 7')
        parser.add_argument('--owner', default='', help='只处理指定账号')
        parser.add_argument('--apply', action='store_true', help='实际删除；缺省只统计')

    def handle(self, *args, **options):
        days = options['days']
        if days < 1:
            # 0 或负数会把 cutoff 推到当前/未来，等于删除全部可回放事实。
            self.stderr.write(self.style.ERROR('--days 必须是正整数（1 起）；如需关闭归档请使用环境变量 ODOC_COMBAT_ARCHIVE_DAYS=0'))
            return
        results = archive_owners(options['owner'] or None, days, apply=options['apply'])
        total = sum(item.get('archived', 0) for item in results)
        for item in results:
            if item.get('archived'):
                self.stdout.write(f"居民 {item['actor']}：归档 {item['archived']} 条，边界 {item['boundary']}")
            elif item.get('reason'):
                self.stdout.write(f"居民 {item['actor']}：跳过（{item['reason']}）")
        style = self.style.SUCCESS if options['apply'] else self.style.WARNING
        self.stdout.write(style(f"{'已归档' if options['apply'] else '可归档'} {total} 条战斗事实"))
