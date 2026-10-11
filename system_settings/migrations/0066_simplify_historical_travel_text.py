"""升级时自动备份并转换已结束旅行的中文展示内容。"""
import json
import logging
import math
import os
import re
import uuid
from pathlib import Path

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.db import migrations
from django.utils import timezone

from .data.travel_text_repair_v1 import changes_for_journey
from .data.travel_inventory_integrity_v1 import checkpoint_changes

logger = logging.getLogger(__name__)


def apply(apps, schema_editor):
    alias = schema_editor.connection.alias
    Journey = apps.get_model('system_settings', 'TravelJourney')
    changes = []
    for journey in Journey.objects.using(alias).select_for_update().filter(
            status__in=['completed', 'skipped']).order_by('pk'):
        changes.extend(changes_for_journey(journey, apps, alias))
    if not changes:
        return
    # Historical senders do not run the current market/cooking checkpoint receivers.
    changes.extend(checkpoint_changes(changes, apps, alias))
    # 生产 Compose 已持久化该目录，备份不放进可公开访问的用户媒体目录。
    directory = Path(settings.SYSTEM_LOG_DIR).expanduser().resolve() / 'travel-text-backups'
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f'0066-{timezone.now():%Y%m%d-%H%M%S}-{uuid.uuid4().hex}.json'
    payload = {'format': 'odoc-travel-text-backup-v1', 'migration': '0066', 'records': [
        {'model': row._meta.label_lower, 'id': str(row.pk),
         'before': {key: getattr(row, key) for key in values}, 'after': values}
        for row, values in changes
    ]}
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, cls=DjangoJSONEncoder, ensure_ascii=False, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    # 备份完成后才写入；迁移失败由数据库事务整体回滚，原始字段备份仍保留。
    for row, values in changes:
        fields = list(values)
        for key, value in values.items():
            setattr(row, key, value)
        if row._meta.label_lower == 'article.article':
            row.is_rag_synced = False
            plain = re.sub(r'[#*`>~-]', '', row.content or '').strip()
            row.word_count = len(plain)
            row.read_time = math.ceil(row.word_count / 400) if row.word_count else 0
            fields += ['is_rag_synced', 'word_count', 'read_time', 'updated_at']
        elif row._meta.label_lower != 'system_settings.travelnode' and hasattr(row, 'updated_at'):
            fields.append('updated_at')
        if 'updated_at' in fields:
            row.updated_at = timezone.now()
        # 通用修订信号按模型 label 跟踪历史 sender；资产检查点已显式列入 changes。
        row.save(using=alias, update_fields=fields)
    logger.info('旅行历史文本已转为简体：%s 条关联记录；原始字段备份：%s', len(changes), path)


class Migration(migrations.Migration):
    dependencies = [
        ('system_settings', '0065_agenttask_memo_config_alter_agenttask_task_kind'),
        ('article', '0026_alter_article_source_url'),
    ]
    operations = [migrations.RunPython(apply, migrations.RunPython.noop)]
