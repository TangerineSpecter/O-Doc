import json
import os
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction

from system_settings.agent_world.farm_gate import farm_gate
from system_settings.agent_world.travel_models import TravelJourney
from system_settings.agent_world.travel_text_repair import changes_for_journey


class Command(BaseCommand):
    help = '预览历史旅行简体修复；--apply --backup 指定新备份文件后才写入，不调用模型或结算'

    def add_arguments(self, parser):
        parser.add_argument('--journey-id', action='append', help='只处理指定旅行，可重复传入')
        parser.add_argument('--owner-id', help='只处理指定账号')
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--backup', help='保存原始字段的新 JSON 文件；不覆盖已有文件')

    def handle(self, *args, **options):
        apply = options['apply']
        if apply and not options['backup']:
            raise CommandError('--apply 必须同时提供 --backup，先备份再写入')
        query = TravelJourney.objects.filter(status__in=['completed', 'skipped'])
        if options['owner_id']:
            query = query.filter(owner_id=options['owner_id'])
        if options['journey_id']:
            query = query.filter(pk__in=options['journey_id'])
            missing = set(options['journey_id']) - set(query.values_list('pk', flat=True))
            if missing:
                raise CommandError('指定旅行不存在、账号不匹配或尚未结束：' + ', '.join(sorted(missing)))
        # 与同步写入互斥，数据库行锁防止文章编辑覆盖；预览不写数据库或备份。
        with farm_gate(), transaction.atomic():
            journeys = query.select_for_update() if apply else query
            changes = []
            for journey in journeys.order_by('pk'):
                planned = changes_for_journey(journey, lock=apply)
                if planned:
                    self.stdout.write(f'旅行 {journey.pk}：{len(planned)} 条关联记录需要转换')
                    changes.extend(planned)
            self.stdout.write(f'{"执行" if apply else "预览"}：共 {len(changes)} 条记录需要修改')
            if not apply or not changes:
                return
            backup = Path(options['backup']).expanduser().resolve()
            payload = {'format': 'odoc-travel-text-backup-v1', 'records': [
                {'model': row._meta.label_lower, 'id': str(row.pk),
                 'before': {key: getattr(row, key) for key in values}, 'after': values}
                for row, values in changes
            ]}
            try:
                descriptor = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
                    json.dump(payload, handle, cls=DjangoJSONEncoder, ensure_ascii=False, indent=2)
                    handle.flush()
                    os.fsync(handle.fileno())
            except OSError as exc:
                raise CommandError(f'备份失败，未写入数据库：{exc}') from exc
            for row, values in changes:
                fields = list(values)
                for key, value in values.items():
                    setattr(row, key, value)
                if row._meta.label_lower == 'article.article':
                    row.is_rag_synced = False
                    fields += ['is_rag_synced', 'word_count', 'read_time', 'updated_at']
                elif row._meta.label_lower != 'system_settings.travelnode' and hasattr(row, 'updated_at'):
                    fields.append('updated_at')
                # save 触发既有 WebDAV 修订，不使用绕过同步跟踪的批量 update。
                row.save(update_fields=fields)
            self.stdout.write(self.style.SUCCESS(f'修复完成，原始字段备份：{backup}'))
