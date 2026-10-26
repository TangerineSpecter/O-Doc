"""在每位居民的事实链尾追加检查点，为战斗事实归档提供滚动基线。"""
from django.core.management.base import BaseCommand

from system_settings.agent_world.combat.archive import checkpoint_all


class Command(BaseCommand):
    help = '为战斗事实链追加检查点；建议每天执行一次，归档以检查点作为删减边界。'

    def handle(self, *args, **options):
        created, skipped = checkpoint_all()
        for item in skipped:
            self.stdout.write(self.style.WARNING(f"居民 {item['actor']} 跳过：{item['reason']}"))
        self.stdout.write(self.style.SUCCESS(f'已追加 {created} 个战斗检查点'))
