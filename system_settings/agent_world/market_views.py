from datetime import datetime, time, timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .farm_gate import farm_gate
from .life_time import local_time, storage_time
from .market_shop import shop_payload, config_for
from .market_plan_models import MarketGoal, MarketNoBuy, MarketPlan, MarketTick, plan_id
from .market_queries import listings, history, sessions
from .market_sessions import cleanup


class MarketShopView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_result(shop_payload(get_current_user_identifier(request)))


class MarketConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = config_for(get_current_user_identifier(request))
        return success_result({'slot_count':config.slot_count})

    def patch(self, request):
        count = request.data.get('slot_count')
        if type(count) is not int or not 1 <= count <= 1000:
            return valid_result('商品位数量须为1至1000的整数', status=400)
        with farm_gate(), transaction.atomic():
            config = config_for(get_current_user_identifier(request))
            config.slot_count = count; config.save(update_fields=['slot_count','updated_at'])
        return success_result({'slot_count':count})


class MarketListView(APIView):
    permission_classes = [IsAuthenticated]
    kind = 'listings'

    def get(self, request):
        owner = get_current_user_identifier(request)
        with farm_gate():
            cleanup()
            try:
                result = {'listings':listings,'transactions':history,'sessions':sessions}[self.kind](owner, request.query_params)
            except ValueError as exc:
                return valid_result(str(exc), status=400)
        return success_result(result)


class MarketAutomationView(APIView):
    """当日市场规划、处置策略、装备不买与小时执行原因（只读）。"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = get_current_user_identifier(request)
        actor_id = request.query_params.get('actor_id', '')
        day = local_time(timezone.now()).date()
        midnight = datetime.combine(day, time.min)
        plans = MarketPlan.objects.filter(owner_id=owner, plan_date=day)
        today_ticks = MarketTick.objects.filter(owner_id=owner, hour__gte=storage_time(midnight),
                                                hour__lt=storage_time(midnight + timedelta(days=1)))
        if actor_id:
            plans = plans.filter(actor_id=actor_id)
            today_ticks = today_ticks.filter(actor_id=actor_id)
        actors = list(plans.order_by().values_list('actor_id', flat=True).union(
            today_ticks.order_by().values_list('actor_id', flat=True)).order_by('actor_id')[:20])
        plans_by_actor = {plan.actor_id: plan for plan in plans.filter(actor_id__in=actors)}
        from system_settings.models import Agent
        from .market_policy_queries import policies_payload
        missing_names = dict(Agent.objects.filter(pk__in=set(actors) - plans_by_actor.keys()).values_list('pk', 'name'))
        result = []
        for actor in actors:
            plan = plans_by_actor.get(actor) or MarketPlan(
                id=plan_id(owner, actor, day), actor_id=actor, actor_name=missing_names.get(actor, ''),
                status='pending', summary='巡检仍会检查可独立回收的超量，混合处置等待采购计划生效。')
            goals = list(MarketGoal.objects.filter(plan=plan).values(
                'id', 'kind', 'sku', 'slot', 'min_stars', 'quantity', 'filled_quantity',
                'max_unit_price', 'status', 'reason')) if actor in plans_by_actor else []
            dispositions = policies_payload(owner, plan.actor_id)
            no_buy = list(MarketNoBuy.objects.filter(
                owner_id=owner, actor_id=plan.actor_id).values(
                'equipment_id', 'price', 'reason', 'decided_at')[:50])
            ticks = list(today_ticks.filter(actor_id=actor).values(
                'scheduled_at', 'status', 'reason', 'hits', 'session_id'))
            for row in goals + dispositions + no_buy:
                for key in ('max_unit_price', 'list_price_ratio', 'price'):
                    if key in row and row[key] is not None:
                        row[key] = str(row[key])
            result.append({
                'id': plan.pk, 'actor_id': plan.actor_id, 'actor_name': plan.actor_name,
                'status': plan.status, 'budget': str(plan.budget), 'spent': str(plan.spent),
                'summary': plan.summary, 'equipment_signature': plan.equipment_signature,
                'goals': goals, 'dispositions': dispositions, 'no_buy': no_buy,
                'ticks': sorted(ticks, key=lambda row: row['scheduled_at']),
            })
        return success_result({'date': day.isoformat(), 'plans': result})
