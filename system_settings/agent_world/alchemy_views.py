from decimal import Decimal
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from system_settings.models import Agent
from .farm_gate import farm_gate
from .alchemy_models import AlchemyCatalog, AlchemyOperation, AlchemySkill
from .alchemy_catalog import DEFAULT_RULES, MATERIALS, rules_for, catalog_for, validate_rule, ingredient_value
from .alchemy_queries import recipes, overview, validate_actor, materials
from .alchemy_limits import CARRY_CAP


def actor_for(owner, actor_id):
    try:
        validate_actor(owner, actor_id)
    except ValueError as exc:
        raise PermissionDenied(str(exc)) from exc
    return get_object_or_404(Agent, pk=actor_id)


class AlchemyRecipesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = get_current_user_identifier(request)
        actor_id = request.GET.get('agent_id') or request.GET.get('agentId')
        with farm_gate():
            agent = actor_for(owner, actor_id) if actor_id else None
            return success_result({'recipes': recipes(owner, agent),
                                   'skill': overview(owner, actor_id) if agent else None,
                                   'materials': materials(owner), 'carry_cap': CARRY_CAP})


class AlchemyRecipeView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, recipe_id):
        if recipe_id not in DEFAULT_RULES:
            return valid_result('配方不存在', status=404)
        try:
            rule = validate_rule(request.data)
            rule['sale_price'] = ingredient_value(rule['ingredients'])
            if Decimal(rule['sale_price']) > 1000000:
                raise ValidationError('材料价值不得超过 1000000')
        except ValidationError as exc:
            return valid_result('炼金配方规则无效', data={'detail': exc.detail}, status=400)
        owner = get_current_user_identifier(request)
        with farm_gate(), transaction.atomic():
            catalog_for(owner)
            catalog = AlchemyCatalog.objects.select_for_update().get(pk=owner)
            rules = rules_for(owner)
            rules[recipe_id] = {**rules[recipe_id], **rule}
            catalog.rules = rules
            catalog.save(update_fields=['rules', 'updated_at'])
        return success_result(rules[recipe_id])


class AlchemySkillView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, agent_id):
        owner = get_current_user_identifier(request)
        actor_for(owner, agent_id)
        return success_result(overview(owner, agent_id))


class AlchemyHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, agent_id):
        owner = get_current_user_identifier(request)
        if not AlchemySkill.objects.filter(pk=agent_id, owner_id=owner).exists():
            actor_for(owner, agent_id)
        try:
            page = int(request.GET.get('page', 1))
            if page < 1:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValidationError('页码须为正整数')
        rows = AlchemyOperation.objects.filter(owner_id=owner, actor_id=agent_id).order_by('-created_at', '-id')
        return success_result({'list': list(rows.values()[(page - 1) * 20:page * 20]), 'total': rows.count(), 'page': page, 'page_size': 20})
