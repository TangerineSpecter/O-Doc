"""Validate immutable planting facts and reject incomplete quality-enabled snapshots."""
from .farm_quality import crop_result, experience_for, skill_progress, FERTILIZERS
from decimal import Decimal


def validate_cycle_snapshot(crop, planted, fertilizer):
    if any(crop[k] != planted[k] for k in ('kind', 'rules', 'random_seed', 'planting_level', 'fertilizer_rules', 'planted_at')):
        raise ValueError('种植快照被改写')
    if crop.get('fertilizer') != fertilizer:
        raise ValueError('施肥事实不一致')


def validate_crop(crop: dict) -> None:
    version = crop.get('quality_version')
    if version is None:
        if any(key in crop for key in ('cycle_id', 'random_seed', 'planting_level', 'fertilizer_rules', 'fertilizer')):
            raise ValueError('新版周期缺少规则版本')
        return
    if type(version) is not int or version != 1:
        raise ValueError('不支持的种植规则版本')
    required = {'cycle_id', 'random_seed', 'planting_level', 'fertilizer_rules', 'fertilizer', 'rules', 'kind', 'grown', 'planted_at', 'checked_at'}
    if not required <= crop.keys() or not isinstance(crop['cycle_id'], str) or not crop['cycle_id'] or crop['random_seed'] != crop['cycle_id'] or type(crop['planting_level']) is not int or not 1 <= crop['planting_level'] <= 99:
        raise ValueError('种植周期依据缺失')
    if set(crop['fertilizer_rules']) != set(FERTILIZERS) or any(not set(default) <= crop['fertilizer_rules'][kind].keys() for kind, default in FERTILIZERS.items()):
        raise ValueError('周期肥料规则快照不完整')
    if 'result' in crop and (crop['grown'] < crop['rules']['growth_seconds'] or crop['result'] != crop_result(crop)):
        raise ValueError('种植结果不一致')
    if crop['grown'] >= crop['rules']['growth_seconds'] and 'result' not in crop:
        raise ValueError('成熟品质结果缺失')


def validate_chain(farm, operations: list) -> None:
    from utils.sync_manager import SyncError
    try:
        experience = 0
        cycles, fertilizers, seen = {}, {}, set()
        if farm.state.get('crop_schema_version') == 1 and (type(farm.state.get('planting_experience')) is not int or farm.state['planting_experience'] < 0):
            raise ValueError('种植经验缺失或无效')
        for operation in operations:
            kind, result = operation.operation['kind'], operation.result
            if kind == 'plant':
                for crop in result.get('cycles', []):
                    validate_crop(crop)
                    if crop['planting_level'] != skill_progress(experience)['level']:
                        raise ValueError('播种等级快照不一致')
                    if crop['cycle_id'] in seen:
                        raise ValueError('种植周期重复')
                    seen.add(crop['cycle_id'])
                    cycles[crop['cycle_id']] = crop
                    fertilizers[crop['cycle_id']] = None
            if kind == 'fertilize':
                if len(result['cycles']) != len(operation.operation['targets']) or len(result['costs']) != len(result['cycles']) or len(set(result['cycles'])) != len(result['cycles']):
                    raise ValueError('施肥目标或成本依据缺失')
                for cycle_id, cost in zip(result['cycles'], result['costs']):
                    if cycle_id not in cycles or fertilizers[cycle_id] is not None or not Decimal(cost).is_finite() or Decimal(cost) < 0:
                        raise ValueError('施肥缺少播种依据')
                    fertilizer_kind = operation.operation['fertilizer']
                    fertilizers[cycle_id] = {**cycles[cycle_id]['fertilizer_rules'][fertilizer_kind],
                        'kind': fertilizer_kind, 'operation_id': operation.pk, 'cost': cost}
            if kind == 'harvest' and 'harvested' in result:
                if len(result['harvested']) != len(operation.operation['targets']) or len(result['production_bonus']) != len(result['harvested']):
                    raise ValueError('收获目标或产量依据缺失')
                gained = 0
                for harvested, production in zip(result['harvested'], result['production_bonus']):
                    crop, outcome = harvested['crop'], harvested['result']
                    validate_crop(crop)
                    if crop.get('quality_version') == 1:
                        if crop['cycle_id'] not in cycles or crop['result'] != outcome:
                            raise ValueError('收获缺少品质依据')
                        planted = cycles.pop(crop['cycle_id'])
                        validate_cycle_snapshot(crop, planted, fertilizers[crop['cycle_id']])
                    elif outcome != {'stars': 1, 'event': 'normal', 'event_name': '旧周期', 'fertilizer_extra': 0,
                                     'unit_price': crop['rules']['sale_price'], 'experience': experience_for(crop['rules']['growth_seconds'], 1)}:
                        raise ValueError('旧周期品质无效')
                    if production['sku'] != 'crop.' + crop['kind'] or any(production[k] != outcome[k] for k in ('stars', 'event', 'fertilizer_extra')) or production['base_quantity'] != crop['rules']['yield']:
                        raise ValueError('收获品质与入库依据不一致')
                    gained += experience_for(crop['rules']['growth_seconds'], outcome['stars'])
                if result.get('experience_before') != experience or result.get('experience_gained') != gained:
                    raise ValueError('种植经验依据不一致')
                experience += gained
                if result.get('experience_after') != experience:
                    raise ValueError('种植经验结算不一致')
        if farm.state.get('planting_experience', 0) != experience:
            raise ValueError('种植经验链缺失')
        for plot in farm.state['plots']:
            crop = plot.get('crop')
            if crop:
                validate_crop(crop)
                if crop.get('quality_version') == 1 and crop['cycle_id'] not in cycles:
                    raise ValueError('在田作物缺少播种事实')
                if crop.get('quality_version') == 1:
                    validate_cycle_snapshot(crop, cycles[crop['cycle_id']], fertilizers[crop['cycle_id']])
    except (ValueError, KeyError, TypeError, ArithmeticError) as exc:
        raise SyncError('种植品质或成长快照不完整，拒绝恢复') from exc


def metadata(data: list | None = None) -> dict:
    from system_settings.sync_state import canonical_hash
    from .farm_models import AgentFarm
    from .travel_models import AgentInventoryItem
    from .market_models import MarketBatch
    if data is None:
        farms = {f.pk: f.state for f in AgentFarm.objects.all()}
        inventory = {i.pk: i.source for i in AgentInventoryItem.objects.all()}
        batches = {b.pk: b.supplies for b in MarketBatch.objects.exclude(supplies=[])}
    else:
        farms = {str(r['pk']): r['fields']['state'] for r in data if r['model'] == 'system_settings.agentfarm'}
        inventory = {str(r['pk']): r['fields']['source'] for r in data if r['model'] == 'system_settings.agentinventoryitem'}
        batches = {str(r['pk']): r['fields']['supplies'] for r in data if r['model'] == 'system_settings.marketbatch' and r['fields'].get('supplies')}
    return {'crop_schema_version': 1,
        'crop_farms': [key for key, state in farms.items() if state.get('crop_schema_version') == 1],
        'crop_farm_hashes': {key: canonical_hash(state) for key, state in farms.items() if state.get('crop_schema_version') == 1},
        'crop_inventory_ids': [key for key, source in inventory.items() if source.get('sku', '').startswith('crop.')],
        'crop_market_quote_hashes': {key: canonical_hash(quotes) for key, quotes in batches.items()}}


def validate_snapshot(data: list, meta: dict | None) -> None:
    from utils.sync_manager import SyncError
    meta = meta or {}
    if meta.get('crop_schema_version', 0) > 1:
        raise SyncError('农作物快照版本过新，请升级所有设备')
    farms = {str(row['pk']): row['fields']['state'] for row in data if row['model'] == 'system_settings.agentfarm'}
    inventory = {str(row['pk']): row['fields']['source'] for row in data if row['model'] == 'system_settings.agentinventoryitem'}
    if any(key not in farms or farms[key].get('crop_schema_version') != 1 for key in meta.get('crop_farms', [])):
        raise SyncError('农作物快照缺少新版农场状态')
    if any(key not in inventory for key in meta.get('crop_inventory_ids', [])):
        raise SyncError('农作物快照缺少星级库存')
    from system_settings.sync_state import canonical_hash
    batches = {str(r['pk']): r['fields'].get('supplies') for r in data if r['model'] == 'system_settings.marketbatch'}
    for key, expected in meta.get('crop_market_quote_hashes', {}).items():
        if key not in batches or canonical_hash(batches[key]) != expected:
            raise SyncError('肥料报价快照缺失或不一致')
    for key, expected in meta.get('crop_farm_hashes', {}).items():
        if key not in farms or canonical_hash(farms[key]) != expected:
            raise SyncError('农场成长与周期状态指纹不一致')
    for source in inventory.values():
        if source.get('sku', '').startswith('crop.'):
            stars = source.get('stars', None if meta.get('crop_schema_version') == 1 or any(s.get('crop_schema_version') == 1 for s in farms.values()) else 1)
            if type(stars) is not int or not 1 <= stars <= 5:
                raise SyncError('农作物库存星级无效或缺失')


def normalize_legacy_inventory() -> None:
    from .travel_models import AgentInventoryItem
    from .market_models import MarketListing
    for item in AgentInventoryItem.objects.all():
        if item.source.get('sku', '').startswith('crop.') and 'stars' not in item.source:
            item.source = {**item.source, 'stars': 1}
            item.save(update_fields=['source'])
    for listing in MarketListing.objects.filter(status='active'):
        source = listing.item.get('source') or {}
        if source.get('sku', '').startswith('crop.') and 'stars' not in source:
            listing.item = {**listing.item, 'source': {**source, 'stars': 1}}
            listing.save(update_fields=['item'])


def validate_source(data: list, meta: dict | None = None) -> None:
    from types import SimpleNamespace
    from utils.sync_manager import SyncError
    validate_snapshot(data, meta)
    operations = {str(r['pk']): SimpleNamespace(pk=str(r['pk']), operation=r['fields']['operation'], result=r['fields']['result'])
                  for r in data if r['model'] == 'system_settings.farmoperation'}
    for row in data:
        if row['model'] != 'system_settings.agentfarm':
            continue
        state = row['fields']['state']
        if state.get('crop_schema_version') != 1:
            continue
        keys = state.get('operation_keys', [])
        if any(key not in operations for key in keys):
            raise SyncError('种植快照缺少经营事实')
        validate_chain(SimpleNamespace(state=state), [operations[key] for key in keys])
