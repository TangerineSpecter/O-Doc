"""只读预览旧版检查点覆盖范围；旧版删除入口已停用。"""
from django.core.management.base import BaseCommand, CommandError

from system_settings.agent_world.combat.archive import archive_owners
from system_settings.agent_world.combat.migration_guard import CombatBackfillProtected, LegacyCombatArchiveDisabled


class Command(BaseCommand):
    help = (
        '只读预览旧版检查点覆盖的战斗事实；旧版实际删除已停用。'
    )

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=7, help='保留最近多少天的战斗事实，默认 7')
        parser.add_argument('--owner', default='', help='只处理指定账号')
        parser.add_argument('--apply', action='store_true', help='旧版实际删除入口（现已停用）')

    def handle(self, *args, **options):
        days = options['days']
        if days < 1:
            # 0 或负数会把 cutoff 推到当前/未来，等于删除全部可回放事实。
            self.stderr.write(self.style.ERROR('--days 必须是正整数（1 起）；旧版实际归档已停用'))
            return
        try:
            results = archive_owners(options['owner'] or None, days, apply=options['apply'])
        except (CombatBackfillProtected, LegacyCombatArchiveDisabled) as exc:
            raise CommandError(str(exc)) from exc
        total = sum(item.get('archived', 0) for item in results)
        for item in results:
            if item.get('archived'):
                self.stdout.write(f"居民 {item['actor']}：旧版预览覆盖 {item['archived']} 条，边界 {item['boundary']}")
            elif item.get('reason'):
                self.stdout.write(f"居民 {item['actor']}：跳过（{item['reason']}）")
        self.stdout.write(self.style.WARNING(f'旧版预览覆盖 {total} 条事实；旧版删除已停用，不能当作七天可清理数量'))
