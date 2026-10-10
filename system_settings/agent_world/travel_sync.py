"""共享种子目录的稀疏同步；编辑后的默认值仍是一条显式修订。"""
import csv
import hashlib
import io
from functools import lru_cache
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.utils.dateparse import parse_datetime

from .travel_seed import SEED_PATH, SEED_UPDATED_AT

LABEL = 'system_settings.traveldestination'
PREFIX = LABEL + ':'
META_KEY = 'travel_catalog'


@lru_cache(maxsize=2)
def _catalog(path: str, mtime_ns: int, size: int) -> tuple[str, dict]:
    raw = Path(path).read_bytes()
    rows = {}
    for row in csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))):
        rows[row['城市ID']] = {
            'country_code': row['国家代码'], 'country': row['国家'],
            'region': row['省/州'], 'city': row['城市'], 'original_name': row['城市原名'],
            'price': format(Decimal(row['价格']), '.2f'), 'enabled': row['启用'] == '1',
            'updated_at': SEED_UPDATED_AT.isoformat(),
        }
    return hashlib.sha256(raw).hexdigest(), rows


def catalog() -> tuple[str, dict]:
    stat = SEED_PATH.stat()
    return _catalog(str(SEED_PATH), stat.st_mtime_ns, stat.st_size)


def enabled() -> bool:
    from .travel_models import TravelSeedState
    digest, _ = catalog()
    return TravelSeedState.objects.filter(pk=digest).exists()


def pristine(item: dict, defaults: dict | None = None) -> bool:
    if item.get('model') != LABEL:
        return False
    if defaults is None:
        _, defaults = catalog()
    default = defaults.get(str(item.get('pk')))
    fields = item.get('fields') or {}
    if default is None or set(fields) - set(default) - {'id'}:
        return False
    # 不仅比较业务值：手动恢复默认价格的更新时间也必须继续传播。
    updated = fields.get('updated_at')
    if isinstance(updated, str):
        updated = parse_datetime(updated)
    if updated != SEED_UPDATED_AT:
        return False
    try:
        return all(fields.get(key) == value for key, value in default.items()
                   if key not in {'price', 'updated_at'}) and Decimal(str(fields.get('price'))) == Decimal(default['price'])
    except (InvalidOperation, TypeError, ValueError):
        return False


def compact(data: list, revisions: dict | None = None) -> tuple[list, dict]:
    revisions = revisions or {}
    _, defaults = catalog()
    omitted = {PREFIX + str(item['pk']) for item in data if pristine(item, defaults)
               and not revisions.get(PREFIX + str(item['pk']), {}).get('deleted')}
    return (
        [item for item in data if item.get('model') != LABEL or PREFIX + str(item['pk']) not in omitted],
        {key: revision for key, revision in revisions.items() if key not in omitted},
    )


def metadata(revisions: dict) -> dict:
    digest, _ = catalog()
    return {META_KEY: {'schema': 1, 'sha256': digest, 'deleted_ids': sorted(
        key[len(PREFIX):] for key, revision in revisions.items()
        if key.startswith(PREFIX) and revision.get('deleted')
    )}}


def validate(meta: dict | None) -> None:
    marker = (meta or {}).get(META_KEY)
    if marker is None:
        return
    from utils.sync_manager import SyncError
    digest, _ = catalog()
    if not isinstance(marker, dict) or marker.get('schema') != 1 or marker.get('sha256') != digest:
        raise SyncError('旅行城市目录版本不一致，请先升级所有同步设备到同一版本')
    deleted = marker.get('deleted_ids')
    if not isinstance(deleted, list) or any(not isinstance(pk, str) for pk in deleted):
        raise SyncError('旅行城市删除清单损坏，拒绝恢复')


def validate_revisions(meta: dict | None, revisions: dict) -> None:
    validate(meta)
    if (meta or {}).get(META_KEY) is not None:
        if (meta or {})[META_KEY] != metadata(revisions)[META_KEY]:
            from utils.sync_manager import SyncError
            raise SyncError('旅行城市删除清单与修订不一致，拒绝恢复')


def expand(data: list, meta: dict | None) -> list:
    validate(meta)
    marker = (meta or {}).get(META_KEY)
    if marker is None:
        return data
    _, defaults = catalog()
    deleted = set(marker['deleted_ids'])
    supplied = {str(item['pk']) for item in data if item.get('model') == LABEL}
    if supplied & deleted:
        from utils.sync_manager import SyncError
        raise SyncError('旅行城市数据与删除清单冲突，拒绝恢复')
    return data + [{'model': LABEL, 'pk': pk, 'fields': dict(fields)}
                   for pk, fields in defaults.items() if pk not in supplied and pk not in deleted]


def pristine_ids(queryset=None) -> list[str]:
    from .travel_models import TravelDestination
    queryset = queryset if queryset is not None else TravelDestination.objects.all()
    _, defaults = catalog()
    return [str(row['id']) for row in queryset.filter(updated_at=SEED_UPDATED_AT).values().iterator(chunk_size=2000)
            if pristine({'model': LABEL, 'pk': row['id'], 'fields': row}, defaults)]


def export_queryset(queryset):
    _, defaults = catalog()
    overrides = [str(row['id']) for row in queryset.values().iterator(chunk_size=2000)
                 if not pristine({'model': LABEL, 'pk': row['id'], 'fields': row}, defaults)]
    return queryset.filter(pk__in=overrides)


def prune_states() -> int:
    from django.db import transaction
    from system_settings.models import SyncEntityState
    from .travel_models import TravelDestination
    if not enabled():
        return 0
    with transaction.atomic():
        tracked = SyncEntityState.objects.filter(model_label=LABEL, is_deleted=False).values('object_pk')
        ids = pristine_ids(TravelDestination.objects.select_for_update().filter(pk__in=tracked))
        # 分批避免 SQLite 参数上限；仅清理当前存在且未编辑的城市，墓碑不动。
        count = 0
        for offset in range(0, len(ids), 500):
            deleted, _ = SyncEntityState.objects.filter(
                model_label=LABEL, object_pk__in=ids[offset:offset + 500], is_deleted=False,
            ).delete()
            count += deleted
        return count


def mark_initialized(meta: dict | None) -> None:
    if (meta or {}).get(META_KEY) is not None:
        from .travel_models import TravelSeedState
        digest, defaults = catalog()
        TravelSeedState.objects.get_or_create(pk=digest, defaults={'row_count': len(defaults)})


def record_missing() -> None:
    """全量 ZIP 恢复只有业务数据：把缺失的默认城市补为显式墓碑。"""
    from django.db import transaction
    from django.utils import timezone
    from system_settings.models import SyncEntityState
    from system_settings.sync_state import get_device_id
    from .travel_models import TravelDestination
    if not enabled():
        return
    _, defaults = catalog()
    missing = set(defaults) - set(TravelDestination.objects.values_list('pk', flat=True))
    if not missing:
        return
    with transaction.atomic():
        existing = {state.object_pk: state for state in SyncEntityState.objects.filter(model_label=LABEL)}
        now, device = timezone.now(), get_device_id()
        create = []
        update = []
        for pk in missing:
            state = existing.get(pk)
            if state is None:
                create.append(SyncEntityState(model_label=LABEL, object_pk=pk, is_deleted=True,
                                              revision_at=now, origin_device=device))
            elif not state.is_deleted:
                state.is_deleted = True
                state.revision_at = now
                state.origin_device = device
                update.append(state)
        SyncEntityState.objects.bulk_create(create, batch_size=500, ignore_conflicts=True)
        SyncEntityState.objects.bulk_update(update, ['is_deleted', 'revision_at', 'origin_device'], batch_size=500)
