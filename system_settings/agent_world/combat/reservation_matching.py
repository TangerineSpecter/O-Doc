"""Deterministic, bounded-size party matching on minute-resolution shared free intervals."""
from collections import Counter
from functools import lru_cache
from itertools import combinations

DURATIONS = (1800, 3600, 7200)
PREPARE_SECONDS = 600


def voted_duration(members):
    counts = Counter(row['duration_seconds'] for row in members)
    leaders = [n for n, votes in counts.items() if votes == max(counts.values())]
    return leaders[0] if len(leaders) == 1 else 1800


def match(members, feasible):
    """Maximize participants, balance sizes, diversify jobs, then earliest departures.

    Set packing is memoized by remaining IDs; only feasible parties enter the search.
    Each legal team contains at most four residents. Inputs and ties are stable.
    """
    rows = {row['actor_id']: row for row in members}
    teams = {}
    for size in (2, 3, 4):
        for ids in combinations(sorted(rows), size):
            group = [rows[k] for k in ids]
            preferred = voted_duration(group)
            for duration in dict.fromkeys((preferred, 1800)):
                at = feasible(group, duration)
                if at is not None:
                    teams[ids] = {'members': group, 'duration_seconds': duration, 'starts_at': at}
                    break
    def score(groups):
        sizes = [len(g['members']) for g in groups]
        # Squared sizes gives 3+3 preference over 4+2, while avoiding surplus small teams.
        return (-sum(sizes), len(sizes), sum(n*n for n in sizes),
                sum(len(g['members'])-len({m['job_id'] for m in g['members']}) for g in groups),
                sum(g['starts_at'].timestamp() for g in groups),
                tuple(tuple(m['actor_id'] for m in g['members']) for g in groups))
    @lru_cache(None)
    def solve(remaining):
        if not remaining:
            return ()
        first, *tail = remaining
        best = solve(tuple(tail))
        for ids, group in teams.items():
            if first in ids and set(ids).issubset(remaining):
                candidate = (group, *solve(tuple(k for k in remaining if k not in ids)))
                if score(candidate) < score(best):
                    best = candidate
        return best
    return list(solve(tuple(sorted(rows))))
