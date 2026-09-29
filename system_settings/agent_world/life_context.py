"""有界生活事实输入；缺失资源标为未知，不装载同步审计链。"""
from decimal import Decimal
from django.utils import timezone
from system_settings.models import AgentRunRecord, AgentTask
from .life_models import LifeProfile, LifeGoal, LifeItem
from .life_schedule import OPEN, SHANGHAI
from .life_config import tasks_for
from .life_time import local_time,storage_time
from .market_queries import actor_context
from .investment_queries import overview
from .travel_models import TravelDestination, TravelJourney


def build_context(owner: str, agent, item: LifeItem | None = None) -> dict:
    profile = LifeProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    context = actor_context(owner, agent)
    context['inventory_total']=len(context['inventory'])
    context['inventory']=context['inventory'][:100]
    try:
        context['investment'] = overview(owner, agent.pk)
    except ValueError:
        context['investment'] = None
    context.update(actor_id=agent.pk, actor_name=agent.name, role=agent.prompt, profession_id=agent.profession_id,
                   profession=agent.profession.name if agent.profession_id else '未设置',
                   preferences=profile.preferences if profile else '', direction=profile.direction if profile else '')
    goals=LifeGoal.objects.filter(owner_id=owner, actor_id=agent.pk, status='active')
    context['goals_total']=goals.count()
    context['goals'] = list(goals.values('id','title','condition','progress')[:20])
    context['recent_experiences'] = list(AgentRunRecord.objects.filter(agent_id=agent.pk).order_by('-created_at').values('id','task_name','status','summary','created_at')[:20])
    context['ongoing_travel'] = list(TravelJourney.objects.filter(actor_id=agent.pk, returned_at__isnull=True, status__in=['active','waiting','paused','manual']).values('id','phase','status')[:5])
    rows = LifeItem.objects.filter(owner_id=owner, actor_id=agent.pk, status__in=OPEN).order_by('scheduled_at')
    context['upcoming_total']=rows.count()
    context['upcoming'] = [{'id':r.pk,'time':r.scheduled_at.isoformat(),'activity':r.activity,'intent':r.intent,'budget':str(r.budget),'spent':str(r.spent)} for r in rows[:50]]
    prices = sorted(TravelDestination.objects.filter(enabled=True).values_list('price', flat=True))
    context['travel_costs'] = {'minimum':str(prices[0]), 'typical':str(prices[len(prices)//2]), 'maximum':str(prices[-1]), 'shopping_extra':True} if prices else None
    from .farm_catalog import catalog_for
    farm_tasks = [t for t in tasks_for(owner) if t.task_kind == 'farm' and t.enabled]
    if farm_tasks:
        rules = catalog_for(owner).rules
        context['farm_prices'] = {'land':rules['land_prices'], 'buildings':{k:v['prices'] for k,v in rules['buildings'].items()}}
    from .travel_config import bound_skill
    context['activities'] = [{'kind':t.task_kind,'task_id':t.pk,'preference':t.prompt} for t in tasks_for(owner) if t.enabled and t.task_kind != 'market' and (t.task_kind != 'travel' or bound_skill(agent,'odoc_travel_journal'))]
    context['custom_commitments'] = [{'name':t.name,'schedule':t.schedule,'time':t.schedule_time} for t in AgentTask.objects.filter(task_kind='custom',enabled=True) if agent.pk in (t.agent_ids or [t.agent_id])][:20]
    today = local_time().date()
    context['today'] = list(LifeItem.objects.filter(owner_id=owner, actor_id=agent.pk, scheduled_at__date=today).values('id','activity','status','intent','result')[:50])
    if item:
        reserved = sum((max(Decimal(0), r.budget-r.spent) for r in rows if r.pk != item.pk), Decimal(0))
        context['current'] = {'id':item.pk,'activity':item.activity,'intent':item.intent,'budget':str(item.budget),'spent':str(item.spent)}
        context['reserved_for_others'] = str(reserved)
        context['spendable'] = str(max(Decimal(0), min(item.budget-item.spent, agent.money-reserved)))
    context['rules'] = '余额是共用生活资金。实际结果才算经历。先预留后续活动费用；投资不能借款且T+1。缺货或超出估计可说明原因调整后续计划，实际余额不足不能扣款。'
    import json
    from django.core.serializers.json import DjangoJSONEncoder
    return json.loads(json.dumps(context,cls=DjangoJSONEncoder,ensure_ascii=False))
