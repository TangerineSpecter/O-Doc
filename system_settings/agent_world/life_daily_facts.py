"""Small, read-only domain summaries and slot-specific daily activity eligibility."""
import copy
from datetime import datetime
from decimal import Decimal

from .life_time import local_time, storage_time

DESCRIPTIONS = {
    'fishing': '使用背包鱼饵出钓；决策连接选择钓点、时长及最多三种鱼饵，后台持续垂钓至返回。',
    'lottery': '购买本期大乐透；稍后由决策模型选择张数及逐位选号。',
    'exploration': '探索迷宫；准备阶段再确定地点、策略和时长，执行程序负责后续日程顺延。',
    'travel': '从本次地点报价中选择旅行目的地；旅行途中其他活动需等待返程。',
    'investment': '按最新可用行情管理模拟股票持仓；具体交易在执行时决定。',
    'farm': '进入农场领取已成熟的畜牧产物，启动当天种植队列；后续程序自动收获、播种和施肥。',
    'cooking': '使用真实已有材料制作满足厨艺等级的美食，具体菜谱另行准备。',
    'alchemy': '使用背包里的迷宫素材炼制一次性药水，具体配方与瓶数另行准备。',
    'blacksmith': '在日程空档使用迷宫素材逐件打造装备，每件出炉后再决定是否继续，最多三件。',
    'post_publish': '根据兴趣和经历自主选题、检索并发布帖子。',
    'post_interaction': '阅读符合范围的帖子并发表评论与评分。',
}


def queue_forecast(state: dict, rules: dict, seed: str, now: float, stock: dict) -> list[dict]:
    from .farm_queue_estimate import plot_availability, planting_time
    available = plot_availability(state, seed, now)
    stock = dict(stock)
    grouped = {}
    for plan in sorted(state.get('planting_plans', {}).values(), key=lambda row: row['starts_at']):
        if plan['status'] not in ('pending', 'active') or plan['cutoff'] <= now:
            continue
        start = max(now, plan['starts_at'])
        for entry in plan['entries']:
            quantity = min(max(0, entry['quantity'] - plan['progress'].get(entry['id'], 0)), stock.get(entry['sku'], 0))
            fertilizer = 'fertilizer.' + str(entry.get('fertilizer'))
            if entry['fertilizer_mode'] == 'required':
                quantity = min(quantity, stock.get(fertilizer, 0))
            crop = rules['crops'][entry['sku'][5:]]
            for _ in range(quantity):
                if not available:
                    break
                index = min(range(len(available)), key=available.__getitem__)
                plant_at = planting_time(available[index], start)
                if plant_at >= plan['cutoff']:
                    break
                ready = plant_at + crop['growth_seconds']
                available[index] = ready
                stock[entry['sku']] -= 1
                if entry['fertilizer_mode'] != 'none' and stock.get(fertilizer, 0):
                    stock[fertilizer] -= 1
                key = (crop['name'], plant_at, ready)
                grouped[key] = grouped.get(key, 0) + 1
    return [{'crop': crop, 'plots': quantity,
             'estimated_planted_at': datetime.fromtimestamp(planted, local_time().tzinfo).isoformat(),
             'estimated_ready_at': datetime.fromtimestamp(at, local_time().tzinfo).isoformat()}
            for (crop, planted, at), quantity in sorted(grouped.items(), key=lambda pair: pair[0][2])]


def farm_summary(owner: str, agent, slots: list[dict]) -> dict:
    from .farm_models import AgentFarm
    from .farm_catalog import catalog_for
    from .farm_clock import advance_state
    from .farm_queue_estimate import plot_availability
    from .inventory_stock import inventory_items
    farm = AgentFarm.objects.filter(pk=agent.pk, owner_id=owner).first()
    if not farm:
        return {'state': '尚未建立农场'}
    catalog = catalog_for(owner)
    state = copy.deepcopy(farm.state)
    now = local_time().timestamp()
    advance_state(state, catalog.seed, now)
    target_day = max(local_time(datetime.fromisoformat(slot['time'])).date().isoformat() for slot in slots)
    state['planting_plans'] = {key: plan for key, plan in state.get('planting_plans', {}).items() if plan['day'] <= target_day}
    available = plot_availability(state, catalog.seed, now)
    harvests = [{'crop': plot['crop']['rules']['name'],
                 'estimated_ready_at': datetime.fromtimestamp(at, local_time().tzinfo).isoformat()}
                for plot, at in zip(state['plots'], available) if plot.get('crop')]
    livestock = [{'product': animal['cycle']['rules']['product'],
                  'quantity': animal['cycle']['result']['quantity']}
                 for animal in state['animals'] if animal['cycle'].get('result')]
    queues = [{'day': plan['day'], 'status': plan['status'],
               'starts_at': datetime.fromtimestamp(plan['starts_at'], local_time().tzinfo).isoformat(),
               'remaining_to_plant': sum(max(0, row['quantity'] - plan['progress'].get(row['id'], 0))
                                         for row in plan['entries'])}
              for plan in state.get('planting_plans', {}).values()
              if plan['status'] in ('pending', 'active', 'completed')
              and plan['cutoff'] > now]
    stock = {}
    for row in inventory_items(agent.pk, owner):
        sku = (row.source or {}).get('sku', '')
        stock[sku] = stock.get(sku, 0) + row.quantity
    seeds = sum(quantity for sku, quantity in stock.items() if sku.startswith('seed.'))
    future_harvests = queue_forecast(state, catalog.rules, catalog.seed, now, stock)
    by_crop = {}
    for row in future_harvests:
        crop = by_crop.setdefault(row['crop'], {'crop': row['crop'], 'estimated_planted_plots': 0,
            'first_ready_at': row['estimated_ready_at'], 'last_ready_at': row['estimated_ready_at']})
        crop['estimated_planted_plots'] += row['plots']
        crop['last_ready_at'] = row['estimated_ready_at']
    by_slot = []
    for slot in slots:
        at = local_time(datetime.fromisoformat(slot['time'])).timestamp()
        existing_growing = sum(bool(plot.get('crop')) and ready > at for plot, ready in zip(state['plots'], available))
        queued_growing = sum(row['plots'] for row in future_harvests
            if datetime.fromisoformat(row['estimated_planted_at']).timestamp() <= at < datetime.fromisoformat(row['estimated_ready_at']).timestamp())
        by_slot.append({'id': slot['id'], 'estimated_empty_plots': max(0, len(state['plots']) - existing_growing - queued_growing)})
    return {'empty_plots': sum(not p.get('crop') for p in state['plots']),
            'seed_quantity': seeds, 'estimated_harvests': harvests,
            'queue_estimated_harvests': list(by_crop.values()), 'by_slot': by_slot,
            'collectable_livestock': livestock, 'queues': queues,
            'rule': '按真实库存和已安装队列估算各时段空地及成熟状态；假设半小时收获，体力或忙碌可能延迟；未采购物资不计入库存。'}


def investment_summary(owner: str, agent) -> dict:
    from .investment_models import InvestmentAccount
    from .investment_queries import positions
    account = InvestmentAccount.objects.filter(pk=agent.pk, owner_id=owner).first()
    if not account:
        return {'position_count': 0, 'market_value': None, 'return_percent': None, 'quote_dates': []}
    rows = positions(account)
    complete = all(row['market_value'] is not None for row in rows)
    cost = sum((Decimal(row['cost']) for row in rows), Decimal(0))
    market = sum((Decimal(row['market_value'] or '0') for row in rows), Decimal(0))
    return {'position_count': len(rows), 'market_value': str(market) if complete else None,
            'return_percent': str((market - cost) / cost * 100) if complete and cost else None,
            'quote_dates': list(dict.fromkeys(sorted({row['price_date'] for row in rows if row['price_date']})[:1]
                             + sorted({row['price_date'] for row in rows if row['price_date']})[-1:])),
            'valuation_complete': complete}


def task_reason(owner: str, agent, task, at, quota=None) -> str:
    """Reuse authoritative predicates without initializing domain state or using providers."""
    from .execution import stamina
    from .life_scope import allowed
    if not allowed(task, agent.pk):
        return '任务未向当前居民开放'
    if task.task_kind == 'fishing':
        from .fishing.service import eligibility
        return eligibility(owner, agent, at)
    if task.task_kind == 'lottery':
        from .lottery_decision import eligibility
        return eligibility(owner, agent, at)
    if task.task_kind == 'post_publish':
        from .publish_config import eligibility
        return eligibility(task, agent, quota=quota, preview=local_time(at) > local_time(), now=storage_time(at))
    if task.task_kind == 'post_interaction':
        from .post_interaction import candidate_posts, interaction_window_days, merged_scope
        if local_time(at) <= local_time() and stamina(agent) < 10:
            return '体力不足以互动'
        if not candidate_posts(agent, merged_scope(task.post_collection_ids, agent.post_collection_ids),
                               merged_scope(task.post_category_ids, agent.post_category_ids),
                               interaction_window_days(task, agent)).exists():
            return '没有可互动帖子'
    if task.task_kind == 'exploration':
        from .combat.models import CombatProfile
        profile = CombatProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
        if profile:
            from .combat.reservation_resources import quota_remaining
            if quota_remaining(profile, at.date()) < 1800:
                return '目标日期探索额度不足30分钟'
            if profile.rest_until and local_time(profile.rest_until) > at:
                return '该时段仍需休养'
    return ''


def build(owner: str, agent, items: list, quotes: dict) -> dict:
    from .life_context import build_planning_selection_context
    from .life_plan_proposal import selection_context
    from .life_models import LifeItem
    from .life_config import tasks_for
    from .life_eligibility import filter_activities
    from .life_budget_choices import BudgetChoices
    from .farm_queue_decision import available_cash
    from .cooking_schedule_plan import planning_facts
    from .life_main_context import build as main_context
    context = main_context(owner, agent, items)
    context.pop('actor_name', None)  # The role projection already contains the name.
    day = local_time(items[0].scheduled_at).date()
    context.update(target_date=day.isoformat(), timezone='Asia/Shanghai', balance=str(agent.money))
    start = datetime.combine(day, datetime.min.time(), tzinfo=local_time().tzinfo)
    from datetime import timedelta
    existing = LifeItem.objects.filter(owner_id=owner, actor_id=agent.pk,
        scheduled_at__gte=storage_time(start), scheduled_at__lt=storage_time(start + timedelta(days=1))).exclude(pk__in=[i.pk for i in items])
    def existing_choice(row):
        checkpoint = row.context.get('daily_choice', {})
        return checkpoint.get('plan', {}) if checkpoint.get('time') == local_time(row.scheduled_at).isoformat() else {}
    context['today'] = [{'time': local_time(row.scheduled_at).isoformat(),
                         'activity': existing_choice(row).get('activity', row.activity),
                         'status': '意向已确认，待准备' if row.activity == 'unplanned' and existing_choice(row) else row.status,
                         'source': 'interleaved' if row.context.get('interleaving') else 'schedule'} for row in existing.order_by('scheduled_at')[:50]]
    farm_days = {local_time(row.scheduled_at).date().isoformat() for row in existing
                 if existing_choice(row).get('activity', row.activity) == 'farm'
                 and row.status not in ('cancelled', 'failed', 'rest')}
    context['existing_farm_days'] = sorted(farm_days)
    tasks = {task.pk: task for task in tasks_for(owner) if task.enabled}
    available = available_cash(owner, agent.pk, exclude_ids=[i.pk for i in items])
    context['funds'] = {'total': str(agent.money), 'reserved': str(max(Decimal(0), agent.money - available)), 'available': str(available)}
    tiers = {'travel': {'quoted': True} if quotes.get('candidates') else {},
             'investment': BudgetChoices(agent.money).options('investment', cash_left=available)}
    allowed_kinds = set()
    quotas = {}
    from .publish_config import quota_usage
    for slot in context['slots']:
        at = local_time(datetime.fromisoformat(slot['time']))
        slot['time'] = at.isoformat()
        allowed, _ = filter_activities(context, slot, tiers, None, farm_days, None)
        slot_allowed = []
        for kind in allowed:
            task = tasks[next(row['task_id'] for row in context['activities'] if row['kind'] == kind)]
            if task.task_kind == 'post_publish' and task.pk not in quotas:
                quotas[task.pk] = quota_usage(task)
            if not task_reason(owner, agent, task, at, quota=quotas.get(task.pk)):
                slot_allowed.append(kind)
        slot['allowed_activities'] = slot_allowed
        allowed_kinds.update(slot_allowed)
    context['activities'] = [{**row, 'description': DESCRIPTIONS[row['kind']]}
                             for row in context['activities'] if row['kind'] in allowed_kinds]
    if 'travel' in allowed_kinds:
        context['travel'] = {key: value for key, value in quotes.items() if key in ('candidates', 'budget')}
    if 'farm' in allowed_kinds:
        context['farm'] = farm_summary(owner, agent, context['slots'])
    if 'lottery' in allowed_kinds:
        from .lottery_decision import summary
        context['lottery'] = summary(owner, agent.pk)
    if 'investment' in allowed_kinds:
        context['investment'] = investment_summary(owner, agent)
    from .life_main_social import summaries
    context.update(summaries(agent, [task for task in tasks.values() if task.task_kind in allowed_kinds], day))
    return context
