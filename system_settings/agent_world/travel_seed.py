"""离线、事务化、只补缺失目的地的初始化。"""
import hashlib
import io
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.db import transaction

from .travel_csv import validate_city_template
from .travel_models import TravelDestination, TravelSeedState

SEED_PATH = Path(settings.BASE_DIR) / 'docs/data/travel_cities_seed.csv'
# 所有设备的初始修订时间一致，避免新设备的原始价格抢赢其他设备的改价。
SEED_UPDATED_AT = datetime(2026, 9, 28, tzinfo=timezone.utc if settings.USE_TZ else None)


def initialize_travel_destinations(path: Path = SEED_PATH, *, using: str = 'default') -> int:
    raw = Path(path).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    states = TravelSeedState.objects.using(using)
    if states.filter(pk=digest).exists():
        return 0
    rows = validate_city_template(io.StringIO(raw.decode('utf-8-sig')), require_prices=True)
    destinations = []
    for row in rows:
        if not row['价格']:
            raise ValueError('正式种子文件的每个城市都必须填写价格（包括禁用城市）')
        fields = dict(country_code=row['国家代码'], country=row['国家'], region=row['省/州'],
                      city=row['城市'], original_name=row['城市原名'])
        for name, value in fields.items():
            if len(value) > TravelDestination._meta.get_field(name).max_length:
                raise ValueError(f"城市 {row['城市ID']} 的 {name} 超出长度限制")
        if len(row['城市ID']) > 32:
            raise ValueError('城市 ID 超出长度限制')
        destinations.append(TravelDestination(id=row['城市ID'], price=Decimal(row['价格']),
                                             enabled=row['启用'] == '1', updated_at=SEED_UPDATED_AT, **fields))
    with transaction.atomic(using=using):
        # 首先锁住同一版本的标记；所有插入和标记提交一起成功或回滚。
        state, created = states.get_or_create(pk=digest, defaults={'row_count': len(rows)})
        if not created:
            return 0
        from system_settings.models import SyncEntityState
        existing = set(TravelDestination.objects.using(using).values_list('pk', flat=True))
        deleted = set(SyncEntityState.objects.using(using).filter(
            model_label='system_settings.traveldestination', is_deleted=True,
        ).values_list('object_pk', flat=True))
        missing = [item for item in destinations if item.pk not in existing and item.pk not in deleted]
        TravelDestination.objects.using(using).bulk_create(missing, batch_size=500)
        return len(missing)
