"""Load bounded business facts and account-visible stable resident identities."""
from dataclasses import dataclass, field
from article.access import get_visible_anthology_queryset
from article.models import Article
from system_settings.models import Agent, AgentActivity, AgentRunRecord
from ..daily_feed import _actor_scope
from ..life_models import LifeProfile
from ..farm_models import AgentFarm, FarmOperation
from ..cooking_models import CookingSkill, CookingOperation
from ..travel_models import TravelJourney
from ..market_models import MarketTransaction
from ..investment_models import InvestmentTrade, InvestmentAccount
from ..social_models import Moment, MomentComment, MomentLike
from ..combat.models import CombatFact, CombatEncounter, Exploration, CombatProfile
from ..models import WorldLedger


def resident_id(value):
    # Legacy name-based identities cannot be assigned to today's same-name resident.
    return value[9:] if str(value).startswith('agent-id:') else ''


@dataclass(frozen=True)
class Event:
    key: str
    actor: str
    at: object
    category: str
    peer: str = ''
    peer_name: str = ''
    name: str = ''


@dataclass
class Facts:
    residents: dict = field(default_factory=dict)
    events: list = field(default_factory=list)
    ledger: list = field(default_factory=list)
    harvests: list = field(default_factory=list)
    collections: list = field(default_factory=list)
    journeys: list = field(default_factory=list)
    explorations: list = field(default_factory=list)
    wins: list = field(default_factory=list)
    unknown: set = field(default_factory=set)


def load_facts(request, owner, start, end):
    facts = Facts()
    actors = _actor_scope(owner)
    # Unassigned global residents remain visible, as in the residents sidebar; assets owned by another account do not.
    foreign = set()
    for model in (LifeProfile, AgentFarm, CookingSkill, InvestmentAccount, CombatProfile):
        foreign.update(model.objects.exclude(owner_id=owner).values_list('id', flat=True))
    actors.update(Agent.objects.exclude(pk__in=foreign).values_list('id', flat=True))
    actors.update(CookingSkill.objects.filter(owner_id=owner).values_list('id', flat=True))
    for model in (CookingOperation, InvestmentTrade, MarketTransaction, Exploration, CombatFact):
        actors.update(model.objects.filter(owner_id=owner).values_list('actor_id', flat=True))

    def remember(actor, name='', avatar=''):
        if actor:
            actors.add(actor)
            facts.residents.setdefault(actor, {'id': actor, 'name': name or '历史居民', 'avatar': avatar, 'departed': True})
            if name and facts.residents[actor]['name'] == '历史居民':
                facts.residents[actor]['name'] = name

    # Identity lookup is independent of the selected date window, so old residents remain selectable.
    for model, key, name in ((AgentFarm, 'id', 'actor_name'), (CookingSkill, 'id', 'actor_name'),
                             (TravelJourney, 'actor_id', None), (Exploration, 'actor_id', 'actor_name')):
        fields = [key, name] if name else [key, 'snapshot']
        for actor, value in model.objects.filter(owner_id=owner).values_list(*fields):
            remember(actor, value if name else value.get('agent_name', ''))
    for actor, identity in Moment.objects.filter(owner_id=owner).values_list('actor_id', 'identity'):
        remember(resident_id(actor), identity.get('name', ''), identity.get('avatar', ''))
    owned_activities = AgentActivity.objects.filter(metadata__owner_id=owner)
    for model in (MomentComment, MomentLike):
        for actor, identity in model.objects.filter(moment__owner_id=owner).values_list('actor_id', 'identity'):
            remember(resident_id(actor), identity.get('name', ''), identity.get('avatar', ''))
    for actor, metadata in owned_activities.values_list('agent_id', 'metadata'):
        snapshot = metadata.get('agentSnapshot', {})
        remember(actor or snapshot.get('id', ''), snapshot.get('name', ''), snapshot.get('avatar', ''))
    for actor in list(actors):
        remember(actor)
    for agent in Agent.objects.filter(pk__in=actors):
        facts.residents[agent.pk] = {'id': agent.pk, 'name': agent.name, 'avatar': agent.avatar or '', 'departed': False}

    def window(query, time='created_at'):
        return query.filter(**{time+'__gte': start, time+'__lt': end})

    def add(key, actor, at, category, name='', peer='', peer_name=''):
        # External senders may contribute received interactions, never resident activity totals.
        facts.events.append(Event(key, actor, at, category, peer, peer_name, name))

    visible = tuple(get_visible_anthology_queryset(request).values_list('coll_id', flat=True))
    for actor, name, avatar in Article.objects.filter(coll_id__in=visible, agent_post_author_id__in=actors).values_list(
            'agent_post_author_id', 'agent_post_creator_name', 'agent_post_creator_avatar'):
        remember(actor, name, avatar)
    for model in (CookingOperation, MarketTransaction, InvestmentTrade):
        for actor, name in model.objects.filter(owner_id=owner).values_list('actor_id', 'actor_name').distinct():
            remember(actor, name)
    activities = list(window(AgentActivity.objects.filter(status='success', artifact_coll_id__in=visible)
                        .exclude(action__startswith='social_').exclude(activity_type='work'), 'occurred_at').order_by('occurred_at', 'id'))
    from .articles import article_events
    article_events(visible, actors, start, end, activities, add)
    for row in activities:
        actor = row.agent_id or row.metadata.get('agentSnapshot', {}).get('id', '')
        if row.activity_type not in ('publication', 'interaction'):
            continue
        if actor not in actors and resident_id(row.counterpart_id) not in actors:
            continue
        category = 'publication' if row.activity_type == 'publication' else 'social'
        key = 'publication:'+row.artifact_id if category == 'publication' and row.artifact_id else row.event_key
        add(key, actor, row.occurred_at, category, peer=resident_id(row.counterpart_id) or row.counterpart_id,
            peer_name=row.counterpart_name)
        if row.counterpart_type == 'agent' and row.counterpart_id.startswith('agent:'):
            facts.unknown.add('部分旧文章互动使用名称身份，无法确定接收居民；未按同名居民补算。')

    for row in window(Moment.objects.filter(owner_id=owner, is_valid=True)):
        actor = resident_id(row.actor_id)
        if actor:
            add('moment:'+row.pk, actor, row.created_at, 'publication')
    comments = window(MomentComment.objects.filter(moment__owner_id=owner, is_valid=True)).select_related('moment')
    for row in comments:
        peer = row.reply_to_actor_id or row.moment.actor_id
        add('moment-comment:'+row.pk, resident_id(row.actor_id) or row.actor_id, row.created_at, 'social',
            peer=resident_id(peer) or peer, peer_name=row.moment.identity.get('name', '') if not row.reply_to_actor_id else '')
    # Likes store their latest state/time, rather than an immutable first-like timestamp.
    for row in window(MomentLike.objects.filter(moment__owner_id=owner, is_valid=True), 'updated_at').select_related('moment'):
        add('moment-like:'+row.pk, resident_id(row.actor_id) or row.actor_id, row.updated_at, 'social',
            peer=resident_id(row.moment.actor_id) or row.moment.actor_id, peer_name=row.moment.identity.get('name', ''))
    facts.unknown.add('朋友圈点赞按保留的有效状态及更新时间统计，已撤销的点赞不计入。')
    facts.unknown.add('评分按现存评分记录计一次，不还原每次改分；未保存稳定任务类型的旧工作不补算。')

    # Dedicated world tasks already have business facts. Only custom work is counted here.
    runs = window(AgentRunRecord.objects.filter(task__task_kind='custom').exclude(status='failed'), 'started_at')
    for row in runs:
        ids = {row.agent_id} if row.agent_id in actors else set()
        ids.update(run.get('agent') for run in (row.agent_runs or []) if isinstance(run, dict) and run.get('agent') in actors)
        for actor in ids:
            add('work:'+row.pk+':'+actor, actor, row.started_at, 'work', row.agent_name)

    for row in window(FarmOperation.objects.filter(farm__owner_id=owner)).select_related('farm'):
        if row.result.get('success') is False or row.result.get('error'):
            continue
        add('farm:'+row.pk, row.farm_id, row.created_at, 'farm', row.farm.actor_name)
        if row.operation.get('kind') == 'harvest': facts.harvests.append(row.farm_id)
        if row.operation.get('kind') == 'collect': facts.collections.append(row.farm_id)
    for model, category in ((CookingOperation, 'cooking'), (MarketTransaction, 'market'), (InvestmentTrade, 'investment')):
        for row in window(model.objects.filter(owner_id=owner)):
            if row.result.get('success') is False or row.result.get('error'):
                continue
            add(category+':'+row.pk, row.actor_id, row.created_at, category, row.actor_name)
    for row in window(TravelJourney.objects.filter(owner_id=owner), 'departed_at'):
        add('travel:'+row.pk, row.actor_id, row.departed_at, 'travel')
    facts.journeys = list(window(TravelJourney.objects.filter(owner_id=owner, status='completed'), 'returned_at'))
    if TravelJourney.objects.filter(owner_id=owner, status='completed', returned_at__isnull=True).exists():
        facts.unknown.add('部分旧旅行未记录返程时间，未计入区间完成成果。')
    # The immutable departure fact is the actual start, not preparing/created_at or mutable updated_at.
    for row in window(CombatFact.objects.filter(owner_id=owner, kind='depart')):
        add('exploration:'+row.exploration_id, row.actor_id, row.created_at, 'exploration')
    facts.explorations = list(window(Exploration.objects.filter(owner_id=owner), 'ended_at'))
    facts.wins = list(window(CombatEncounter.objects.filter(owner_id=owner, result__killed=True), 'ended_at'))
    facts.ledger = list(window(WorldLedger.objects.filter(agent_id__in=actors).exclude(kind='opening').exclude(amount=0)))
    return facts
