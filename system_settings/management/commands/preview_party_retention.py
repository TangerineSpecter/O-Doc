"""Read-only seven-day shared-combat retention preview."""
import json

from django.core.management.base import BaseCommand, CommandError

from system_settings.agent_world.combat.retention_preview import inspect_party


class Command(BaseCommand):
    help = '只读检查一场共同冒险的七天时间边界、来源和回合载荷估计；不删除数据。'

    def add_arguments(self, parser):
        parser.add_argument('--owner', required=True)
        parser.add_argument('--party', required=True)
        parser.add_argument('--max-source-rows', type=int, default=20000)

    def handle(self, *args, **options):
        try:
            result = inspect_party(options['owner'], options['party'], max_source_rows=options['max_source_rows'])
        except ValueError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
