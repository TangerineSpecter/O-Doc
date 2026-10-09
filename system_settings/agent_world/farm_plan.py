"""Stage-specific legal choices and aggregate resource validation."""
from collections import Counter
from .farm_catalog import catalog_for
from .farm_quality import probabilities
from .inventory_stock import stock_quantity


def stage_options(farm, options: list[dict], stage: str, remaining: int) -> list[dict]:
    rules = catalog_for(farm.owner_id).rules
    from .farm_quality import estimate
    from .inventory_stock import preview_cost
    from .farm_bonus import yield_bonus
    from system_settings.models import Agent
    bonus = yield_bonus(Agent.objects.select_related('profession').filter(pk=farm.pk).first())
    if stage == 'plant':
        options = [o for o in options if o['operation']['kind'] == 'plant']
    elif stage == 'fertilize':
        options = []
        for kind in rules['fertilizers']:
            available = stock_quantity(farm.pk, farm.owner_id, 'fertilizer.' + kind)
            eligible = [p for p in farm.state['plots'] if p['crop'] and p['crop'].get('quality_version') == 1
                        and not p['crop'].get('fertilizer') and p['crop']['grown'] < p['crop']['rules']['growth_seconds']]
            # Limited inventory must still allow choosing which crop receives it.
            size = min(4, available)
            if not size:
                continue
            eligible.sort(key=lambda p: p['crop']['kind'])
            for offset in range(0, len(eligible), size):
                plots = eligible[offset:offset + size]
                options.append({'operation': {'kind': 'fertilize', 'fertilizer': kind, 'targets': [p['id'] for p in plots]},
                    'inventory_cost': str(preview_cost(farm.pk, farm.owner_id, 'fertilizer.' + kind, len(plots))),
                    'expected_outcomes': [{'plot_id': p['id'],
                        'without_fertilizer': estimate(p['crop']['rules'], p['crop']['planting_level'], percentage=bonus['percentage'], remainder=farm.state.get('yield_remainders', {}).get('crop.' + p['crop']['kind'], '0')),
                        'with_fertilizer': estimate(p['crop']['rules'], p['crop']['planting_level'], p['crop']['fertilizer_rules'][kind], bonus['percentage'], farm.state.get('yield_remainders', {}).get('crop.' + p['crop']['kind'], '0'))} for p in plots],
                    'description': '施用' + rules['fertilizers'][kind]['name'], 'cost': '0',
                    'probabilities': [{'plot_id': p['id'], 'probabilities': probabilities(p['crop']['planting_level'],
                        p['crop']['fertilizer_rules'][kind]['quality_bonus'])} for p in plots]})
    else:
        options = [o for o in options if o['operation']['kind'] not in ('plant', 'fertilize')]
    return [{**o, 'id': str(i), 'stage': stage, 'remaining_operations': remaining} for i, o in enumerate(options)]


def validate_resources(farm, operations: list[dict]) -> None:
    needed, targets = Counter(), set()
    for operation in operations:
        kind = operation['kind']
        for target in operation.get('targets', []):
            scope = 'animals' if kind in ('feed', 'collect') else 'plots'
            identity = (scope, target, 'fertilize' if kind == 'fertilize' else kind)
            # Alternative plant/fertilizer candidates must not address the same plot twice.
            if identity in targets:
                raise ValueError('同一阶段候选目标冲突')
            targets.add(identity)
        count = len(operation.get('targets', []))
        if kind == 'plant': needed['seed.' + operation['crop']] += count
        if kind == 'fertilize': needed['fertilizer.' + operation['fertilizer']] += count
        if kind == 'feed': needed['feed'] += count
    for sku, count in needed.items():
        if stock_quantity(farm.pk, farm.owner_id, sku) < count:
            raise ValueError('整份计划的库存不足：' + sku)
