"""Owner-scoped recipe settings and read-only forge projections."""
import copy
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from system_settings.models import Agent, WorldAction
from .farm_gate import farm_gate
from .blacksmith_candidates import validate_actor
from .blacksmith_catalog import DEFAULT_RULES, catalog_for, rules_for, validate_ingredients, validate_rule
from .blacksmith_models import BlacksmithCatalog, BlacksmithOperation
from .blacksmith_queries import overview, history


def actor_for(owner: str, identity: str):
    try:
        validate_actor(owner, identity)
    except ValueError as exc:
        raise PermissionDenied(str(exc)) from exc
    return get_object_or_404(Agent, pk=identity)


class BlacksmithRecipesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = get_current_user_identifier(request)
        identity = next((request.query_params.get(key) for key in ('agent_id', 'agentId', 'actor_id', 'actorId')
                         if request.query_params.get(key)), None)
        try:
            with farm_gate():
                return success_result(overview(owner, actor_for(owner, identity) if identity else None))
        except ValueError as exc:
            return valid_result(str(exc), status=400)


class BlacksmithRecipeView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, recipe_id):
        if recipe_id not in DEFAULT_RULES:
            return valid_result('打造配方不存在', status=404)
        try:
            if not isinstance(request.data, dict) or set(request.data) != {'ingredients'}:
                raise ValueError('只允许修改配方材料和数量')
            ingredients = validate_ingredients(recipe_id, request.data['ingredients'])
            owner = get_current_user_identifier(request)
            with farm_gate(), transaction.atomic():
                catalog_for(owner)
                catalog = BlacksmithCatalog.objects.select_for_update().get(pk=owner)
                rules = rules_for(owner)
                rule = copy.deepcopy(rules[recipe_id])
                rule.update(ingredients=ingredients, version=catalog.version + 1)
                validate_rule(rule)
                rules[recipe_id] = rule
                catalog.rules, catalog.version = rules, catalog.version + 1
                catalog.save(update_fields=['rules', 'version', 'updated_at'])
                from .blacksmith_sync import checkpoint
                checkpoint(owner)
            return success_result(rule)
        except ValueError as exc:
            return valid_result(str(exc), status=400)


class BlacksmithHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, agent_id):
        owner = get_current_user_identifier(request)
        # Retained activities remain readable after a resident was deleted.
        retained = BlacksmithOperation.objects.filter(owner_id=owner, actor_id=agent_id).exists()
        retained = retained or WorldAction.objects.filter(actor_id=agent_id,
            snapshot__blacksmith=True, snapshot__owner_id=owner).exists()
        if not retained:
            actor_for(owner, agent_id)
        try:
            page = int(request.query_params.get('page', 1))
            with farm_gate():
                return success_result(history(owner, agent_id, page))
        except (ValueError, TypeError) as exc:
            return valid_result(str(exc) or '页码无效', status=400)
