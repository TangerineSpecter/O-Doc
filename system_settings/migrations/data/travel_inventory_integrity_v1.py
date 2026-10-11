"""Frozen 0066 inventory fingerprints; preserve every unrelated asset checkpoint."""
import copy
import hashlib
import json
import re

from django.core.serializers.json import DjangoJSONEncoder


def inventory_hash(rows: list[dict], *, cooking: bool = False) -> str:
    if cooking:
        rows = json.loads(json.dumps(rows, cls=DjangoJSONEncoder))
        for row in rows:
            row['created_at'] = re.sub(r'\.000(?=Z?$|[+-]\d{2}:\d{2}$)', '', row['created_at'])
    raw = json.dumps(rows, cls=DjangoJSONEncoder, ensure_ascii=not cooking,
                     sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def checkpoint_changes(changes: list[tuple], apps, alias: str) -> list[tuple]:
    """Plan hashes before writing so the same backup includes original checkpoints."""
    grouped = {}
    for row, values in changes:
        if row._meta.label_lower == 'system_settings.agentinventoryitem':
            grouped.setdefault(row.owner_id, {})[row.pk] = values
    Inventory = apps.get_model('system_settings', 'AgentInventoryItem')
    result = []
    for owner, updates in grouped.items():
        before = list(Inventory.objects.using(alias).select_for_update()
                      .filter(owner_id=owner).order_by('pk').values())
        after = copy.deepcopy(before)
        for row in after:
            row.update(updates.get(row['id'], {}))
        for name, cooking in [('MarketIntegrity', False), ('CookingIntegrity', True)]:
            Integrity = apps.get_model('system_settings', name)
            checkpoint = Integrity.objects.using(alias).select_for_update().filter(pk=owner).first()
            if checkpoint is None:
                continue
            # Do not bless an already inconsistent inventory or rewrite other asset hashes.
            if checkpoint.hashes.get('AgentInventoryItem') != inventory_hash(before, cooking=cooking):
                raise RuntimeError(f'{name} 背包指纹不一致，停止旅行文字迁移：{owner}')
            hashes = {**checkpoint.hashes, 'AgentInventoryItem': inventory_hash(after, cooking=cooking)}
            result.append((checkpoint, {'hashes': hashes}))
    return result
