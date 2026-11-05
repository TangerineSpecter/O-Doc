import copy
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models.fields.json import KeyTextTransform, KeyTransform
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from system_settings.models import Agent, WorldAction, AgentActivity
from .farm_models import AgentFarm, FarmCatalog
from .farm_catalog import DEFAULT_RULES, normalized_rules, validate_crop_rule, validate_rules
from .farm_clock import weather, advance_state, wet_intervals
from .farm_gate import farm_gate
from .farm_quality import skill_progress, probabilities
from .travel_models import AgentInventoryItem
from .item_catalog_icons import validate_catalog_icon_assets


def present(farm):
    catalog = FarmCatalog.objects.only('seed').get(pk=farm.owner_id)
    now = timezone.now()
    state = copy.deepcopy({
        'plots': farm.display_plots,
        'animals': farm.display_animals,
        'buildings': farm.display_buildings,
        'planting_experience': farm.display_planting_experience or 0,
        'yield_remainders': farm.display_yield_remainders or {},
    })
    # GET 只推导展示状态；生产品质采用确定性抽取，业务库存仍仅在事务中领取。
    advance_state(state, catalog.seed, now.timestamp())
    for plot in state['plots']:
        if plot.get('crop') and plot['crop'].get('quality_version') == 1:
            plot['crop']['star_probabilities'] = probabilities(plot['crop']['planting_level'], (plot['crop'].get('fertilizer') or {}).get('quality_bonus', 0))
        plot['wet'] = bool(plot.get('crop') and plot['crop'].get('quality_version') == 1) or bool(wet_intervals(catalog.seed, now.timestamp(), now.timestamp() + .001, plot['watered_until']))
    agent = Agent.objects.select_related('profession').only('name', 'money', 'profession__name', 'profession__enabled', 'profession__farm_yield_percentage').filter(pk=farm.pk).first()
    from .farm_bonus import yield_bonus
    current = WorldAction.objects.filter(actor_id=farm.pk, snapshot__farm=True, status='claimed').order_by('-created_at').values('record_id', 'record__summary').first()
    activity = AgentActivity.objects.filter(run_record_id=current['record_id'], status='running').values_list('current_action', flat=True).first() if current and current['record_id'] else None
    # 仅增产余量需要库存名称；不要读取其他物品或其可能很大的批次 JSON。
    skus = list(state['yield_remainders'])
    inventory = (AgentInventoryItem.objects.filter(actor_id=farm.pk, owner_id=farm.owner_id, source__sku__in=skus)
        .annotate(sku=KeyTextTransform('sku', 'source'), stars=KeyTransform('stars', 'source'), quality=KeyTextTransform('quality', 'source'))
        .order_by('created_at', 'id').values('id', 'name', 'quantity', 'value', 'sku', 'stars', 'quality')) if skus else []
    return {'id': farm.pk, 'actor_name': agent.name if agent else farm.actor_name, 'appearance': farm.appearance,
        'balance': str(agent.money) if agent else None, 'revision': farm.revision, 'server_time': now,
        'weather': weather(catalog.seed, now.timestamp()), 'hour': now.astimezone(__import__('zoneinfo').ZoneInfo('Asia/Shanghai')).hour,
        'planting': skill_progress(state.get('planting_experience', 0)),
        'state': state, 'farm_bonus': yield_bonus(agent), 'current_action': activity if activity is not None else current['record__summary'] if current else None,
        'profession_name': agent.profession.name if (agent and agent.profession) else None,
        'inventory': [{**i, 'value': str(i['value']), 'stars': (i['stars'] if i['stars'] is not None else 1) if i['sku'].startswith('crop.') else None, 'quality': i['quality'] or 'normal'} for i in inventory]}


class FarmListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = get_current_user_identifier(request)
        farms = list(AgentFarm.objects.filter(owner_id=owner).only('id', 'actor_name', 'appearance').order_by('actor_name', 'id'))
        agent_ids = [f.pk for f in farms]
        agents = {
            a.pk: a
            for a in Agent.objects.select_related('profession').filter(pk__in=agent_ids)
        }
        rows = []
        for f in farms:
            agent = agents.get(f.pk)
            rows.append({
                'id': f.pk,
                'actor_name': agent.name if agent else f.actor_name,
                'avatar': agent.avatar if agent else '',
                'profession_name': agent.profession.name if (agent and agent.profession) else None,
                'appearance': f.appearance,
            })
        return success_result(rows)


class FarmDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, farm_id):
        # 只读展示允许不同表看到相邻提交，不阻塞经营与同步；同一农场状态由单条查询取得。
        fields = ('plots', 'animals', 'buildings', 'planting_experience', 'yield_remainders')
        farms = AgentFarm.objects.defer('state').annotate(**{
            f'display_{field}': KeyTransform(field, 'state') for field in fields
        })
        farm = get_object_or_404(farms, pk=farm_id, owner_id=get_current_user_identifier(request))
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
        return success_result(normalized_rules(catalog.rules if catalog else DEFAULT_RULES))

    def patch(self, request):
        rules = validate_rules(request.data.get('rules'))
        owner = get_current_user_identifier(request)
        from .farm_catalog import catalog_for
        with farm_gate(), transaction.atomic():
            catalog = catalog_for(owner)
            current_rules = normalized_rules(catalog.rules)
            # Crop rules and icon links are managed from the item catalog, never
            # overwritten by an older farm-configuration form that was open.
            rules['crops'] = current_rules['crops']
            rules['item_icons'] = current_rules['item_icons']
            rules = validate_rules(rules)
            validate_catalog_icon_assets(owner, rules)
            catalog.rules = rules
            catalog.save(update_fields=['rules', 'updated_at'])
        return success_result(rules)


class FarmCropRuleView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, crop_kind):
        from .farm_catalog import catalog_for
        from .farm_catalog import DEFAULT_RULES as defaults
        if crop_kind not in defaults['crops']:
            return valid_result('作物不存在', status=404)
        crop_rule = validate_crop_rule(request.data)
        owner = get_current_user_identifier(request)
        with farm_gate(), transaction.atomic():
            catalog_for(owner)
            catalog = FarmCatalog.objects.select_for_update().get(pk=owner)
            rules = normalized_rules(catalog.rules)
            rules['crops'][crop_kind].update(crop_rule)
            rules = validate_rules(rules)
            catalog.rules = rules
            catalog.save(update_fields=['rules', 'updated_at'])
        return success_result(rules['crops'][crop_kind])
