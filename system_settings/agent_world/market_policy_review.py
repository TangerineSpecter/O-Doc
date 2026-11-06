"""Daily resumable finite policy choices; complete policies are published atomically."""
import hashlib
import json
from django.db import transaction
from django.utils import timezone
from .farm_gate import farm_gate
from .inventory_policy import is_current, quantity_choices, validate
from .life_time import local_time
from .market_plan_models import MarketPlan, MarketDisposition, disposition_id, plan_id

KEY = 'inventory_policy_reviews'


class Progress:
    def __init__(self, plan, sku, signature):
        self.plan, self.sku = plan, sku
        self.pk = f'{plan.pk}:{sku}:{signature}'
        self.state = (plan.context or {}).get(KEY, {}).get(sku, {})
        if self.state.get('signature') != signature:
            self.state = {'signature': signature, 'answers': {}, 'status': 'pending'}
        self.answers = self.state.get('answers', {})

    def save(self, **_kwargs):
        # The save signal fingerprints all market assets, not just this plan.
        with farm_gate(), transaction.atomic():
            plan = MarketPlan.objects.select_for_update().get(pk=self.plan.pk)
            self.state = {**self.state, 'answers': self.answers}
            reviews = {**(plan.context or {}).get(KEY, {}), self.sku: self.state}
            plan.context = {**(plan.context or {}), KEY: reviews}
            plan.save(update_fields=['context', 'updated_at'])


def decide(owner, agent, task, budget, state, ask):
    from .market_policy_facts import facts
    from .market_disposition_worker import ModelUnavailable
    from .market_disposition import can_shop_sell
    from .market_shop import config_for
    day = local_time(timezone.now()).date()
    with farm_gate(), transaction.atomic():
        config_for(owner)
        plan, _ = MarketPlan.objects.get_or_create(pk=plan_id(owner, agent.pk, day), defaults={
            'owner_id': owner, 'actor_id': agent.pk, 'actor_name': agent.name, 'plan_date': day, 'status': 'pending'})
        current, _ = MarketDisposition.objects.get_or_create(pk=disposition_id(owner, agent.pk, task.sku), defaults={
            'owner_id': owner, 'actor_id': agent.pk, 'sku': task.sku, 'status': 'review'})
    if is_current(current) and current.strategy['reviewed_date'] == day.isoformat():
        return
    inputs = facts(owner, agent.pk, task.sku)
    expected_revision = current.revision if current else 0
    signature = hashlib.sha256(json.dumps({'purposes': inputs['purposes'], 'revision': expected_revision},
                                         sort_keys=True).encode()).hexdigest()
    progress = Progress(plan, task.sku, signature)
    state = {**state, **inputs}
    from .market_plan_candidates import crafting_demand_facts
    try:
        state['crafting_demand'] = crafting_demand_facts(owner, agent.pk, task.sku)
    except Exception:
        import logging
        logging.getLogger(__name__).exception('市场需求统计不可用 actor=%s sku=%s', agent.pk, task.sku)
        state['crafting_demand'] = {'status': 'unavailable', 'demand_resident_count': None}

    def choose(key, choices, instruction):
        return ask(owner, agent, progress, budget, key, state, choices, instruction)

    try:
        keep = is_current(current) and choose('review', {'keep': '沿用完整策略', 'change': '重新制定策略'},
                                               '复核今天的用途保留目标与超量处理策略。') == 'keep'
        if keep:
            strategy = {**current.strategy, 'reviewed_date': day.isoformat()}
            sell, listed, order, price = current.sell_ratio, current.list_ratio, current.star_order, str(current.list_price_ratio)
        else:
            targets = {}
            for purpose, data in inputs['purposes'].items():
                previous = current.strategy['targets'].get(purpose) if is_current(current) else None
                options = quantity_choices(task.sku, data['unit'], previous)
                if purpose != 'self_use' and not data['recipes']:
                    options = {'0': '无对应配方，备用目标为0'}
                targets[purpose] = int(choose('target:' + purpose, options,
                    f'决定 {purpose} 的原料/自用目标个数，包含该用途已排计划；不是在当前库存中标记物品，不自动采购。'))
            starred = task.sku.startswith(('crop.', 'dish.', 'elixir.'))
            retain_order = choose('retain_order', {'high': '优先留下高星', 'low': '优先留下低星'},
                                  '决定备用目标先保护哪些星级。已确认制作的用料不改变。') if starred else 'low'
            channels = {'list': '超量全部挂牌'}
            if can_shop_sell(task.sku):
                channels = {'sell': '超量全部出售', **channels, 'split': '超量分别出售和挂牌'}
            channel = choose('channel', channels, '即使现在没有超量，也要决定今后超量的处理渠道。')
            sell = (int(choose('ratio', {'25': '出售25%，挂牌75%', '50': '各一半', '75': '出售75%，挂牌25%'},
                               '分配超量数量，合计100%。')) if channel == 'split' else 100 if channel == 'sell' else 0)
            listed = 100 - sell
            order = choose('stars', {'low': '超量低星优先处理', 'high': '超量高星优先处理'},
                           '从保护目标以外的库存中，决定先处理哪些星级。') if starred else 'low'
            price = choose('price', {'1.00': '基准价', '1.20': '基准价1.2倍', '1.50': '基准价1.5倍', '2.00': '基准价2倍'},
                           '制定未来超量的挂牌价；挂牌不等于成交。') if listed else '1.20'
            strategy = {'version': 1, 'targets': targets, 'retain_order': retain_order, 'reviewed_date': day.isoformat()}
        validate(strategy, sell_ratio=sell, list_ratio=listed)
        if local_time(timezone.now()).date() != day:
            raise ValueError('库存策略复核已跨日，等待今日重新复核')
        with farm_gate(), transaction.atomic():
            live = MarketDisposition.objects.select_for_update().filter(pk=disposition_id(owner, agent.pk, task.sku)).first()
            if (live.revision if live else 0) != expected_revision:
                raise ValueError('复核期间库存策略已更新，等待重查')
            MarketDisposition.objects.update_or_create(pk=disposition_id(owner, agent.pk, task.sku), defaults={
                'owner_id': owner, 'actor_id': agent.pk, 'sku': task.sku, 'strategy': strategy,
                'target_hold': sum(strategy['targets'].values()), 'sell_ratio': sell, 'list_ratio': listed,
                'star_order': order, 'list_price_ratio': price, 'status': 'active', 'source': 'model',
                'reason': '按用途目标保护库存，超量执行处置策略', 'revision': expected_revision + 1})
            progress.state['status'] = 'done'
            progress.save()
    except ModelUnavailable:
        progress.state['status'] = 'review'
        with farm_gate(), transaction.atomic():
            progress.save()
            if not is_current(current):
                MarketDisposition.objects.get_or_create(pk=disposition_id(owner, agent.pk, task.sku), defaults={
                    'owner_id': owner, 'actor_id': agent.pk, 'sku': task.sku, 'status': 'review',
                    'source': 'default', 'reason': '尚无完整用途策略，保留库存等待复核'})
        raise
