"""旅行节点：模型只提议，持久化后的决策由服务器执行。"""
import random
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR
from django.db import transaction
from django.utils import timezone
from .travel_ai import ask, local_materials, text, sourced_items
from .travel_config import bound_skill
from .travel_models import TravelNode, TravelJourney
from .travel_settlement import depart, purchase
from .inventory_attributes import souvenir_attributes

EVENTS = [
    {'type': 'negative', 'description': '模拟遭遇：原计划的入口临时关闭，你扑了个空。', 'choices': ['改去下一站', '在附近散步', '稍作休息']},
    {'type': 'positive', 'description': '模拟遭遇：路过的人热心地指出一个适合留影的位置。', 'choices': ['接受建议拍照', '道谢后继续游览', '在原处欣赏风景']},
    {'type': 'neutral', 'description': '模拟遭遇：天气突然转阴，街上起了风。', 'choices': ['找地方避风', '继续慢慢游览', '提前去下一站']},
    {'type': 'negative', 'description': '模拟遭遇：一只小狗追着你跑了几步。', 'choices': ['停下来保持距离', '绕到另一条路', '向附近的人求助']},
]


def decide(journey, node, instruction, context, validate, skill=''):
    if node.result:
        return node.result
    result = ask(journey, instruction, context, validate, skill=skill)
    node.result = result
    node.save(update_fields=['result', 'updated_at'])
    return result


def advance(journey):
    phase = journey.phase
    node, _ = TravelNode.objects.get_or_create(pk=f'{journey.pk}:{phase}', defaults={'journey': journey, 'kind': phase})
    refresh_materials = phase == 'plan' and bool(node.error) and not node.result
    if refresh_materials:
        node.input = {**node.input, 'refresh_materials': True}
    node.status, node.error = 'running', ''
    node.save(update_fields=['status', 'error', 'input', 'updated_at'])
    state = dict(journey.snapshot)
    agent = journey.agent
    agent.refresh_from_db()
    if phase == 'preview':
        index = len(state.get('previews', []))
        if not state['candidates']:
            journey.status = 'skipped'
            state['skip_reason'] = '没有已启用的目的地'
            next_phase = 'done'
        else:
            city = state['candidates'][index]
            sources = local_materials(journey, city)
            # 一次节点只准备一个城市；已完成资料不因另一个城市失败而重做。
            def validate(v):
                return {'feature': text(v, 'feature', 500)}
            preview_node, _ = TravelNode.objects.get_or_create(pk=f'{journey.pk}:preview-{index}', defaults={'journey': journey, 'kind': 'preview', 'input': city})
            intro = decide(journey, preview_node, '根据资料写一句该城市的旅行特色，返回 {"feature":"..."}，不得增加资料没有的景点。', {'destination': city, 'sources': sources}, validate)
            state.setdefault('previews', []).append({'destination_id': city['id'], **intro, 'sources': sources})
            next_phase = 'choose' if len(state['previews']) == len(state['candidates']) else 'preview'
    elif phase == 'choose':
        from .travel_memory import recent_travel_context
        def validate(v):
            reason = text(v, 'reason', 1000)
            if v.get('destination_id') == 'skip':
                return {'destination_id': 'skip', 'reason': reason, 'shopping_budget': '0'}
            selected = next((c for c in state['candidates'] if c['id'] == v.get('destination_id')), None)
            budget = Decimal(str(v.get('shopping_budget')))
            if not selected or not budget.is_finite() or budget < 0 or Decimal(selected['price'])+budget > agent.money:
                raise ValueError('所选路线或购物预算超过余额')
            return {'destination_id': selected['id'], 'reason': reason, 'shopping_budget': str(budget.quantize(Decimal('.01')))}
        selection = decide(journey, node, '自主决定旅行或本次不去。返回 {"destination_id":"候选ID或skip","reason":"原因","shopping_budget":0}。购物预算是上限，不提前扣除。',
            {'candidates': state['candidates'], 'previews': state['previews'], 'balance': str(agent.money), 'past_travels': recent_travel_context(agent)}, validate)
        state['selection'] = selection
        if selection['destination_id'] == 'skip':
            journey.status, next_phase = 'skipped', 'done'
        else:
            state['selected'] = next(c for c in state['candidates'] if c['id'] == selection['destination_id'])
            journey.destination_id = selection['destination_id']
            next_phase = 'plan'
    elif phase == 'plan':
        selected = state['selected']
        sources = next(p['sources'] for p in state['previews'] if p['destination_id'] == selected['id'])
        sources = node.input.get('sources', sources)
        if node.input.get('refresh_materials') and not node.result:
            sources = local_materials(journey, selected, force_refresh=True)
            node.input = {**node.input, 'sources': sources, 'refresh_materials': False}
            node.save(update_fields=['input', 'updated_at'])
            state['sources'] = sources
            journey.snapshot = state
            journey.save(update_fields=['snapshot', 'updated_at'])
        def validate(v):
            return {'sites': sourced_items(v['sites'], sources, minimum=2, maximum=3),
                    'foods': sourced_items(v['foods'], sources, minimum=2, maximum=3),
                    'souvenirs': sourced_items(v['souvenirs'], sources, minimum=3, maximum=5)}
        plan = decide(journey, node, '整理目的地行程。返回 sites(2–3)、foods(2–3)、souvenirs(3–5)数组，每项含 name、description、source_url、evidence_quote（来源原文中的依据片段）、belongs_to_destination:true。必须核实属于目的地，只采用资料支持的名称。纪念品是当地主题虚拟商品。',
                      {'destination': selected, 'sources': sources}, validate)
        state['plan'], state['sources'] = plan, sources
        state['events'] = random.sample(EVENTS, random.randint(1, 2))
        goods = []
        base = Decimal(selected['price'])
        for i, item in enumerate(plan['souvenirs']):
            lower = max(1, int((base*Decimal('.01')/10).to_integral_value(rounding=ROUND_CEILING)))
            upper = max(lower, int((base*Decimal('.1')/10).to_integral_value(rounding=ROUND_FLOOR)))
            units = random.randint(lower, upper)
            price = str(units*10)
            goods.append({**item, 'id': str(i+1), 'price': price, **souvenir_attributes(price)})
        state['goods'] = goods
        next_phase = 'depart'
    elif phase == 'depart':
        journey = depart(journey)
        next_phase = 'visit-0'
    elif phase.startswith('visit-'):
        index = int(phase.split('-')[1])
        site = state['plan']['sites'][index]
        def validate(v):
            if v.get('choice') not in ['游览', '拍照', '休息', '略过']:
                raise ValueError('游览选项无效')
            return {'site': site, 'choice': v['choice'], 'reaction': text(v, 'reaction')}
        result = decide(journey, node, '已抵达该站，自主选择游览、拍照、休息或略过。返回 {"choice":"选项","reaction":"符合自己性格的感受"}。不改变费用，不添加关键事件。', {'site': site, 'destination': state['selected']}, validate)
        state.setdefault('visits', []).append(result)
        next_phase = f'event-{index}' if index < len(state['events']) else (f'visit-{index+1}' if index+1 < len(state['plan']['sites']) else 'food')
    elif phase.startswith('event-'):
        index = int(phase.split('-')[1])
        event = state['events'][index]
        def validate(v):
            if v.get('choice') not in event['choices']:
                raise ValueError('遭遇选项无效')
            return {**event, 'choice': v['choice'], 'reaction': text(v, 'reaction')}
        result = decide(journey, node, '面对已经发生的模拟遭遇选择应对，返回 {"choice":"提供的选项","reaction":"反应"}。没有资金或物品奖励、伤害。', event, validate)
        state.setdefault('encounters', []).append(result)
        next_phase = f'visit-{index+1}' if index+1 < len(state['plan']['sites']) else 'food'
    elif phase == 'food':
        foods = state['plan']['foods']
        def validate(v):
            if v.get('choice') not in [f['name'] for f in foods]+['普通餐', '不尝试']:
                raise ValueError('美食选项无效')
            return {'choice': v['choice'], 'reaction': text(v, 'reaction')}
        state['food'] = decide(journey, node, '选择一项当地美食或普通餐／不尝试。已经包含在旅行总价内。返回 {"choice":"名称","reaction":"体验或不尝试的理由"}，尊重角色饮食限制。', {'foods': foods}, validate)
        next_phase = 'buy'
    elif phase == 'buy':
        def validate(v):
            basket = v.get('basket')
            if not isinstance(basket, list):
                raise ValueError('购物篮必须是数组')
            goods = {g['id']: g for g in state['goods']}
            seen, amount = set(), Decimal('0')
            for item in basket:
                if item.get('id') not in goods or item['id'] in seen or type(item.get('quantity')) is not int or not 1 <= item['quantity'] <= 3:
                    raise ValueError('商品或数量越界')
                seen.add(item['id'])
                amount += Decimal(goods[item['id']]['price'])*item['quantity']
            if amount > min(agent.money, Decimal(state['selection']['shopping_budget'])):
                raise ValueError('超过购物预算或余额')
            return {'basket': basket, 'reason': text(v, 'reason')}
        basket = decide(journey, node, '自主购买纪念品或不买。返回 {"basket":[{"id":"商品ID","quantity":1}],"reason":"理由"}，不买返回空数组。每种最多3件。',
            {'goods': state['goods'], 'budget': state['selection']['shopping_budget'], 'balance': str(agent.money)}, validate)
        purchase(journey, basket['basket'])
        state['shopping'] = basket
        next_phase = 'return'
    elif phase == 'return':
        journey.returned_at = timezone.now()
        next_phase = 'journal'
    elif phase == 'journal':
        skill = bound_skill(agent, 'odoc_travel_journal')
        if not skill:
            raise ValueError('旅行游记 Skill 已解绑或停用，请恢复配置')
        def validate(v):
            return {'title': text(v, 'title', 180), 'content': text(v, 'content', 30000),
                    'reflection': text(v, 'reflection', 2000), 'photo_scene': text(v, 'photo_scene', 2000)}
        state['draft'] = decide(journey, node, '为这次实际已发生的模拟旅行写日记，不能拒绝写作，不能把未选美食、未买物品或未游览景点写成经历。返回 {"title":"...","content":"Markdown正文，不放图片占位符","reflection":"心得","photo_scene":"一个已经发生的配图片段"}。',
                                {'journey': state, 'ended_early': state.get('ended_early', False)}, validate, skill.prompt)
        next_phase = 'publish'
    elif phase == 'publish':
        from .travel_publication import publish_journal
        publish_journal(journey)
        journey.refresh_from_db()
        state = journey.snapshot
        journey.status, next_phase = 'completed', 'done'
    else:
        raise ValueError('未知旅行节点')
    with transaction.atomic():
        journey.snapshot, journey.phase = state, next_phase
        journey.save()
        if journey.status == 'completed':
            from .travel_memory import remember_travel
            remember_travel(journey)
        node.status = 'skipped' if journey.status == 'skipped' else 'success'
        node.save(update_fields=['status', 'updated_at'])
    return journey
