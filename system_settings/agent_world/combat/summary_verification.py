"""Lock and verify personal combat sources before producing summaries."""
from contextlib import closing

from django.db.models import Q

from .analytics_models import CombatPartySettlement, CombatSoloSettlement
from .facts import frame_digest
from .history_snapshot import verify_chain
from .models import CombatEncounter, CombatFact, CombatIntegrity, EquipmentInstance, Exploration
from .retention_projection import validate_archive
from .retention_segments import verify_personal
from .store import digest


DEFAULT_ACTOR_ROWS = 500000
MAX_ACTOR_ROWS = 2000000


def _archived_ranges(owner, actors):
    if not actors:
        return {}
    party_filter = Q()
    for actor in actors:
        party_filter |= Q(content__runs__contains=[{'actor_id': actor}])
    parties = CombatPartySettlement.objects.filter(owner_id=owner, content__has_key='archive').filter(party_filter)
    solos = CombatSoloSettlement.objects.filter(owner_id=owner, content__has_key='archive',
                                                 content__run__actor_id__in=actors)
    ranges = {}
    for marker in [*parties, *solos]:
        if marker.version != 1 or marker.digest != digest(marker.content):
            raise ValueError('已有战斗归档的结算指纹不一致')
        archive = validate_archive(marker.content)
        for item in archive['personal_ranges']:
            if item['stream_id'] in actors:
                ranges.setdefault(item['stream_id'], []).append(item)
    return ranges


def verify_actors(owner, actor_ids, max_actor_rows, verified):
    """Run in the caller's transaction; successful chain locks survive until commit."""
    actor_ids = set(actor_ids)
    if not actor_ids:
        raise ValueError('战斗来源缺少居民')
    chains = {row.pk: row for row in CombatIntegrity.objects.select_for_update().filter(pk__in=actor_ids).order_by('pk')}
    if set(chains) != actor_ids:
        raise ValueError('战斗来源缺少个人完整性链')
    unchecked = {actor for actor in actor_ids if (owner, actor) not in verified}
    count = sum(query.order_by().count() for query in (
        CombatFact.objects.filter(actor_id__in=unchecked),
        Exploration.objects.filter(actor_id__in=unchecked),
        CombatEncounter.objects.filter(actor_id__in=unchecked),
        EquipmentInstance.objects.filter(actor_id__in=unchecked),
    )) if unchecked and max_actor_rows is not None else 0
    if max_actor_rows is not None and count > max_actor_rows:
        raise ValueError(f'未核验个人链及状态共 {count} 行，超过本次回填上限 {max_actor_rows}；未写入摘要')
    fact_fields = ('id', 'actor_id', 'owner_id', 'sequence', 'kind', 'exploration_id',
                   'elapsed_seconds', 'payload', 'previous_hash', 'digest')
    ranges = _archived_ranges(owner, unchecked)
    for actor in sorted(unchecked):
        chain = chains[actor]
        chain_data = {key: getattr(chain, key) for key in (
            'owner_id', 'head', 'digest', 'frame', 'archive_sequence', 'archive_digest')}
        ordered = CombatFact.objects.filter(actor_id=actor).order_by('sequence').values(*fact_fields).iterator(chunk_size=500)
        # Close the server-side cursor before a failed savepoint rolls back.
        with closing(ordered):
            if ranges.get(actor):
                verify_personal(ordered, chain_data, actor=actor, owner=owner, ranges=ranges[actor])
            else:
                verify_chain(ordered, chain_data, actor, owner)
        if frame_digest(actor) != chain.frame:
            raise ValueError('个人战斗状态与事实链指纹不一致')
    return {(owner, actor) for actor in unchecked}
