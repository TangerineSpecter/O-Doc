"""Reconcile an old complete snapshot with its compacted successor."""
from system_settings.sync_state import canonical_hash
from utils.sync_merge import revision_key
from utils.sync_policy import SyncError
from .party_daily import FACT, RUN
from .party_daily_sync import COVERAGE, DAY, SETTLEMENT as PARTY_SETTLEMENT, source_slices
from .party_sync import EVENT, PARTY
from .retention_compaction import solo_slices, strip_replays
from .retention_projection import prepare_party, prepare_solo
from .solo_settlement import SETTLEMENT as SOLO_SETTLEMENT


def _marker_map(data):
    return {(row['model'], str(row['pk'])): row for row in data
            if row['model'] in (PARTY_SETTLEMENT, SOLO_SETTLEMENT)
            and 'archive' in (row['fields'].get('content') or {})}


def _presence(data):
    return {(row['model'], str(row['pk'])) for row in data if row['model'] in (PARTY, RUN)}


def reconcile(base, local_data, local_revisions, remote):
    """Normalize already-validated full snapshots before generic three-way merge.

    The non-archived side must reproduce exactly the entire stored settlement
    and the compressed chain ranges. A conflicting or partial source is never
    guessed away. The base is only a comparison ancestor, not a source to be
    imported, so its old rounds can be removed after the two current sides
    have been checked.
    """
    remote_data = remote.get('data') or []
    left, right = _marker_map(local_data), _marker_map(remote_data)
    authoritative = dict(left)
    for key, row in right.items():
        if key in authoritative and authoritative[key] != row:
            if key[0] != PARTY_SETTLEMENT:
                raise SyncError('同一战斗的压缩归档存在分叉，不能自动合并')
            from .retention_precision import reconcile_party_times
            authoritative[key] = reconcile_party_times(authoritative[key], row)
        else:
            authoritative[key] = row
    if not authoritative:
        return base, local_data, local_revisions, remote

    party_ids = {identity for (label, identity) in authoritative if label == PARTY_SETTLEMENT}
    solo_ids = {identity for (label, identity) in authoritative if label == SOLO_SETTLEMENT}
    removed_keys = set()
    chosen_revisions = {}
    related = {}
    for party in party_ids:
        source = local_data if (PARTY_SETTLEMENT, party) in left else remote_data
        for row in source:
            identity, label, fields = str(row['pk']), row['model'], row['fields']
            if label == COVERAGE and identity == party or label == DAY and fields.get('party_id') == party:
                related[(label, identity)] = row
    for key, row in {**authoritative, **related}.items():
        revision_id = revision_key(*key)
        party = (key[1] if key[0] == PARTY_SETTLEMENT or key[0] == COVERAGE
                 else row['fields'].get('party_id') if key[0] == DAY else None)
        from_left = (key in left or party is not None and (PARTY_SETTLEMENT, party) in left)
        revisions = local_revisions if from_left else remote.get('revisions') or {}
        value = dict(revisions.get(revision_id) or {})
        value.update(hash=canonical_hash(row['fields']), deleted=False)
        value.setdefault('revision_at', '1970-01-01T00:00:00+00:00')
        value.setdefault('origin_device', 'combat-archive')
        chosen_revisions[revision_id] = value

    def normalize(data, revisions, *, ancestor=False):
        present = _presence(data)
        existing = _marker_map(data)
        party_sources = source_slices(data, party_ids)
        solo_sources = solo_slices(data, solo_ids)
        applicable = {}
        for key, marker in authoritative.items():
            label, identity = key
            parent = (PARTY if label == PARTY_SETTLEMENT else RUN, identity)
            if parent not in present:
                continue
            if not ancestor and key not in existing:
                try:
                    reproduced = (prepare_party(party_sources[identity], identity,
                                  exact_event_times=marker['fields']['content']['archive']['exact_event_times'])
                                  if label == PARTY_SETTLEMENT
                                  else prepare_solo(solo_sources[identity], identity))
                    if reproduced != marker['fields']['content']:
                        raise ValueError('结算或链边界不同')
                except (ValueError, KeyError, TypeError, AttributeError, IndexError) as exc:
                    raise SyncError('旧快照的战斗来源无法完整核对归档，已停止合并') from exc
            applicable[key] = marker

        party_runs = {run['exploration_id'] for (label, _), row in applicable.items()
                      if label == PARTY_SETTLEMENT for run in row['fields']['content']['runs']}
        solo_runs = {identity for (label, identity) in applicable if label == SOLO_SETTLEMENT}
        relevant_parties = {identity for (label, identity) in applicable if label == PARTY_SETTLEMENT}
        companions = {key: row for key, row in related.items()
                      if (key[1] if key[0] == COVERAGE else row['fields']['party_id']) in relevant_parties}
        output, seen = [], set()
        for row in data:
            label, identity, fields = row['model'], str(row['pk']), row['fields']
            key = (label, identity)
            if (label == FACT and fields['kind'] == 'round' and fields['exploration_id'] in party_runs | solo_runs
                    or label == EVENT and fields['kind'] == 'round' and fields['party_id'] in relevant_parties):
                removed_keys.add(revision_key(label, identity))
                continue
            replacement = applicable.get(key) or companions.get(key)
            if replacement:
                if not ancestor and key in companions and row != replacement:
                    raise SyncError('同一战斗的每日统计与压缩归档不一致')
                output.append(replacement)
                seen.add(key)
            else:
                output.append(row)
        # A completed older snapshot may predate creation of a settlement.
        # Its fully verified source has just proved this replacement.
        if not ancestor:
            output.extend(marker for key, marker in {**applicable, **companions}.items() if key not in seen)
        revisions = dict(revisions or {})
        for key in {**applicable, **companions}:
            if key in seen or not ancestor:
                revisions[revision_key(*key)] = chosen_revisions[revision_key(*key)]
        try:
            output, stripped = strip_replays(output,
                [row['fields']['content'] for (label, _), row in applicable.items() if label == PARTY_SETTLEMENT],
                verify_original=False, allow_incomplete=ancestor)
        except (ValueError, KeyError, TypeError, AttributeError, IndexError) as exc:
            raise SyncError('旧快照中的个人战斗历史无法安全压缩') from exc
        for key, row in stripped.items():
            revision_id = revision_key(*key)
            entry = dict(revisions.get(revision_id) or {})
            entry.update(hash=canonical_hash(row['fields']), deleted=False)
            entry.setdefault('revision_at', '1970-01-01T00:00:00+00:00')
            entry.setdefault('origin_device', 'combat-archive')
            revisions[revision_id] = entry
        return output, revisions

    local_data, local_revisions = normalize(local_data, local_revisions)
    remote_data, remote_revisions = normalize(remote_data, remote.get('revisions') or {})
    base_data, base_revisions = normalize((base or {}).get('data') or [], (base or {}).get('revisions') or {},
                                          ancestor=True)
    for revisions in (local_revisions, remote_revisions, base_revisions):
        for key in removed_keys:
            revisions.pop(key, None)
    remote = {**remote, 'data': remote_data, 'revisions': remote_revisions}
    if base:
        base = {**base, 'data': base_data, 'revisions': base_revisions}
    return base, local_data, local_revisions, remote
