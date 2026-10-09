from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from system_settings.models import Agent
from .farm_gate import farm_gate
from .cooking_models import CookingCatalog, CookingOperation
from .cooking_catalog import DEFAULT_RULES, INGREDIENTS, rules_for, catalog_for, validate_rule
from .cooking_queries import recipes, overview, validate_actor


def actor_for(owner, actor_id):
    try:
        validate_actor(owner, actor_id)
    except ValueError as exc:
        raise PermissionDenied(str(exc)) from exc
    return get_object_or_404(Agent, pk=actor_id)


class CookingRecipesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = get_current_user_identifier(request)
        actor_id = request.GET.get('agent_id') or request.GET.get('agentId')
        with farm_gate():
            agent = actor_for(owner, actor_id) if actor_id else None
            return success_result({'recipes': recipes(owner, agent), 'skill': overview(owner, actor_id) if agent else None, 'ingredient_options': [{'sku': sku, 'name': name} for sku, name in INGREDIENTS.items()]})


class CookingRecipeView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, recipe_id):
        if recipe_id not in DEFAULT_RULES:
            return valid_result('食谱不存在', status=404)
        try:
            rule = validate_rule(request.data)
        except ValidationError as exc:
            return valid_result('食谱规则无效', data={'detail': exc.detail}, status=400)
        owner = get_current_user_identifier(request)
        with farm_gate(), transaction.atomic():
            catalog_for(owner)
            catalog = CookingCatalog.objects.select_for_update().get(pk=owner)
            rules = rules_for(owner)
            rules[recipe_id] = {**rules[recipe_id], **rule}
            catalog.rules = rules
            catalog.save(update_fields=['rules', 'updated_at'])
        return success_result(rules[recipe_id])


class CookingSkillView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, agent_id):
        owner = get_current_user_identifier(request)
        actor_for(owner, agent_id)
        return success_result(overview(owner, agent_id))


class CookingHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, agent_id):
        owner = get_current_user_identifier(request)
        # Removed residents retain owner-scoped history.
        from .cooking_models import CookingSkill
        if not CookingSkill.objects.filter(pk=agent_id, owner_id=owner).exists():
            actor_for(owner, agent_id)
        try:
            page = int(request.GET.get('page', 1))
            if page < 1:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValidationError('页码须为正整数')
        rows = CookingOperation.objects.filter(owner_id=owner, actor_id=agent_id).order_by('-created_at', '-id')
        return success_result({'list': list(rows.values()[ (page-1)*20:page*20]), 'total': rows.count(), 'page': page, 'page_size': 20})
