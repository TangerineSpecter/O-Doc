"""农场经营事务：状态、库存、账本和体力在同一提交中生效。"""
from .life_scope import allowed as life_allowed
import copy
import hashlib
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from system_settings.models import Agent, AgentTask, AgentExecutionLease, WorldAction, SystemSetting, WorldActionRuntime
from .farm_models import AgentFarm, FarmOperation
from .farm_catalog import catalog_for
from .farm_clock import advance_state, local_day, DAY
from .farm_gate import guarded
from .inventory_stock import stock_rows, add_stock as add_inventory_stock, take_stock as take_inventory_stock
from .models import WorldLedger
from .income import ensure_opening
from .execution import stamina
from .farm_bonus import yield_bonus, add_production

KINDS = ('buy_supply', 'plant', 'water', 'feed', 'harvest', 'collect', 'sell', 'expand', 'build', 'upgrade', 'buy_animal')
LABELS = dict(zip(KINDS, ('购买农资', '播种', '浇水', '喂养', '收获', '领取畜牧产物', '出售', '扩地', '建造', '升级', '购买动物')))


def initial_state() -> dict:
    return {'plots': [{'id': str(i), 'watered_until': 0, 'crop': None} for i in range(4)],
            'buildings': {}, 'animals': []}


@guarded
@transaction.atomic
def ensure_farms(task):
    if not task.enabled:
        return
    owner = task.farm_config['owner_id']
    from .investment_service import validate_agents
    from .life_models import LifeConfig
    from .life_config import effective_settings
    config=LifeConfig.objects.filter(pk=owner,migrated=True).first()
    ids=effective_settings(config).get('agent_ids',[]) if config else (task.agent_ids or [task.agent_id])
    validate_agents(owner,ids)
    catalog_for(owner)
    for agent in Agent.objects.filter(pk__in=ids):
        farm, created = AgentFarm.objects.get_or_create(pk=agent.pk, defaults={'owner_id': owner,
            'actor_name': agent.name, 'state': initial_state(), 'appearance': {'style': 0, 'palette': 0}})
        if not created and farm.owner_id != owner:
            raise ValueError('该居民的农场已有其他所有者')


@guarded
@transaction.atomic
def advance_farm(farm_id, now=None):
    farm = AgentFarm.objects.select_for_update().get(pk=farm_id)
    catalog = catalog_for(farm.owner_id)
    at = (now or timezone.now()).timestamp()
    legacy_inventory = farm.state.pop('inventory_snapshot', None)
    if advance_state(farm.state, catalog.seed, at) or legacy_inventory is not None:
        farm.revision += 1
        farm.updated_at = now or timezone.now()
        farm.save(update_fields=['state', 'revision', 'updated_at'])
    return farm


def stock(farm, sku):
    return stock_rows(farm.pk, farm.owner_id, sku).first()


def add_stock(farm, sku, quantity, name, kind, price=0, key=''):
    return add_inventory_stock(farm.pk, farm.owner_id, farm.actor_name, sku, quantity, name, kind, price, key)


def take_stock(farm, sku, quantity):
    return take_inventory_stock(farm.pk, farm.owner_id, sku, quantity)


def integer(value, maximum=100):
    if type(value) is not int or not 1 <= value <= maximum:
        raise ValueError('数量必须为有效正整数')
    return value


def targets(state, operation, group):
    ids = operation.get('targets')
    if not isinstance(ids, list) or not 1 <= len(ids) <= 4 or any(not isinstance(i, str) for i in ids) or len(set(ids)) != len(ids):
        raise ValueError('照料目标须为一至四个不同 ID')
    rows = {row['id']: row for row in state[group]}
    if any(i not in rows for i in ids):
        raise ValueError('目标不存在')
    return [rows[i] for i in ids]


def perform(farm, op, rules, at, key):
    """返回金额增量与展示结果；仅由 commit_operation 在事务内调用。"""
    state, kind = farm.state, op['kind']
    amount = Decimal(0)
    bonus = yield_bonus(Agent.objects.select_related('profession').filter(pk=farm.pk).first()) if kind in ('harvest', 'collect') else None
    if kind == 'buy_supply':
        quantity, sku = integer(op.get('quantity')), op.get('sku')
        if sku == 'feed':
            price, name, item_kind = rules['feed_price'], '饲料', 'farm_supply'
        elif isinstance(sku, str) and sku.startswith('seed.') and sku[5:] in rules['crops']:
            crop = rules['crops'][sku[5:]]
            price, name, item_kind = crop['seed_price'], crop['name']+'种子', 'farm_seed'
        else:
            raise ValueError('农资类型无效')
        add_stock(farm, sku, quantity, name, item_kind, price, key)
        amount = -Decimal(price)*quantity
    elif kind == 'plant':
        crop_id = op.get('crop')
        if crop_id not in rules['crops']:
            raise ValueError('作物无效')
        plots = targets(state, op, 'plots')
        if any(p['crop'] for p in plots):
            raise ValueError('地块已有作物')
        take_stock(farm, 'seed.'+crop_id, len(plots))
        for plot in plots:
            plot['crop'] = {'kind': crop_id, 'grown': 0, 'checked_at': at, 'planted_at': at, 'rules': copy.deepcopy(rules['crops'][crop_id])}
    elif kind == 'water':
        plots = targets(state, op, 'plots')
        if all(p['watered_until'] >= at + DAY-60 for p in plots):
            raise ValueError('地块仍有完整保湿时间')
        for plot in plots:
            plot['watered_until'] = max(plot['watered_until'], at + DAY)
    elif kind == 'harvest':
        plots = targets(state, op, 'plots')
        if any(not p['crop'] or p['crop']['grown'] < p['crop']['rules']['growth_seconds'] for p in plots):
            raise ValueError('作物尚未成熟')
        production = []
        for plot in plots:
            crop = plot['crop']; rule = crop['rules']
            production.append(add_production(farm, 'crop.'+crop['kind'], rule['yield'], rule['name'], 'farm_crop', rule['sale_price'], key, bonus))
            plot['crop'] = None
        return amount, {'label': LABELS[kind], 'production_bonus': production}
    elif kind == 'feed':
        animals = targets(state, op, 'animals')
        if any(a['fed_until'] >= at + DAY-60 for a in animals):
            raise ValueError('动物仍有完整饲料覆盖')
        take_stock(farm, 'feed', len(animals))
        for animal in animals:
            animal['fed_until'] = max(animal['fed_until'], at + DAY)
            if animal.get('last_fed_day') != local_day(at):
                animal['half_hearts'] = min(10, animal['half_hearts']+1)
                animal['last_fed_day'] = local_day(at)
    elif kind == 'collect':
        animals = targets(state, op, 'animals')
        if any(not a['cycle'].get('result') for a in animals):
            raise ValueError('动物尚无待领取产物')
        products, production = [], []
        for animal in animals:
            cycle, result = animal['cycle'], animal['cycle']['result']; rule = cycle['rules']
            price = rule['sale_price'] * (3 if result['quality'] == 'gold' else 1)
            name = ('金色' if result['quality'] == 'gold' else '') + rule['product']
            entry = add_production(farm, f'product.{animal["kind"]}.{result["quality"]}', result['quantity'], name, 'farm_product', price, key, bonus)
            production.append(entry)
            products.append({'animal_id': animal['id'], 'name': name, **result, 'quantity': entry['quantity']})
            animal['cycle'] = {'number': cycle['number']+1, 'grown': 0, 'checked_at': at, 'rules': copy.deepcopy(rules['animals'][animal['kind']])}
        return amount, {'label': LABELS[kind], 'products': products, 'production_bonus': production}
    elif kind == 'sell':
        sku = op.get('sku')
        if not isinstance(sku, str) or not sku.startswith(('crop.', 'product.')):
            raise ValueError('仅支持出售农场产物')
        amount = take_stock(farm, sku, integer(op.get('quantity')))
    elif kind == 'expand':
        group = len(state['plots'])//4
        if group >= 4:
            raise ValueError('已达到土地上限')
        amount = -Decimal(rules['land_prices'][group-1])
        state['plots'].extend({'id': str(i), 'watered_until': 0, 'crop': None} for i in range(group*4, group*4+4))
    elif kind in ('build', 'upgrade'):
        building = op.get('building')
        if building not in rules['buildings']:
            raise ValueError('建筑无效')
        level = state['buildings'].get(building, {}).get('level', 0)
        if (kind == 'build' and level) or (kind == 'upgrade' and not level) or level >= 3:
            raise ValueError('建筑不能执行该操作')
        rule = rules['buildings'][building]
        current_capacity = state['buildings'].get(building, {}).get('capacity', 0)
        occupied = sum(a['building'] == building for a in state['animals'])
        if rule['capacities'][level] <= current_capacity or rule['capacities'][level] < occupied:
            raise ValueError('新建筑容量必须扩大且能容纳现有动物，请调整目录')
        state['buildings'][building] = {'level': level+1, 'capacity': rule['capacities'][level]}
        amount = -Decimal(rule['prices'][level])
    elif kind == 'buy_animal':
        animal_id = op.get('animal')
        if animal_id not in rules['animals']:
            raise ValueError('动物类型无效')
        rule = rules['animals'][animal_id]; building = rule['building']
        house = state['buildings'].get(building)
        occupied = sum(a['building'] == building for a in state['animals'])
        if not house or occupied >= house['capacity']:
            raise ValueError('请先建造或升级对应建筑')
        state['animals'].append({'id': hashlib.sha256(key.encode()).hexdigest()[:24], 'kind': animal_id,
            'building': building, 'half_hearts': 0, 'fed_until': 0, 'last_fed_day': '',
            'cycle': {'number': 1, 'grown': 0, 'checked_at': at, 'rules': copy.deepcopy(rule)}})
        amount = -Decimal(rule['price'])
    else:
        raise ValueError('不支持的经营操作')
    return amount, {'label': LABELS[kind]}


@guarded
@transaction.atomic
def commit_operation(farm_id, opportunity_id, index, operation, reason, task, agent_token, world_token, now=None):
    key = f'{opportunity_id}:{index}'
    previous = FarmOperation.objects.filter(pk=key).first()
    if previous:
        if previous.farm_id != farm_id or previous.operation != operation:
            raise ValueError('操作键已用于不同操作')
        return previous
    now = now or timezone.now()
    from .life_scope import check_current_authorization
    check_current_authorization()
    agent = Agent.objects.select_for_update().get(pk=farm_id)
    task = AgentTask.objects.select_for_update().get(pk=task.pk)
    if task.task_kind != 'farm' or not task.enabled or not life_allowed(task,agent.pk):
        raise ValueError('农场任务已停止或居民已解绑')
    if not AgentExecutionLease.objects.filter(agent_id=agent.pk, token=agent_token, until__gt=now).exists():
        raise ValueError('Agent 执行锁失效')
    if not WorldActionRuntime.objects.filter(pk='world', token=world_token, until__gt=now).exists():
        raise ValueError('世界执行锁失效')
    from .travel_candidates import travelling_ids
    if agent.pk in travelling_ids():
        raise ValueError('Agent 正在旅行')
    setting = SystemSetting.objects.filter(key='system_mcp_config').first()
    if setting and not (setting.value or {}).get('enabled', True):
        raise ValueError('系统 MCP 已关闭')
    if stamina(agent, now) < 2:
        raise ValueError('体力不足')
    if operation.get('kind') in ('buy_supply', 'buy_animal', 'sell'):
        raise ValueError('购买及出售已迁移至世界市场，请配置市场交易任务')
    farm = AgentFarm.objects.select_for_update().get(pk=farm_id, owner_id=task.farm_config['owner_id'])
    catalog = catalog_for(farm.owner_id)
    advance_state(farm.state, catalog.seed, now.timestamp())
    ensure_opening(agent)
    balance = WorldLedger.objects.filter(agent_id=agent.pk).aggregate(total=Sum('amount'))['total'] or Decimal(0)
    amount, result = perform(farm, operation, catalog.rules, now.timestamp(), key)
    amount = amount.quantize(Decimal('.01'))
    if balance + amount < 0:
        raise ValueError('余额不足')
    if amount < 0:
        from .life_budget import charge_budget
        charge_budget(agent,-amount,business_key='farm:'+key)
    if amount:
        WorldLedger.objects.create(pk='farm:'+key, agent_id=agent.pk, agent_name=agent.name, kind='farm', amount=amount,
            snapshot={'operation_id': key, 'operation': operation, 'reason': reason, 'farm_id': farm.pk})
        agent.money = balance + amount
        agent.save(update_fields=['money'])
    energy_id = hashlib.sha256(f'farm-energy:{key}'.encode()).hexdigest()
    WorldAction.objects.create(pk=energy_id, task=task, agent=agent, actor_id=agent.pk, status='success',
        energy_cost=2, consumed_at=now, effects_done=True, snapshot={'farm_energy': True}, result={'operation_id': key})
    result.update({'amount': str(amount), 'energy_cost': 2})
    row = FarmOperation.objects.create(pk=key, farm=farm, opportunity_id=opportunity_id, operation=operation, result=result, reason=reason, created_at=now)
    farm.state['operation_keys'] = [*farm.state.get('operation_keys', []), key]
    farm.state.pop('inventory_snapshot', None)
    farm.revision += 1
    farm.updated_at = now
    farm.state['last_operation'] = {'id': key, 'operation': operation, 'result': result, 'at': now.timestamp()}
    farm.save(update_fields=['state', 'revision', 'updated_at'])
    return row
