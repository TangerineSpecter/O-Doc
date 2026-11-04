"""Prepare a verified snapshot without old per-round process rows."""
from collections import defaultdict
from copy import deepcopy

from .party_daily import FACT, RUN
from .party_daily_sync import SETTLEMENT as PARTY_SETTLEMENT, settlement_record, source_slices
from .party_sync import EVENT
from .retention_projection import prepare_party, prepare_solo
from .solo_settlement import ENCOUNTER, SETTLEMENT as SOLO_SETTLEMENT, record as solo_record
from .store import digest

CHAIN = 'system_settings.combatintegrity'


def solo_slices(data, identities):
    result = defaultdict(list)
    for row in data:
        label, key, fields = row['model'], str(row['pk']), row['fields']
        run = key if label == RUN else fields.get('exploration_id') if label in (FACT, ENCOUNTER) else None
        if run in identities:
            result[run].append(row)
    return result


def strip_replays(data, archived, *, verify_original, allow_incomplete=False):
    """Remove the bounded cached party replay and refresh personal frames."""
    targets = {run['exploration_id']: content for content in archived
               for run in content['runs']}
    replacements, actors = {}, set()
    for row in data:
        if row['model'] != RUN or str(row['pk']) not in targets:
            continue
        identity = str(row['pk'])
        snapshot = row['fields']['snapshot'] or {}
        final = snapshot.get('party_final')
        if verify_original and digest(final) != targets[identity]['archive']['party_final_digests'][identity]:
            raise ValueError('个人历史战斗快照与原始来源不一致')
        if final is None:
            continue
        if not isinstance(final, dict) or not isinstance(final.get('events'), list):
            raise ValueError('个人历史战斗快照格式无效')
        if final['events']:
            updated = deepcopy(row)
            updated['fields']['snapshot']['party_final']['events'] = []
            replacements[(RUN, identity)] = updated
            actors.add(row['fields']['actor_id'])
    if not replacements:
        return data, replacements
    result = [replacements.get((row['model'], str(row['pk'])), row) for row in data]
    from .history_snapshot import aggregate_frame, frame_index, indexed
    rows = indexed(result)
    frames = frame_index(rows)
    for actor in actors:
        key = (CHAIN, actor)
        original = next((row for row in result if row['model'] == CHAIN and str(row['pk']) == actor), None)
        if allow_incomplete and (not original or ('system_settings.combatprofile', actor) not in rows):
            continue
        if not original:
            raise ValueError('已结束探索缺少个人战斗完整性链')
        updated = deepcopy(original)
        updated['fields']['frame'] = digest(aggregate_frame(rows, actor, frozen=True, index=frames))
        replacements[key] = updated
    return [replacements.get((row['model'], str(row['pk'])), row) for row in result], replacements


def compact(data, parties, solos, *, exact_event_times=None):
    """Return compact data and the exact rows to remove; never mutate input.

    The caller must verify the complete original snapshot before calling and
    verify the complete returned snapshot before persisting anything.
    """
    parties, solos = set(parties), set(solos)
    markers = {(row['model'], str(row['pk'])): row for row in data
               if row['model'] in (PARTY_SETTLEMENT, SOLO_SETTLEMENT)}
    party_sources, solo_sources = source_slices(data, parties), solo_slices(data, solos)
    replacements, runs = {}, set(solos)
    for identity in sorted(parties):
        marker = markers[(PARTY_SETTLEMENT, identity)]
        content = prepare_party(party_sources[identity], identity, exact_event_times=exact_event_times)
        if marker['fields']['content'] != {key: value for key, value in content.items() if key != 'archive'}:
            raise ValueError('待清理战斗的压缩结算与原始来源不一致')
        replacements[(PARTY_SETTLEMENT, identity)] = settlement_record(content)
        runs.update(item['exploration_id'] for item in content['runs'])
    for identity in sorted(solos):
        marker = markers[(SOLO_SETTLEMENT, identity)]
        content = prepare_solo(solo_sources[identity], identity)
        if marker['fields']['content'] != {key: value for key, value in content.items() if key != 'archive'}:
            raise ValueError('待清理旧单人战斗的结算与原始来源不一致')
        replacements[(SOLO_SETTLEMENT, identity)] = solo_record(content)
    removed = {FACT: set(), EVENT: set()}
    result = []
    for row in data:
        label, key, fields = row['model'], str(row['pk']), row['fields']
        if (label == FACT and fields['kind'] == 'round' and fields['exploration_id'] in runs
                or label == EVENT and fields['kind'] == 'round' and fields['party_id'] in parties):
            removed[label].add(key)
            continue
        result.append(replacements.get((label, key), row))
    result, frames = strip_replays(result, [row['fields']['content'] for (label, _), row in replacements.items()
                                           if label == PARTY_SETTLEMENT], verify_original=True)
    replacements.update(frames)
    return result, removed, replacements
