"""Read-only commitments shared by idle admission and automatic consumption."""
from datetime import timedelta, datetime
from decimal import Decimal

from .life_energy import Commitment, allowance, forecast
from .life_time import local_time, storage_time


class ResourceProtected(ValueError):
    """An automatic operation must wait for committed work or replanning."""


def item_cost(item):
    kind = item.activity
    if kind in ('rest', 'lottery', 'market_prepare'):
        return Decimal(0)
    if kind in ('cooking', 'alchemy'):
        plan = item.context.get(kind + '_plan')
        if not plan:
            return None
        from .life_schedule import execution_key
        if kind == 'cooking':
            from .cooking_models import CookingOperation as Operation
        else:
            from .alchemy_models import AlchemyOperation as Operation
        from collections import Counter
        done = Counter(Operation.objects.filter(opportunity_id=execution_key(item)).values_list('recipe_id', flat=True))
        return sum((Decimal(str(e['rule']['energy_cost'])) * max(0, e['quantity'] - done[e['recipe_id']])
                    for e in plan['entries']), Decimal(0))
    if kind == 'farm':
        return Decimal(0) if item.context.get('farm_plan_id') else None
    if kind == 'travel':
        from .life_config import task_for
        from system_settings.models import Agent
        task = task_for(item.owner_id, Agent.objects.get(pk=item.actor_id), kind)
        return Decimal(str((task.travel_config or {}).get('energy_cost', 20))) if task else None
    return {'investment': Decimal(5), 'post_publish': Decimal(20), 'post_interaction': Decimal(10)}.get(kind)


def farm_commitments(owner, actor, now, *, operation=None):
    """Only actual seeds/active queues; never invent future procurement or harvest stock."""
    from .farm_models import AgentFarm
    from .farm_catalog import catalog_for
    from .inventory_stock import inventory_items
    from .life_daily_facts import queue_forecast
    farm = AgentFarm.objects.filter(pk=actor, owner_id=owner).first()
    if not farm:
        return []
    catalog = catalog_for(owner)
    stock = {}
    for row in inventory_items(actor, owner):
        sku = (row.source or {}).get('sku', '')
        stock[sku] = stock.get(sku, 0) + row.quantity
    estimates = queue_forecast(farm.state, catalog.rules, catalog.seed, now.timestamp(), stock)
    result = []
    # Required/optional fertilizer can spend another two points per plant. Reserving
    # it conservatively avoids letting an optional automation steal later energy.
    fertilized = any(e.get('fertilizer_mode') != 'none'
        for p in farm.state.get('planting_plans', {}).values() if p['status'] in ('pending', 'active')
        for e in p['entries'])
    for index, row in enumerate(estimates):
        for phase, field, cost in (('plant', 'estimated_planted_at', 4 if fertilized else 2),
                                    ('harvest', 'estimated_ready_at', 2)):
            result.append(Commitment(f'farm:{phase}:{index}', datetime.fromisoformat(row[field]),
                                     Decimal(((row['plots'] + 3) // 4) * cost), 'farm'))
    from collections import Counter
    from .farm_queue_estimate import plot_availability
    operation = operation or {}
    targets = set(operation.get('targets', []))
    crops = Counter()
    for plot, at in zip(farm.state['plots'], plot_availability(farm.state, catalog.seed, now.timestamp())):
        if plot.get('crop') and not (operation.get('kind') == 'harvest' and plot['id'] in targets and at <= now.timestamp()):
            crops[at] += 1
    # A real harvest handles up to four plots, including different crops. Keep
    # distinct readiness times separate so a later batch cannot spend early.
    for index, (at, count) in enumerate(sorted(crops.items())):
        result.append(Commitment(f'farm:crop:{index}', datetime.fromtimestamp(at, now.tzinfo),
                                 Decimal(((count + 3) // 4) * 2), 'farm'))
    animals = sum(bool(animal.get('cycle', {}).get('result')) and not (
        operation.get('kind') == 'collect' and animal['id'] in targets)
        for animal in farm.state.get('animals', []))
    if animals:
        result.append(Commitment('farm:animal', now, Decimal(((animals + 3) // 4) * 2), 'farm'))
    return result


def commitments(owner, actor, now=None, *, exclude_item=None, exclude_bounty=None, farm_credit=0,
                farm_operation=None, exclude_ids=()):
    from .life_models import LifeItem
    from .life_activities import main_items
    from .life_schedule import OPEN
    from .bounty_models import Bounty
    now = local_time(now)
    end = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=2)
    rows = main_items(LifeItem.objects.filter(owner_id=owner, actor_id=actor,
        status__in=OPEN, scheduled_at__lt=storage_time(end))).exclude(pk=exclude_item or '').exclude(pk__in=exclude_ids)
    today_end = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    rows = [row for row in rows if local_time(row.scheduled_at) < today_end or row.activity != 'unplanned' or row.context.get('daily_choice')]
    result = [Commitment(row.pk, max(now, local_time(row.scheduled_at)), item_cost(row), row.activity) for row in rows]
    farm = farm_commitments(owner, actor, now, operation=farm_operation)
    # Harvest/collect remove only the actual current targets above. Planting
    # replaces its own due planting cost; unrelated harvests remain protected.
    credit = Decimal(str(farm_credit)) if (farm_operation or {}).get('kind') == 'plant' else Decimal(0)
    for entry in sorted(farm, key=lambda e: e.at):
        used = min(credit, entry.energy) if entry.key.startswith('farm:plant:') and local_time(entry.at) <= now else Decimal(0)
        credit -= used
        result.append(Commitment(entry.key, entry.at, entry.energy - used, entry.kind))
    for bounty in Bounty.objects.filter(owner_id=owner, agent_id=actor, status='claimed').exclude(pk=exclude_bounty or ''):
        result.append(Commitment('bounty:' + bounty.pk, max(now, local_time(bounty.next_try_at or now)), Decimal(20), 'bounty'))
    return result


def capacity(owner, agent, now=None, *, exclude_item=None):
    from .execution import stamina
    from .stamina_settings import history
    now = local_time(now)
    rows = commitments(owner, agent.pk, now, exclude_item=exclude_item)
    current = stamina(agent, storage_time(now))
    recovery = history()
    return {'energy': allowance(current, now, rows, recovery), 'current': str(current),
            'projection': forecast(current, now, rows, recovery)}


def require_energy(owner, agent, cost, *, item_id=None, manual=False, bounty_id=None,
                   farm_operation=None, now=None):
    """Call inside the existing asset transaction, immediately before the real debit."""
    from .life_scope import CURRENT
    from .life_models import LifeItem
    from .life_activities import is_interleaved
    from .execution import stamina
    from .stamina_settings import history
    scope = CURRENT.get()
    identity = item_id or (scope['item_id'] if scope and scope['actor_id'] == agent.pk else None)
    item = LifeItem.objects.filter(pk=identity, actor_id=agent.pk).first() if identity else None
    if manual or (item and item.context.get('manual')):
        return
    # Main commitments are serviced first; subsequent main work already supports
    # deferral. Idle and independent automation must leave those commitments safe.
    if item and not is_interleaved(item) and item.activity != 'market_prepare':
        return
    # A delayed worker must not spend against a historical balance that omits
    # manual actions committed since its original due time.
    now = max(local_time(now), local_time())
    rows = commitments(owner, agent.pk, now, exclude_item=identity, exclude_bounty=bounty_id,
                       farm_credit=cost, farm_operation=farm_operation)
    proposal = Commitment('!consume', now, Decimal(str(cost)), 'consumption')
    if not forecast(stamina(agent, storage_time(now)), now, [proposal, *rows], history())['safe']:
        raise ResourceProtected('体力不足：自动活动需为已安排日程与已接任务保留体力，请等待恢复或完成规划')
