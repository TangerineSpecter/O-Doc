"""Validate immutable alchemy quality facts and the alchemy snapshot manifest."""
from decimal import Decimal
from .alchemy_quality import outcome, skill_progress
from .alchemy_plan import validate_quality_snapshot

ALCHEMY_SCHEMA_VERSION = 1


def validate_quality_operation(op, experience: int) -> int:
    from utils.sync_manager import SyncError
    try:
        validate_quality_snapshot(op.snapshot)
        before = skill_progress(experience)
        result = outcome(op.pk, before['level'], op.snapshot['materials'], op.snapshot)
        if any(op.result.get(key) != value for key, value in result.items()):
            raise ValueError('炼金随机结果或品质经验不一致')
        value = sum((Decimal(str(row['price'])) * row['quantity'] for row in op.snapshot['materials']), Decimal(0))
        if (op.result['quantity'] != 1 or Decimal(str(op.result['ingredient_value'])) != value or
                Decimal(str(op.result['processing_gain'])) != Decimal(result['unit_price']) - value or
                op.result['level_before'] != before['level'] or
                op.result['level_after'] != skill_progress(experience + result['experience_gained'])['level']):
            raise ValueError('炼金品质事实不一致')
        return result['experience_gained']
    except (ValueError, KeyError, TypeError, ArithmeticError) as exc:
        raise SyncError('炼金品质快照缺失或不一致') from exc


def validate_source(data: list[dict], meta: dict | None = None) -> dict:
    from utils.sync_manager import SyncError
    version = (meta or {}).get('alchemy_schema_version', 0)
    if type(version) is not int or not 0 <= version <= ALCHEMY_SCHEMA_VERSION:
        raise SyncError('炼金快照版本高于本机，请升级后恢复')
    plans, plan_owners = set(), set()
    for row in data:
        if row['model'] != 'system_settings.worldaction':
            continue
        snapshot = row['fields'].get('snapshot') or {}
        if not snapshot.get('alchemy'):
            continue
        for bottle in snapshot.get('plan', []):
            if 'quality_rules' in bottle.get('rule', {}):
                plans.add(str(row['pk']))
                owner = snapshot.get('owner_id')
                if not isinstance(owner, str) or not owner:
                    raise SyncError('炼金品质计划缺少所属账号')
                plan_owners.add(owner)
                try:
                    validate_quality_snapshot(bottle['rule'])
                except (KeyError, TypeError, ValueError, ArithmeticError) as exc:
                    raise SyncError('炼金品质计划缺失或不一致') from exc
    it = [row for row in data if row['model'] == 'system_settings.alchemyoperation' and 'quality_rules' in row['fields']['snapshot']]
    if version < 1 and (it or plans):
        raise SyncError('炼金数据缺少新版同步版本')
    if version >= 1:
        owners = (meta or {}).get('alchemy_owners')
        actual_owners = {str(row['pk']) for row in data if row['model'] == 'system_settings.alchemyintegrity'}
        if not isinstance(owners, list) or set(owners) != actual_owners or not plan_owners <= actual_owners:
            raise SyncError('炼金完整性清单缺失或不一致')
        manifest = (meta or {}).get('alchemy_operations')
        if not isinstance(manifest, list) or set(manifest) != {str(row['pk']) for row in it}:
            raise SyncError('炼金制作清单缺失或不一致')
        plan_manifest = (meta or {}).get('alchemy_quality_plans')
        if not isinstance(plan_manifest, list) or set(plan_manifest) != plans:
            raise SyncError('炼金品质计划清单缺失或不一致')
    for row in data:
        if row['model'] == 'system_settings.agentinventoryitem':
            item = row['fields']
            source = item.get('source') or {}
        elif row['model'] == 'system_settings.marketlisting' and row['fields'].get('status') == 'active':
            item = row['fields'].get('item') or {}
            source = item.get('source') or {}
        else:
            continue
        if source.get('sku', '').startswith('elixir.'):
            stars = source.get('stars')
            if type(stars) is not int or not 1 <= stars <= 5:
                raise SyncError('炼金药水星级无效或缺失')
            if 'lots' in source and (sum(lot['quantity'] for lot in source['lots']) != item['quantity'] or any(
                    type(lot['quantity']) is not int or lot['quantity'] < 1 or
                    not Decimal(str(lot['price'])).is_finite() or Decimal(str(lot['price'])) < 0
                    for lot in source['lots'])):
                raise SyncError('炼金药水数量与价格批次不一致')
    from .alchemy_integrity import source_integrity
    return source_integrity(data)


def metadata(data: list[dict] | None = None) -> dict:
    if data is None:
        from .alchemy_models import AlchemyOperation, AlchemyIntegrity
        from system_settings.models import WorldAction
        data = [{'model': 'system_settings.alchemyintegrity', 'pk': pk, 'fields': {}}
                for pk in AlchemyIntegrity.objects.values_list('pk', flat=True)]
        data += [{'model': 'system_settings.alchemyoperation', 'pk': row['id'], 'fields': row}
                 for row in AlchemyOperation.objects.values('id', 'snapshot')]
        data += [{'model': 'system_settings.worldaction', 'pk': row['id'], 'fields': row}
                 for row in WorldAction.objects.filter(snapshot__alchemy=True).values('id', 'snapshot')]
    owners, operations, plans = [], [], []
    for row in data:
        snapshot = row['fields'].get('snapshot') or {}
        if row['model'] == 'system_settings.alchemyintegrity':
            owners.append(str(row['pk']))
        elif row['model'] == 'system_settings.alchemyoperation' and 'quality_rules' in snapshot:
            operations.append(str(row['pk']))
        elif row['model'] == 'system_settings.worldaction' and snapshot.get('alchemy') and any(
                'quality_rules' in part.get('rule', {}) for part in snapshot.get('plan', [])):
            plans.append(str(row['pk']))
    return {'alchemy_schema_version': ALCHEMY_SCHEMA_VERSION, 'alchemy_owners': sorted(owners),
            'alchemy_operations': sorted(operations), 'alchemy_quality_plans': sorted(plans)}
