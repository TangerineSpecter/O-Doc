"""Compact continuity evidence for removed stretches of ordinary rounds.

The caller must validate the complete source and the frozen settlement before
using these ranges. This module does not remove or authorize removal of data.
"""
from .store import digest

FACT_FIELDS = ('id', 'actor_id', 'owner_id', 'sequence', 'kind', 'exploration_id',
               'elapsed_seconds', 'payload', 'previous_hash')
EVENT_FIELDS = ('party_id', 'owner_id', 'sequence', 'kind', 'payload', 'previous_hash')


def _signature(row, keys):
    return digest({key: row[key] for key in keys})


def _ranges(rows, keys, identity_field, *, owner, identity, run_ids=None):
    selected = []
    for row in rows:
        if row['kind'] != 'round' or row[identity_field] != identity:
            continue
        if run_ids is not None and row['exploration_id'] not in run_ids:
            continue
        if row['owner_id'] != owner or _signature(row, keys) != row['digest']:
            raise ValueError('待压缩回合的账号或内容指纹不一致')
        selected.append(row)
    selected.sort(key=lambda row: row['sequence'])
    result = []
    for row in selected:
        sequence = row['sequence']
        if type(sequence) is not int or sequence < 1:
            raise ValueError('待压缩回合序号无效')
        run = row.get('exploration_id', '') if run_ids is not None else ''
        last = result[-1] if result else None
        if last and sequence <= last['last_sequence']:
            raise ValueError('待压缩回合序号重复或乱序')
        if last and sequence == last['last_sequence'] + 1 and run == last['exploration_id']:
            if row['previous_hash'] != last['last_digest']:
                raise ValueError('待压缩回合的事实链不连续')
            last['last_sequence'] = sequence
            last['last_digest'] = row['digest']
        else:
            result.append({'owner_id': owner, 'stream_id': identity, 'exploration_id': run,
                           'first_sequence': sequence, 'last_sequence': sequence,
                           'previous_hash': row['previous_hash'], 'last_digest': row['digest']})
    return result


def personal_ranges(rows, *, owner, actor, run_ids):
    return _ranges(rows, FACT_FIELDS, 'actor_id', owner=owner, identity=actor, run_ids=set(run_ids))


def shared_ranges(rows, *, owner, party):
    return _ranges(rows, EVENT_FIELDS, 'party_id', owner=owner, identity=party)


def _verify(ordered, ranges, *, identity, owner, base, previous, head, final_digest,
            identity_field, keys, require_checkpoint=False):
    gaps = sorted(ranges, key=lambda item: item['first_sequence'])
    for gap in gaps:
        first, last = gap['first_sequence'], gap['last_sequence']
        if (gap['owner_id'] != owner or gap['stream_id'] != identity or type(first) is not int
                or type(last) is not int or first <= base or last < first
                or not isinstance(gap['previous_hash'], str) or not isinstance(gap['last_digest'], str)
                or len(gap['last_digest']) != 64):
            raise ValueError('压缩回合的连续性范围无效')
    next_sequence, index, seen = base + 1, 0, False

    def consume_gap():
        nonlocal previous, next_sequence, index, seen
        gap = gaps[index]
        if gap['first_sequence'] != next_sequence or gap['previous_hash'] != previous:
            raise ValueError('压缩回合与保留事实的链边界不一致')
        if require_checkpoint and not seen:
            raise ValueError('原有归档边界后的检查点缺失')
        previous = gap['last_digest']
        next_sequence = gap['last_sequence'] + 1
        index += 1
        seen = True

    for row in ordered:
        while index < len(gaps) and gaps[index]['first_sequence'] < row['sequence']:
            consume_gap()
        if (row[identity_field] != identity or row['owner_id'] != owner
                or row['sequence'] != next_sequence or row['previous_hash'] != previous
                or _signature(row, keys) != row['digest']):
            raise ValueError('保留事实链缺失或发生分叉')
        if require_checkpoint and not seen and (not previous or row.get('kind') != 'checkpoint'):
            raise ValueError('原有归档边界后的检查点缺失')
        previous = row['digest']
        next_sequence += 1
        seen = True
    while index < len(gaps):
        consume_gap()
    if not seen or next_sequence - 1 != head or previous != final_digest:
        raise ValueError('压缩后的事实链终点不一致')


def verify_personal(ordered, chain, *, actor, owner, ranges):
    base = int(chain.get('archive_sequence') or 0)
    if chain['owner_id'] != owner:
        raise ValueError('个人事实链账号不一致')
    _verify(ordered, ranges, identity=actor, owner=owner, base=base,
            previous=chain.get('archive_digest') or '', head=chain['head'], final_digest=chain['digest'],
            identity_field='actor_id', keys=FACT_FIELDS, require_checkpoint=bool(base))


def verify_shared(ordered, party, *, ranges):
    _verify(ordered, ranges, identity=party['id'], owner=party['owner_id'], base=0, previous='',
            head=party['head'], final_digest=party['digest'], identity_field='party_id', keys=EVENT_FIELDS)
