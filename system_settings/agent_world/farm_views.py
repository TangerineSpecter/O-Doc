import copy
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result
from system_settings.models import Agent, WorldAction, AgentActivity
from .farm_models import AgentFarm, FarmCatalog
from .farm_catalog import DEFAULT_RULES, validate_rules
from .farm_clock import weather, advance_state, wet_intervals
from .farm_gate import farm_gate
from .farm_runner import farm_inventory


def present(farm):
    catalog = FarmCatalog.objects.get(pk=farm.owner_id)
    now = timezone.now()
    state = copy.deepcopy(farm.state)
    # GET 只推导展示状态；生产品质采用确定性抽取，业务库存仍仅在事务中领取。
    advance_state(state, catalog.seed, now.timestamp())
    for plot in state['plots']:
        plot['wet'] = bool(wet_intervals(catalog.seed, now.timestamp(), now.timestamp() + .001, plot['watered_until']))
    agent = Agent.objects.filter(pk=farm.pk).first()
    current = WorldAction.objects.filter(actor_id=farm.pk, snapshot__farm=True, status='claimed').order_by('-created_at').first()
    activity = AgentActivity.objects.filter(run_record_id=current.record_id, status='running').first() if current and current.record_id else None
    return {'id': farm.pk, 'actor_name': agent.name if agent else farm.actor_name, 'appearance': farm.appearance,
        'balance': str(agent.money) if agent else None, 'revision': farm.revision, 'server_time': now,
        'weather': weather(catalog.seed, now.timestamp()), 'hour': now.astimezone(__import__('zoneinfo').ZoneInfo('Asia/Shanghai')).hour,
        'state': state, 'current_action': activity.current_action if activity else current.record.summary if current and current.record else None,
        'inventory': [{'id': i.pk, 'name': i.name, 'quantity': i.quantity, 'value': str(i.value), 'sku': i.source.get('sku', ''), 'quality': i.source.get('quality', 'normal')} for i in farm_inventory(farm)]}


class FarmListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = get_current_user_identifier(request)
        return success_result([{'id': f.pk, 'actor_name': f.actor_name, 'appearance': f.appearance} for f in AgentFarm.objects.filter(owner_id=owner).order_by('actor_name', 'id')])


class FarmDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, farm_id):
        with farm_gate():
            farm = get_object_or_404(AgentFarm, pk=farm_id, owner_id=get_current_user_identifier(request))
            return success_result(present(farm))

    def patch(self, request, farm_id):
        appearance = request.data.get('appearance')
        if not isinstance(appearance, dict) or set(appearance) != {'style', 'palette'} or any(type(v) is not int or not 0 <= v <= 3 for v in appearance.values()):
            raise serializers.ValidationError('请选择有效的像素形象和配色')
        with farm_gate(), transaction.atomic():
            farm = get_object_or_404(AgentFarm.objects.select_for_update(), pk=farm_id, owner_id=get_current_user_identifier(request))
            farm.appearance = appearance
            farm.revision += 1
            farm.updated_at = timezone.now()
            farm.save(update_fields=['appearance', 'revision', 'updated_at'])
        return success_result(appearance)


class FarmHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, farm_id):
        farm = get_object_or_404(AgentFarm, pk=farm_id, owner_id=get_current_user_identifier(request))
        return success_result(list(farm.operations.values('id', 'operation', 'result', 'reason', 'created_at')[:100]))


class FarmCatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        catalog = FarmCatalog.objects.filter(pk=get_current_user_identifier(request)).first()
        return success_result(catalog.rules if catalog else copy.deepcopy(DEFAULT_RULES))

    def patch(self, request):
        rules = validate_rules(request.data.get('rules'))
        from .farm_catalog import catalog_for
        with farm_gate(), transaction.atomic():
            catalog = catalog_for(get_current_user_identifier(request))
            catalog.rules = rules
            catalog.save(update_fields=['rules', 'updated_at'])
        return success_result(rules)
