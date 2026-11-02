"""Show a compact daily kill projection for a single completed party."""
import json

from django.core.management.base import BaseCommand, CommandError

from system_settings.agent_world.combat.party_daily_preview import preview
from utils.sync_policy import SyncError


class Command(BaseCommand):
    help = '只读预览一场已结束组队冒险的每日击杀贡献；不写入汇总或清理数据。'

    def add_arguments(self, parser):
        parser.add_argument('--owner', required=True, help='账号 ID')
        parser.add_argument('--party', required=True, help='共同冒险 ID')
        parser.add_argument('--max-source-rows', type=int, default=20000,
                            help='最多读取的来源行数，默认 20000，最多 50000')

    def handle(self, *args, **options):
        limit = options['max_source_rows']
        if not 1 <= limit <= 50000:
            raise CommandError('--max-source-rows 必须在 1 至 50000 之间')
        try:
            result = preview(options['owner'], options['party'], max_source_rows=limit)
        except (ValueError, KeyError, TypeError, SyncError) as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
