from django.core.management.base import BaseCommand
from system_settings.agent_world.travel_models import TravelJourney
from system_settings.agent_world.travel_memory import remember_travel


class Command(BaseCommand):
    help = '将已返程的旅行经历补入 Agent 长期记忆，重复运行保留现有记忆及归档状态'

    def handle(self, *args, **options):
        count = 0
        for journey in TravelJourney.objects.filter(status='completed', departed_at__isnull=False, returned_at__isnull=False).iterator():
            if remember_travel(journey):
                count += 1
        self.stdout.write(f'已检查 {count} 条旅行记忆')
