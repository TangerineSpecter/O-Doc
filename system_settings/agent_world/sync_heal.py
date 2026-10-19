"""强制覆盖或放宽校验之后，把本机整理到能继续运行。

播种窗口、记忆来源和生活/社交/烹饪摘要不一致时，这里按当前记录尽力改齐。
改不了的只留下说明，不删除计划、播种或记忆正文，也不让同步回滚。
"""
import logging

from django.db import transaction
from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)


def heal_after_sync() -> list[str]:
    notes: list[str] = []
    for step in (_heal_farm_catalogs, _heal_farm_windows, _heal_memories, _heal_digests):
        try:
            notes.extend(step())
        except Exception as exc:
            logger.exception('同步后的自动整理失败')
            notes.append(f'自动整理未完成：{exc}')
    return notes


def _heal_farm_catalogs() -> list[str]:
    from .farm_catalog import catalog_for
    from .farm_models import AgentFarm, FarmCatalog

    notes = []
    for owner in AgentFarm.objects.order_by('owner_id').values_list('owner_id', flat=True).distinct():
        if owner and not FarmCatalog.objects.filter(pk=owner).exists():
            catalog_for(owner)
            notes.append(f'已补建农场目录 账号{owner}')
    return notes


def _heal_farm_windows() -> list[str]:
    from .farm_queue_window_repair import apply_fixes, collect

    found = collect()
    notes = []
    fixable = [item for item in found if item.get('ok')]
    if fixable:
        with transaction.atomic():
            notes.extend(apply_fixes(fixable))
    for item in found:
        if not item.get('ok'):
            notes.append(f"{item.get('where') or '种植计划'} 未能自动对齐窗口：{item.get('reason') or '未知原因'}")
    return notes


def _source_row(kind: str, pk: str):
    from system_settings.models import AgentActivity

    from .combat.models import Exploration
    from .cooking_models import CookingOperation
    from .alchemy_models import AlchemyOperation
    from .farm_models import FarmOperation
    from .investment_models import InvestmentTrade
    from .market_models import MarketTransaction
    from .social_models import SocialEvent, SocialOpportunity
    from .travel_models import TravelJourney

    model = {
        'exploration': Exploration,
        'farm': FarmOperation,
        'cooking': CookingOperation,
        'alchemy': AlchemyOperation,
        'market': MarketTransaction,
        'investment': InvestmentTrade,
        'travel': TravelJourney,
        'relation': SocialEvent,
        'social': SocialOpportunity,
        'publication': AgentActivity,
    }.get(kind)
    if model is None:
        return None
    return model.objects.filter(pk=pk).first()


def _native_time(kind: str, row):
    if kind == 'travel':
        return parse_datetime((getattr(row, 'snapshot', None) or {}).get('memory_completed_at') or '')
    field = (
        'ended_at' if kind == 'exploration'
        else 'occurred_at' if kind == 'publication'
        else 'updated_at' if kind == 'social'
        else 'created_at'
    )
    value = getattr(row, field, None)
    if isinstance(value, str):
        return parse_datetime(value)
    return value


def _heal_ref(ref):
    """按真实活动重写一条记忆来源。无法对应时返回 None，调用方移除该条来源。"""
    from .life_time import local_time
    from .memory.sources import project

    if not isinstance(ref, dict):
        return None, '记忆来源格式无效，已移除'
    kind, _, pk = str(ref.get('id', '')).partition(':')
    row = _source_row(kind, pk)
    if row is None:
        return None, f"记忆来源 {ref.get('id') or ''} 没有对应活动，已移除"
    facts = project(kind, row)
    if facts is None:
        return None, f"活动 {ref.get('id') or ''} 不能形成记忆，已移除来源"
    at = _native_time(kind, row)
    if at is None:
        return None, f"活动 {ref.get('id') or ''} 没有时间，已移除来源"
    healed = {
        **ref,
        'kind': kind,
        'at': at.isoformat(),
        'day': str(local_time(at).date()),
        'facts': facts,
    }
    changed = (
        healed.get('facts') != ref.get('facts')
        or healed.get('at') != ref.get('at')
        or healed.get('day') != ref.get('day')
    )
    note = f"已按实际活动重写记忆来源 {ref.get('id')}" if changed else ''
    return healed, note


def _heal_ref_list(refs, limit: int) -> tuple[list, list[str], bool]:
    notes = []
    kept = []
    changed = not isinstance(refs, list) or len(refs) > limit
    for ref in (refs or [])[:limit] if isinstance(refs, list) else []:
        healed, note = _heal_ref(ref)
        if healed is None:
            changed = True
            if note:
                notes.append(note)
            continue
        if note:
            changed = True
            notes.append(note)
        kept.append(healed)
    if isinstance(refs, list) and len(kept) != len(refs[:limit]):
        changed = True
    return kept, notes, changed


def _heal_memories() -> list[str]:
    from system_settings.models import AgentLongTermMemory

    from .memory.models import AgentMemoryState

    notes = []
    for state in AgentMemoryState.objects.all():
        observations = state.observations if isinstance(state.observations, dict) else {}
        new_obs = {}
        changed = not isinstance(state.observations, dict)
        for key, refs in list(observations.items())[:100]:
            kept, ref_notes, ref_changed = _heal_ref_list(refs, 3)
            notes.extend(ref_notes)
            changed = changed or ref_changed
            if kept:
                new_obs[key] = kept
        if isinstance(state.observations, dict) and len(state.observations) > 100:
            changed = True
            notes.append(f'居民 {state.pk} 的偏好证据已截到容量内')
        if changed:
            state.observations = new_obs
            state.save(update_fields=['observations', 'updated_at'])
    for memory in AgentLongTermMemory.objects.all():
        info = (memory.metadata or {}).get('world_memory') or {}
        if not info or info.get('human_override') or memory.is_pinned:
            continue
        kept, ref_notes, changed = _heal_ref_list(info.get('sources'), 8)
        notes.extend(ref_notes)
        if memory.memory_type == 'preference' and len({ref.get('day') for ref in kept}) < 3:
            memory.memory_type = 'fact'
            changed = True
            notes.append(f'记忆 {memory.pk} 不足三天证据，已改为事实记忆')
        if not kept:
            if memory.status != 'archived':
                memory.status = 'archived'
                changed = True
                notes.append(f'记忆 {memory.pk} 已无可用活动来源，已归档')
        if changed:
            memory.metadata = {**(memory.metadata or {}), 'world_memory': {**info, 'sources': kept}}
            memory.save(update_fields=['metadata', 'memory_type', 'status', 'updated_at'])
    return notes


def _hashes_changed(model, rewrite) -> bool:
    before = {row.pk: row.hashes for row in model.objects.all()}
    rewrite()
    after = {row.pk: row.hashes for row in model.objects.all()}
    return before != after


def _heal_digests() -> list[str]:
    from .cooking_models import CookingIntegrity
    from .cooking_sync import checkpoint_all as checkpoint_cooking
    from .life_models import LifeIntegrity
    from .life_sync import checkpoint_all as checkpoint_life
    from .social_models import SocialIntegrity
    from .social_sync import checkpoint_all as checkpoint_social

    notes = []
    if _hashes_changed(LifeIntegrity, checkpoint_life):
        notes.append('已按当前生活记录重算完整性摘要')
    if _hashes_changed(SocialIntegrity, checkpoint_social):
        notes.append('已按当前社交记录重算完整性摘要')
    if _hashes_changed(CookingIntegrity, checkpoint_cooking):
        notes.append('已按当前烹饪记录重算完整性摘要')
    return notes
