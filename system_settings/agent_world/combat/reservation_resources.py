"""Single read-only source for appointment time, stamina and daily-minute protection."""
from datetime import timedelta
from decimal import Decimal
from .reservation_models import AdventureReservation
from ..life_time import local_time

OPEN = ('reserved', 'preparing', 'active')


def appointments(owner, actor, *, exclude_item=None):
    for row in AdventureReservation.objects.filter(owner_id=owner, status__in=OPEN):
        member = row.snapshot.get('members', {}).get(actor)
        if member and member['item_id'] != exclude_item and member.get('status') not in ('cancelled', 'failed', 'completed'):
            yield row, member


def remaining(row, member):
    from .models import Exploration
    run = Exploration.objects.filter(pk=member.get('run_id')).first()
    duration = run.duration_seconds if run and run.status in ('active', 'paused', 'settling') else int((row.ends_at-row.starts_at).total_seconds())
    if run and run.ended_at:
        return 0, 0
    elapsed = run.elapsed_seconds if run and run.status in ('active', 'paused', 'settling') else 0
    used = (run.result or {}).get('energy', 0) if run else 0
    from .explorations import energy
    return max(0, duration-elapsed), max(0, energy(duration)-used)


def reserved_seconds(owner, actor, day, *, exclude_item=None):
    total = 0
    for row, member in appointments(owner, actor, exclude_item=exclude_item):
        seconds, _ = remaining(row, member)
        # Appointments never cross a local calendar day.
        if local_time(row.starts_at).date().isoformat() == str(day):
            total += seconds
    return total


def quota_remaining(profile, day, *, exclude_item=None):
    from .models import CombatConfig
    config = CombatConfig.objects.filter(pk=profile.owner_id).first()
    limit = (config.daily_minutes if config else 120)*60
    return max(0, limit-profile.loot_progress.get('days', {}).get(str(day), 0)
               - reserved_seconds(profile.owner_id, profile.pk, day, exclude_item=exclude_item))


def commitments(owner, actor, now, *, exclude_item=None):
    from ..life_energy import Commitment
    return [Commitment('reservation:'+row.pk, max(now, local_time(row.starts_at)), Decimal(remaining(row, member)[1]), 'exploration')
            for row, member in appointments(owner, actor, exclude_item=exclude_item)]


def available_until(owner, actor, now, right, *, exclude_item=None):
    for row, member in appointments(owner, actor, exclude_item=exclude_item):
        left, end = local_time(row.prepare_at), local_time(row.ends_at)
        if left <= now < end:
            return now
        if now < left:
            right = min(right, left)
    return right


def require_window(owner, actor, now, duration, *, exclude_item=None):
    end = now+timedelta(seconds=duration)
    if available_until(owner, actor, now, end, exclude_item=exclude_item) < end:
        raise ValueError('探索与已预约的组队准备或探索时间冲突')


def protected_stock(owner, actor, sku, *, exclude_item=None):
    from .models import Exploration
    total = 0
    for row, member in appointments(owner, actor, exclude_item=exclude_item):
        run = Exploration.objects.filter(pk=member['run_id'], status='preparing', phase='waiting_reservation').first()
        if not run:
            continue
        plan = run.snapshot.get('prepared_plan', {})
        if sku.startswith('combat.'):
            total += plan.get('potions', {}).get(sku[7:], 0)
        food = plan.get('food') or {}
        if sku == 'dish.'+food.get('recipe_id', ''):
            total += food.get('quantity', 0)
        for elixir in plan.get('elixirs', []):
            if sku == 'elixir.'+elixir['recipe_id']:
                total += elixir['count']
    return total


def require_stock(owner, actor, sku, quantity, *, exclude_item=None):
    from ..life_scope import CURRENT
    scope = CURRENT.get()
    identity = exclude_item or (scope['item_id'] if scope and scope['actor_id'] == actor else None)
    from ..inventory_stock import stock_quantity
    protected = protected_stock(owner, actor, sku, exclude_item=identity)
    if protected and stock_quantity(actor, owner, sku)-protected < quantity:
        raise ValueError('物资已预留给组队探索预约')
