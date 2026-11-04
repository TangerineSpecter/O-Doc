"""Common validation of compact daily contributions against their markers."""

from .store import digest


def _valid_groups(days):
    for day in days:
        if not isinstance(day['groups'], list):
            return False
        groups_seen = set()
        for group in day['groups']:
            if (not isinstance(group, dict) or not isinstance(group.get('monster'), dict)
                    or type(group.get('kills')) is not int or group['kills'] <= 0
                    or not isinstance(group.get('participants'), list) or not group['participants']):
                return False
            monster = group['monster']
            if (any(not isinstance(monster.get(key), str) or not monster[key] for key in ('id', 'name', 'rank'))
                    or type(monster.get('level')) is not int or monster['level'] < 0):
                return False
            seen = set()
            identities = []
            for participant in group['participants']:
                if not isinstance(participant, dict):
                    return False
                actor, run = participant.get('actor_id'), participant.get('exploration_id')
                if not isinstance(actor, str) or not actor or not isinstance(run, str) or not run or actor in seen:
                    return False
                if (type(participant.get('first_sequence')) is not int or participant['first_sequence'] <= 0
                        or not isinstance(participant.get('first_fact_id'), str) or not participant['first_fact_id']
                        or type(participant.get('first_event_index')) is not int or participant['first_event_index'] < 0):
                    return False
                seen.add(actor)
                identities.append((actor, run))
            key = (monster['id'], monster['name'], monster['rank'], monster['level'], tuple(sorted(identities)))
            if key in groups_seen:
                return False
            groups_seen.add(key)
    return True


def valid_days(marker, party, rows, owner):
    """Return validated daily rows, or None if their local coverage is invalid.

    This validates the compact projection and its source fingerprint. It does
    not verify raw chains, assets, or remote recovery and cannot authorize
    source deletion.
    """
    source = marker.source if isinstance(marker.source, dict) else {}
    daily = [{'date': row.day.isoformat(), 'first_sequence': row.first_sequence,
              'last_sequence': row.last_sequence, 'groups': row.groups} for row in rows]
    if (marker.version != 1 or not party or party.status != 'completed'
            or source.get('owner_id') != owner or source.get('party_id') != marker.pk
            or source.get('head') != party.head or source.get('digest') != party.digest
            or source.get('frame') != party.frame or source.get('frame_version') != party.frame_version
            or any(row.owner_id != owner for row in rows)
            or marker.days != [row['date'] for row in daily]
            or source.get('days_digest') != digest(daily) or not _valid_groups(daily)):
        return None
    return daily
