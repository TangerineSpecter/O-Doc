"""Validate immutable quality facts and migrate legacy inventory after integrity checks."""
from decimal import Decimal
from .cooking_quality import outcome, skill_progress
from .cooking_plan import validate_quality_snapshot


def validate_quality_operation(op, experience: int) -> int:
    from utils.sync_manager import SyncError
    try:
        validate_quality_snapshot(op.snapshot)
        before = skill_progress(experience)
        result = outcome(op.pk, before['level'], op.snapshot['materials'], op.snapshot)
        if any(op.result.get(key) != value for key, value in result.items()):
            raise ValueError('制作随机结果或品质经验不一致')
        value = sum((Decimal(lot['price']) * lot['quantity'] for row in op.snapshot['materials'] for lot in row['lots']), Decimal(0))
        if (op.result['quantity'] != 1 or Decimal(op.result['ingredient_value']) != value or
                Decimal(op.result['processing_gain']) != Decimal(result['unit_price']) - value or
                op.result['level_before'] != before['level'] or
                op.result['level_after'] != skill_progress(experience + result['experience_gained'])['level']):
            raise ValueError('制作品质事实不一致')
        return result['experience_gained']
    except (ValueError, KeyError, TypeError, ArithmeticError) as exc:
        raise SyncError('美食品质快照缺失或不一致') from exc


def validate_source(data: list[dict], meta: dict | None = None) -> dict:
    from utils.sync_manager import SyncError
    version = (meta or {}).get('cooking_schema_version', 0)
    if type(version) is not int or not 0 <= version <= 2:
        raise SyncError('烹饪快照版本高于本机，请升级后恢复')
    quality_plans, plan_owners = set(), set()
    for row in data:
        if row['model'] != 'system_settings.worldaction':
            continue
        snapshot = row['fields'].get('snapshot') or {}
        if not snapshot.get('cooking'):
            continue
        for portion in snapshot.get('plan', []):
            if 'quality_rules' in portion.get('rule', {}):
                quality_plans.add(str(row['pk']))
                owner = snapshot.get('owner_id')
                if not isinstance(owner, str) or not owner:
                    raise SyncError('美食品质计划缺少所属账号')
                plan_owners.add(owner)
                try:
                    validate_quality_snapshot(portion['rule'])
                except (KeyError, TypeError, ValueError, ArithmeticError) as exc:
                    raise SyncError('美食品质计划缺失或不一致') from exc
    ids = {str(row['pk']) for row in data if row['model'] == 'system_settings.cookingoperation'}
    quality_ids = {str(row['pk']) for row in data if row['model'] == 'system_settings.cookingoperation' and 'quality_rules' in row['fields']['snapshot']}
    if version < 2 and (quality_ids or quality_plans):
        raise SyncError('美食品质数据缺少新版同步版本')
    if version == 2:
        owners = (meta or {}).get('cooking_owners')
        actual_owners = {str(row['pk']) for row in data if row['model'] == 'system_settings.cookingintegrity'}
        if not isinstance(owners, list) or set(owners) != actual_owners or not plan_owners <= actual_owners:
            raise SyncError('烹饪完整性清单缺失或不一致')
        manifest = (meta or {}).get('cooking_quality_operations')
        if not isinstance(manifest, list) or set(manifest) != quality_ids or not quality_ids <= ids:
            raise SyncError('美食品质制作清单缺失或不一致')
        plan_manifest = (meta or {}).get('cooking_quality_plans')
        if not isinstance(plan_manifest, list) or set(plan_manifest) != quality_plans:
            raise SyncError('美食品质计划清单缺失或不一致')
    for row in data:
        if row['model'] == 'system_settings.agentinventoryitem':
            item = row['fields']
            source = item.get('source') or {}
        elif row['model'] == 'system_settings.marketlisting' and row['fields'].get('status') == 'active':
            item = row['fields'].get('item') or {}
            source = item.get('source') or {}
        else:
            continue
        if source.get('sku', '').startswith('dish.'):
            stars = source.get('stars', None if version == 2 else 1)
            if type(stars) is not int or not 1 <= stars <= 5 or (version < 2 and stars != 1):
                raise SyncError('美食库存星级无效或缺失')
            if version == 2:
                try:
                    quantity = item['quantity']
                    if type(quantity) is not int or quantity < 1:
                        raise ValueError()
                    if 'lots' in source and (sum(lot['quantity'] for lot in source['lots']) != quantity or any(
                            type(lot['quantity']) is not int or lot['quantity'] < 1 or
                            not Decimal(str(lot['price'])).is_finite() or Decimal(str(lot['price'])) < 0
                            for lot in source['lots'])):
                        raise ValueError()
                except (ValueError, KeyError, TypeError, ArithmeticError) as exc:
                    raise SyncError('美食库存数量与价格批次不一致') from exc

    from .cooking_integrity import source_integrity
    return source_integrity(data)


def normalize_legacy_inventory() -> None:
    from .travel_models import AgentInventoryItem
    from .market_models import MarketListing
    for item in AgentInventoryItem.objects.all().iterator():
        if item.source.get('sku', '').startswith('dish.') and 'stars' not in item.source:
            item.source = {**item.source, 'stars': 1}
            item.save(update_fields=['source'])
    for listing in MarketListing.objects.filter(status='active').iterator():
        source = listing.item.get('source') or {}
        if source.get('sku', '').startswith('dish.') and 'stars' not in source:
            listing.item = {**listing.item, 'source': {**source, 'stars': 1}}
            listing.save(update_fields=['item'])


def metadata(data: list[dict] | None = None) -> dict:
    # Derive manifests from the exported data, so a later write cannot change its identity.
    if data is None:
        from .cooking_models import CookingOperation, CookingIntegrity
        from system_settings.models import WorldAction
        data = [{'model': 'system_settings.cookingintegrity', 'pk': pk, 'fields': {}}
                for pk in CookingIntegrity.objects.values_list('pk', flat=True)]
        data += [{'model': 'system_settings.cookingoperation', 'pk': row['id'], 'fields': row}
                 for row in CookingOperation.objects.values('id', 'snapshot')]
        data += [{'model': 'system_settings.worldaction', 'pk': row['id'], 'fields': row}
                 for row in WorldAction.objects.filter(snapshot__cooking=True).values('id', 'snapshot')]
    owners, operations, plans = [], [], []
    for row in data:
        snapshot = row['fields'].get('snapshot') or {}
        if row['model'] == 'system_settings.cookingintegrity':
            owners.append(str(row['pk']))
        elif row['model'] == 'system_settings.cookingoperation' and 'quality_rules' in snapshot:
            operations.append(str(row['pk']))
        elif row['model'] == 'system_settings.worldaction' and snapshot.get('cooking') and any(
                'quality_rules' in part.get('rule', {}) for part in snapshot.get('plan', [])):
            plans.append(str(row['pk']))
    return {'cooking_schema_version': 2, 'cooking_owners': sorted(owners),
            'cooking_quality_operations': sorted(operations), 'cooking_quality_plans': sorted(plans)}
