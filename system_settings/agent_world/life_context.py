"""有界生活事实输入；缺失资源标为未知，不装载同步审计链。"""
from decimal import Decimal
from django.utils import timezone
from system_settings.models import AgentRunRecord, AgentTask
from .life_budget_policy import allows_spending, effective_budget, remaining_reservation
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
    from .cooking_queries import overview as cooking_overview, recipes as cooking_recipes
    context['cooking'] = {'skill': cooking_overview(owner, agent.pk), 'recipes': cooking_recipes(owner, agent)}
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
    from .social_models import SocialOpportunity
    context['recent_social'] = list(SocialOpportunity.objects.filter(owner_id=owner, actor_id=agent.pk, status='completed').order_by('-created_at').values('id', 'result', 'created_at')[:10])
    context['recent_experiences'] = list(AgentRunRecord.objects.filter(agent_id=agent.pk).order_by('-created_at').values('id','task_name','status','summary','created_at')[:20])
    context['ongoing_travel'] = list(TravelJourney.objects.filter(actor_id=agent.pk, returned_at__isnull=True, status__in=['active','waiting','paused','manual']).values('id','phase','status')[:5])
    rows = LifeItem.objects.filter(owner_id=owner, actor_id=agent.pk, status__in=OPEN).order_by('scheduled_at')
    context['upcoming_total']=rows.count()
    context['upcoming'] = [{'id':r.pk,'time':r.scheduled_at.isoformat(),'activity':r.activity,'intent':r.intent,'budget':str(effective_budget(r)),'spent':str(r.spent)} for r in rows[:50]]
    prices = sorted(TravelDestination.objects.filter(enabled=True).values_list('price', flat=True))
    context['travel_costs'] = {'minimum':str(prices[0]), 'typical':str(prices[len(prices)//2]), 'maximum':str(prices[-1]), 'shopping_extra':True} if prices else None
    from .farm_catalog import catalog_for
    farm_tasks = [t for t in tasks_for(owner) if t.task_kind == 'farm' and t.enabled]
    if farm_tasks:
        rules = catalog_for(owner).rules
        context['farm_prices'] = {'land':rules['land_prices'], 'buildings':{k:v['prices'] for k,v in rules['buildings'].items()}}
        farm_state = context.get('farm')
        if farm_state:
            plots = len(farm_state['plots'])
            group = plots // 4
            context['farm_prices']['current_expansion'] = {
                'plots': plots, 'next_plots': plots + 4 if group < 4 else None,
                'cost': str(rules['land_prices'][group - 1]) if 1 <= group < 4 else None,
            }
    from .travel_config import bound_skill
    context['activities'] = [{'kind':t.task_kind,'task_id':t.pk,'preference':t.prompt,'allows_spending':allows_spending(t.task_kind)} for t in tasks_for(owner) if t.enabled and t.task_kind != 'market' and (t.task_kind != 'travel' or bound_skill(agent,'odoc_travel_journal'))]
    from .life_config import config_for, effective_settings
    from .farm_queue_plan import overview as queue_overview
    from .farm_models import AgentFarm
    context['farm_queue'] = queue_overview(AgentFarm.objects.filter(pk=agent.pk, owner_id=owner).first())
    context['farm_queue_rules'] = {'check_minutes': 30, 'start': '个人farm日程时间', 'cutoff': effective_settings(config_for(owner)).get('active_end', '24:00'), 'rule': '当天规划数量和种植顺序，市场错开采购，成熟跨日收获；后续执行不调用模型。'}
    context['custom_commitments'] = [{'name':t.name,'schedule':t.schedule,'time':t.schedule_time} for t in AgentTask.objects.filter(task_kind='custom',enabled=True) if agent.pk in (t.agent_ids or [t.agent_id])][:20]
    today = local_time().date()
    context['today'] = list(LifeItem.objects.filter(owner_id=owner, actor_id=agent.pk, scheduled_at__date=today).values('id','activity','status','intent','result')[:50])
    if item:
        reserved = sum((remaining_reservation(r) for r in rows if r.pk != item.pk), Decimal(0))
        context['current'] = {'id':item.pk,'activity':item.activity,'intent':item.intent,'budget':str(effective_budget(item)),'spent':str(item.spent)}
        context['reserved_for_others'] = str(reserved)
        context['spendable'] = str(max(Decimal(0), min(remaining_reservation(item), agent.money-reserved)))
    context['rules'] = '余额是共用生活资金。实际结果才算经历。阅读评论、发帖和休息不预留新预算、不附带采购。仅为有消费能力的活动预留实际费用；投资不能借款且T+1。缺货或超出估计可说明原因调整后续计划，实际余额不足不能扣款。'
    context['rules'] += '农场每天最多安排一次错开开工；后续按半小时检查种植队列，不占日程，不调用模型，不即时补给。'
    import json
    from django.core.serializers.json import DjangoJSONEncoder
    return json.loads(json.dumps(context,cls=DjangoJSONEncoder,ensure_ascii=False))
