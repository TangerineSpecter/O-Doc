"""可管理、按旅行去重的角色经历，不依赖模型或向量服务。"""
import hashlib
from system_settings.models import AgentLongTermMemory


def remember_travel(journey):
    from .memory.models import AgentMemoryState
    if AgentMemoryState.objects.filter(agent_id=journey.agent_id).exists():
        # New travel facts are consolidated with the rest of the resident's day.
        return None
    if not journey.agent_id or not journey.departed_at or not journey.returned_at:
        return None
    state = journey.snapshot
    city = state.get('selected', {})
    place = ' · '.join(dict.fromkeys(filter(None, [city.get('country'), city.get('region'), city.get('city')])))
    if state.get('destination_scope') in {'region', 'unconfirmed'}:
        place += '（历史目的地范围存在歧义，具体城市未确认）'
    facts = [f'旅行地点：{place}。抵达日期：{journey.arrived_at:%Y-%m-%d}。' if journey.arrived_at else f'旅行地点：{place}。']
    for visit in state.get('visits', []):
        facts.append(f"景点：{visit['site']['name']}；选择：{visit['choice']}；感受：{visit.get('reaction', '')}。")
    food = state.get('food', {})
    if food:
        facts.append(f"美食选择：{food.get('choice', '')}；感受：{food.get('reaction', '')}。")
    for event in state.get('encounters', []):
        description = str(event.get('description', '')).removeprefix('模拟遭遇：')
        facts.append(f"旅途遭遇：{description}；应对：{event.get('choice', '')}；感受：{event.get('reaction', '')}。")
    goods = {g['id']: g for g in state.get('goods', [])}
    basket = state.get('shopping', {}).get('basket', [])
    facts.append('购买纪念品：' + ('、'.join(f"{goods[x['id']]['name']}×{x['quantity']}" for x in basket if x['id'] in goods) or '未购买') + '。')
    if state.get('ended_early'):
        facts.append('旅行提前结束，未执行的行程不属于我的经历。')
    facts.append('心得：' + state.get('draft', {}).get('reflection', ''))
    memory, _ = AgentLongTermMemory.objects.get_or_create(pk='travel-' + hashlib.sha256(journey.pk.encode()).hexdigest()[:32], defaults={
        'agent_id': journey.agent_id, 'scope': 'agent', 'memory_type': 'fact', 'title': f'旅行经历：{place}'[:120],
        'content': '\n'.join(facts)[:12000], 'confidence': 1,
        'metadata': {'source': 'travel', 'journey_id': journey.pk, 'article_id': journey.article_id}})
    return memory


def recent_travel_context(agent, limit=5):
    rows = AgentLongTermMemory.objects.filter(agent=agent, scope='agent', status='active', metadata__source='travel').order_by('-created_at')[:limit]
    return [{'title': row.title, 'content': row.content[:2500]} for row in rows]


def travel_memory_context(agent) -> str:
    memories = recent_travel_context(agent)
    if not memories:
        return ''
    return '以下是你在 Agent 世界内已发生的旅行经历，相关时可以自然回忆；被问及现实世界的亲身经历时应如实区分：\n' + '\n\n'.join(
        memory['title'] + '\n' + memory['content'] for memory in memories)
