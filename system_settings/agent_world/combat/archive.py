"""把检查点之前的战斗事实折叠成归档基线，仅保留最近一段可回放的回合。

归档只在检查点边界执行：检查点紧跟在被删区间之后，仍提供成长、装备和
探索基线；`CombatIntegrity.archive_stock` 记录被删事实的物资净变化，供
库存校验相加。链本身从 `archive_digest` 继续，不改写任何留存事实。
"""
from collections import Counter
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from ..farm_gate import guarded

PREFIX = 'system_settings.'
FACT = PREFIX + 'combatfact'
CHAIN = PREFIX + 'combatintegrity'
PROFILE = PREFIX + 'combatprofile'


def _row(fact) -> dict:
    return {
        'id': fact.pk, 'actor_id': fact.actor_id, 'owner_id': fact.owner_id,
        'sequence': fact.sequence, 'kind': fact.kind, 'exploration_id': fact.exploration_id,
        'elapsed_seconds': fact.elapsed_seconds, 'payload': fact.payload,
        'previous_hash': fact.previous_hash, 'digest': fact.digest,
    }


def _chain_row(chain) -> dict:
    return {
        'head': chain.head, 'digest': chain.digest, 'frame': chain.frame,
        'owner_id': chain.owner_id, 'archive_sequence': chain.archive_sequence,
        'archive_digest': chain.archive_digest or '',
    }


def _inventory_stock(actor: str, owner: str) -> dict:
    from ..travel_models import AgentInventoryItem
    balance = Counter()
    for item in AgentInventoryItem.objects.filter(actor_id=actor, owner_id=owner).values('quantity', 'source'):
        sku = (item['source'] or {}).get('sku', '')
        if sku.startswith('combat.'):
            balance[sku] += item['quantity']
    return dict(sorted((key, value) for key, value in balance.items() if value))


def append_checkpoint(profile) -> object | None:
    """在链尾追加一个检查点；已有尾部检查点时保持幂等。"""
    from .models import CombatFact, CombatIntegrity, EquipmentInstance
    from .facts import append
    from .store import digest

    chain = CombatIntegrity.objects.select_for_update().filter(pk=profile.pk).first()
    last = CombatFact.objects.filter(actor_id=profile.pk).order_by('-sequence').first()
    if chain is None or last is None or last.kind == 'checkpoint':
        return None
    equipment = {}
    for item in EquipmentInstance.objects.filter(actor_id=profile.pk).order_by('pk'):
        if not item.rules:
            raise ValueError(f'居民 {profile.pk} 的装备 {item.pk} 缺少固化规则，不能建立检查点')
        equipment[item.pk] = {'snapshot': item.snapshot, 'rules': item.rules,
                              **({'retained_for_adventure': True} if item.retained_for_adventure else {})}
    payload = {
        'version': 1,
        'source_sequence': chain.head,
        'source_digest': chain.digest,
        'source_frame': chain.frame,
        'progression': profile.progression,
        'equipment': equipment,
        'stock': _inventory_stock(profile.pk, profile.owner_id),
    }
    key = 'checkpoint:' + digest({'actor': profile.pk, 'head': chain.head, 'digest': chain.digest})[:29]
    return append(profile, key, 'checkpoint', payload)


@guarded
@transaction.atomic
def checkpoint_all() -> tuple[int, list[dict]]:
    from .models import CombatProfile
    created, skipped = 0, []
    for profile in CombatProfile.objects.select_for_update().order_by('pk'):
        try:
            if append_checkpoint(profile) is not None:
                created += 1
        except (ValueError, KeyError, TypeError) as exc:
            skipped.append({'actor': profile.pk, 'reason': str(exc)})
    return created, skipped


def markers(data: list[dict]) -> dict[str, tuple[int, str]]:
    found = {}
    for row in data:
        if row.get('model') != CHAIN:
            continue
        fields = row.get('fields') or {}
        sequence = int(fields.get('archive_sequence') or 0)
        if sequence:
            found[str(row['pk'])] = (sequence, fields.get('archive_digest') or '')
    return found


def merged_markers(datasets) -> dict[str, tuple[int, str]]:
    """取各端最大归档边界，避免未归档设备的旧事实重新进入合并结果。"""
    found = {}
    for dataset in datasets:
        for actor, (sequence, digest_value) in markers(dataset or []).items():
            if sequence > found.get(actor, (0, ''))[0]:
                found[actor] = (sequence, digest_value)
    return found


def compact(data: list[dict], revisions: dict | None = None, marker_map: dict | None = None):
    """从快照与修订清单中移除已归档事实；未归档时不改动。"""
    marker_map = marker_map if marker_map is not None else markers(data)
    if not marker_map:
        return data, revisions if revisions is not None else {}
    removed, kept = set(), []
    for row in data:
        if row.get('model') == FACT:
            actor = str((row.get('fields') or {}).get('actor_id') or '')
            sequence = int((row.get('fields') or {}).get('sequence') or 0)
            boundary = marker_map.get(actor)
            if boundary and sequence <= boundary[0]:
                removed.add(f"{FACT}:{row['pk']}")
                continue
        kept.append(row)
    if revisions is None:
        return kept, {}
    if removed:
        revisions = {key: value for key, value in revisions.items() if key not in removed}
    return kept, revisions


def prune_states() -> int:
    """清理已不存在战斗事实的修订行；归档不写删除墓碑，避免清单被墓碑撑大。"""
    from django.db.models import Exists, OuterRef
    from system_settings.models import SyncEntityState
    from .models import CombatFact

    # 在库里做反连接，避免每次同步都把整张事实表和整张修订表搬进 Python。
    facts = CombatFact.objects.filter(pk=OuterRef('object_pk'))
    stale = SyncEntityState.objects.filter(model_label=FACT, is_deleted=False).annotate(
        has_fact=Exists(facts)).filter(has_fact=False)
    removable = list(stale.values_list('pk', flat=True))
    removed = 0
    for offset in range(0, len(removable), 500):
        deleted, _ = SyncEntityState.objects.filter(pk__in=removable[offset:offset + 500]).delete()
        removed += deleted
    return removed


def archive_profile(profile, cutoff, *, apply: bool = True) -> dict:
    """删除 cutoff 之前、且已被检查点覆盖的事实。返回统计，不写墓碑。"""
    from system_settings.sync_state import suspend_tracking
    from .history_snapshot import OPEN, verify_chain
    from .models import CombatFact, CombatIntegrity, Exploration
    from .stock_validation import stock_changes

    if Exploration.objects.filter(actor_id=profile.pk, status__in=OPEN).exists():
        return {'actor': profile.pk, 'archived': 0, 'reason': '居民有进行中的探索，结束后才会归档'}
    chain = CombatIntegrity.objects.select_for_update().get(pk=profile.pk)
    base = chain.archive_sequence
    facts = list(CombatFact.objects.filter(actor_id=profile.pk).order_by('sequence'))
    if not facts:
        return {'actor': profile.pk, 'archived': 0, 'reason': '无战斗事实'}
    try:
        verify_chain([_row(fact) for fact in facts], _chain_row(chain), profile.pk, profile.owner_id)
    except ValueError as exc:
        return {'actor': profile.pk, 'archived': 0, 'reason': f'事实链校验失败：{exc}'}
    checkpoints = [
        fact for fact in facts
        if fact.kind == 'checkpoint' and fact.sequence > base + 1 and fact.created_at < cutoff
    ]
    if not checkpoints:
        return {'actor': profile.pk, 'archived': 0,
                'reason': '还没有超过保留期的检查点；每日维护会自动追加，满保留期后才会归档'}
    boundary_fact = checkpoints[-1]
    boundary = boundary_fact.sequence - 1
    # 链只能从检查点开始：组队个人结算、武道大会奖品和打造来源若落在待删区间内，
    # 本轮不删（这些来源事实仍被其它域逐条核对），只回报受阻边界。
    protected = [
        fact.sequence for fact in facts
        if fact.kind in ('tournament_reward', 'forge') or (fact.payload or {}).get('shared_event_id')
    ]
    first_protected = min(protected, default=None)
    if first_protected is not None and first_protected <= boundary:
        # 同一居民在来源事实归档规则落地前会持续命中这里：显式返回受阻边界，
        # 由命令与后台维护日志汇总，避免长期“静默不归档”被误判为保留期已生效。
        return {'actor': profile.pk, 'archived': 0, 'blocked_by': first_protected,
                'reason': f'待删区间包含仍需核对的来源事实（sequence={first_protected}），本轮边界 {boundary}'}
    by_run = {}
    for fact in facts:
        if fact.exploration_id:
            by_run.setdefault(fact.exploration_id, []).append(fact.sequence)
    if any(min(rows) <= boundary < max(rows) for rows in by_run.values()):
        return {'actor': profile.pk, 'archived': 0, 'reason': '待删区间跨探索，不能只删一半'}
    if boundary <= base:
        return {'actor': profile.pk, 'archived': 0, 'reason': '检查点仍在保留期内'}
    archived = facts[:boundary - base] if base else facts[:boundary]
    stock = Counter(chain.archive_stock or {})
    try:
        for fact in archived:
            stock_changes({'kind': fact.kind, 'payload': fact.payload}, stock)
    except (KeyError, TypeError, ValueError) as exc:
        return {'actor': profile.pk, 'archived': 0, 'reason': f'事实载荷无法汇总库存：{exc}'}
    counts = {key: value for key, value in stock.items() if value}
    if not apply:
        return {'actor': profile.pk, 'archived': len(archived), 'boundary': boundary, 'dry_run': True}
    chain.archive_sequence = boundary
    chain.archive_digest = archived[-1].digest
    chain.archive_stock = dict(sorted(counts.items()))
    chain.save(update_fields=['archive_sequence', 'archive_digest', 'archive_stock'])
    with suspend_tracking():
        CombatFact.objects.filter(actor_id=profile.pk, sequence__lte=boundary).delete()
    return {'actor': profile.pk, 'archived': len(archived), 'boundary': boundary}


@guarded
def archive_owners(owner: str | None, days: int, *, apply: bool = True) -> list[dict]:
    from .models import CombatProfile
    cutoff = timezone.now() - timedelta(days=days)
    profiles = CombatProfile.objects.order_by('pk')
    if owner:
        profiles = profiles.filter(owner_id=owner)
    results = []
    for profile in profiles:
        # 每位居民一个事务：单人失败只回滚本人，不让整天归档压住同步导入与农场写入。
        try:
            with transaction.atomic():
                results.append(archive_profile(profile, cutoff, apply=apply))
        except Exception as exc:  # noqa: BLE001 - 单人异常不能中断整批归档
            results.append({'actor': profile.pk, 'archived': 0, 'reason': f'归档失败：{exc}'})
    if apply and any(item.get('archived') for item in results):
        prune_states()
    return results
