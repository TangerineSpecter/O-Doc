"""一次性补齐旧农场目录缺少的内置作物与肥料，只增不改。

目录此前只在首次创建时写入完整默认值，之后新增的内置项仅在读取时于内存补齐，库里的旧目录从未更新。
已有的自定义价格、图标关联和其他规则原样保留；不删除任何键。
"""
import copy
import logging

from django.db import migrations

from .data.farm_catalog_builtin_v1 import CROPS, FERTILIZERS

logger = logging.getLogger(__name__)


def backfill(apps, schema_editor):
    Catalog = apps.get_model('system_settings', 'FarmCatalog')
    for catalog in Catalog.objects.using(schema_editor.connection.alias).all():
        rules = catalog.rules
        if not isinstance(rules, dict):
            continue  # 无法解释的目录不在迁移里猜测，交给 repair_agent_world_catalog 报告
        updated = copy.deepcopy(rules)
        updated.setdefault('item_icons', {})
        updated.setdefault('fertilizers', copy.deepcopy(FERTILIZERS))
        crops = updated.setdefault('crops', {})
        added = [kind for kind in CROPS if kind not in crops]
        for kind in added:
            crops[kind] = copy.deepcopy(CROPS[kind])
        if updated != rules:
            catalog.rules = updated
            catalog.save(update_fields=['rules', 'updated_at'])
            logger.warning('农场目录已补齐内置项 owner=%s crops=%s', catalog.pk, added)


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0074_agenttask_mcp_tool_scope'),
    ]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
