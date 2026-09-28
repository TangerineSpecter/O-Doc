from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from system_settings.agent_world.travel_seed import SEED_PATH, initialize_travel_destinations


class Command(BaseCommand):
    help = '离线初始化旅行城市，只补入缺失记录，不覆盖已有价格和启用状态'

    def add_arguments(self, parser):
        parser.add_argument('--csv-path', type=Path, default=SEED_PATH)

    def handle(self, *args, **options):
        try:
            added = initialize_travel_destinations(options['csv_path'])
        except (OSError, ValueError) as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f'旅行城市初始化完成：本次补入 {added} 条'))
