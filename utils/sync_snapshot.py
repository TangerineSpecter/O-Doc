"""Export and checkpoint phase of snapshot synchronization."""

from __future__ import annotations

from collections.abc import Callable
import json
import uuid
from datetime import datetime
from django.core import serializers
from utils.sync_datetime import SyncJSONEncoder
from system_settings.agent_world import travel_sync
from .sync_models import SnapshotModels

class SnapshotExporter:
    """Export domain checkpoints; the orchestrator holds the domain guards."""

    def __init__(self, models: SnapshotModels, current_version: Callable[[], str]) -> None:
        self.models = models
        self.current_version = current_version

    def build_snapshot_data(self, *, compact_travel=False, allow_exploration_review_mismatch=False, relax_integrity=False):
        from system_settings.agent_world.combat.store import install as install_combat
        install_combat()
        from system_settings.agent_world.life_sync import checkpoint_all
        checkpoint_all()
        from system_settings.agent_world.cooking_sync import checkpoint_all as checkpoint_cooking
        checkpoint_cooking()
        from system_settings.agent_world.alchemy_sync import checkpoint_all as checkpoint_alchemy
        checkpoint_alchemy()
        from system_settings.agent_world.blacksmith_sync import checkpoint_all as checkpoint_blacksmith
        checkpoint_blacksmith()
        from system_settings.agent_world.social_sync import checkpoint_all as checkpoint_social
        checkpoint_social()
        from system_settings.agent_world.market_sync import normalize_legacy_dates as normalize_market_dates
        from system_settings.agent_world.investment_sync import normalize_legacy_dates as normalize_investment_dates
        normalize_market_dates()
        normalize_investment_dates()
        from system_settings.agent_world.lottery_sync import checkpoint_all as checkpoint_lottery
        checkpoint_lottery()
        from system_settings.agent_world.tournament_sync import checkpoint_all as checkpoint_tournaments
        checkpoint_tournaments()
        from system_settings.agent_world.fishing.sync import checkpoint_all as checkpoint_fishing
        checkpoint_fishing()
        all_data = []
        sparse_cities = compact_travel and travel_sync.enabled()
        for model in self.models.iter_target_models():
            queryset = self.models.queryset_for_export(model)
            if sparse_cities and model._meta.label_lower == travel_sync.LABEL:
                queryset = travel_sync.export_queryset(queryset)
            if queryset.exists():
                all_data.extend(json.loads(serializers.serialize('json', queryset, cls=SyncJSONEncoder)))
        from system_settings.agent_world.combat.sync import validate_source as validate_combat
        from system_settings.agent_world.food_sync import validate_source as validate_food
        validate_food(all_data)
        from system_settings.agent_world.combat.sync import metadata as combat_metadata
        validate_combat(all_data, combat_metadata(all_data),
                        allow_exploration_review_mismatch=allow_exploration_review_mismatch or relax_integrity)
        from system_settings.agent_world.alchemy_quality_sync import validate_source as validate_alchemy, metadata as alchemy_metadata
        validate_alchemy(all_data, alchemy_metadata(all_data))
        from system_settings.agent_world.blacksmith_sync import validate_source as validate_blacksmith, metadata as blacksmith_metadata
        validate_blacksmith(all_data, blacksmith_metadata(all_data))
        from system_settings.agent_world.tournament_sync import validate_source as validate_tournaments
        validate_tournaments(all_data)
        from quant.sync import validate as validate_quant
        validate_quant(all_data)
        return self.models.strip_device_local_user_fields(all_data)


    def build_snapshot_meta(self, source='manual', runner_id='', data_list=None):
        from system_settings.agent_world.social_models import SocialIntegrity
        from system_settings.agent_world.combat.sync import metadata as combat_metadata
        from system_settings.agent_world.cooking_quality_sync import metadata as cooking_metadata
        from system_settings.agent_world.alchemy_quality_sync import metadata as alchemy_metadata
        from system_settings.agent_world.blacksmith_sync import metadata as blacksmith_metadata
        from learning.sync import metadata as learning_metadata
        from novel.sync import metadata as novel_metadata
        from quant.sync import metadata as quant_metadata
        from memos.sprout_sync import metadata as sprout_metadata
        from system_settings.agent_world.memory.sync import metadata as memory_metadata
        from system_settings.agent_world.farm_quality_sync import metadata as crop_metadata
        from system_settings.agent_world.lottery_sync import metadata as lottery_metadata
        from system_settings.agent_world.tournament_sync import metadata as tournament_metadata
        from system_settings.agent_world.fishing.sync import metadata as fishing_metadata
        return {
            **lottery_metadata(data_list), **fishing_metadata(data_list), **tournament_metadata(data_list),
            **combat_metadata(data_list),
            **learning_metadata(data_list),
            **novel_metadata(data_list),
            **quant_metadata(data_list),
            **sprout_metadata(data_list),
            **crop_metadata(data_list),
            **cooking_metadata(data_list),
            **alchemy_metadata(data_list),
            **blacksmith_metadata(data_list),
            **memory_metadata(data_list),
            'social_schema_version': 2,
            'social_owners': list(SocialIntegrity.objects.order_by('pk').values_list('pk', flat=True)),
            'snapshot_id': uuid.uuid4().hex,
            'generated_at': datetime.utcnow().isoformat() + 'Z',
            'source': source,
            'runner_id': runner_id,
            'app_version': self.current_version(),
            'data_file': 'data_index.json',
        }
