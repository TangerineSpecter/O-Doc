"""降低默认城市价格；已固定机会、旅行和账本不追溯调整。"""
import json
from decimal import Decimal
from pathlib import Path

from django.db import migrations
from django.utils import timezone


def reduce_default_prices(apps, schema_editor):
    Destination = apps.get_model('system_settings', 'TravelDestination')
    alias = schema_editor.connection.alias
    groups = json.loads((Path(__file__).parent / 'data/0042_travel_price_reduction.json').read_text())
    now = timezone.now()
    for old, identifiers in groups.items():
        old_price = Decimal(old)
        # 稳定 ID + 旧默认值匹配：保留人工定价，重复调用不再打折。
        for offset in range(0, len(identifiers), 500):
            Destination.objects.using(alias).filter(
                pk__in=identifiers[offset:offset + 500], price=old_price,
            ).update(price=old_price * Decimal('.25'), updated_at=now)


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0041_travel_city_cleanup')]
    operations = [migrations.RunPython(reduce_default_prices, migrations.RunPython.noop)]
