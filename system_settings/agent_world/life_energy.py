"""Pure chronological feasibility, using the same recovery history as actual stamina.

This module does not maintain a balance or debit energy. Unknown commitments are
explicit and prevent admission. Recovery is capped at every consumption event.
"""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from .stamina_settings import recovered_between
from .life_time import local_time


@dataclass(frozen=True)
class Commitment:
    key: str
    at: datetime
    energy: Decimal | None
    kind: str


def forecast(current, now, commitments, recovery):
    energy, cursor = Decimal(str(current)), local_time(now)
    trail = []
    for entry in sorted(commitments, key=lambda row: (local_time(row.at), row.key)):
        at = max(cursor, local_time(entry.at))
        if entry.energy is None:
            return {'safe': False, 'reason': 'unknown_commitment', 'key': entry.key, 'timeline': trail}
        cost = Decimal(str(entry.energy))
        if not cost.is_finite() or cost < 0:
            raise ValueError('体力承诺必须为非负有限数值')
        energy = min(Decimal(100), energy + recovered_between(cursor, at, recovery))
        trail.append({'key': entry.key, 'at': at.isoformat(), 'before': str(energy), 'cost': str(cost)})
        if energy < cost:
            return {'safe': False, 'reason': 'insufficient_energy', 'key': entry.key, 'timeline': trail}
        energy -= cost
        cursor = at
    return {'safe': True, 'remaining': str(energy), 'timeline': trail}


def allowance(current, now, commitments, recovery):
    """Largest whole energy spend now that preserves all known commitments."""
    if not forecast(current, now, commitments, recovery)['safe']:
        return 0
    low, high = 0, int(Decimal(str(current)))
    while low < high:
        mid = (low + high + 1) // 2
        candidate = Commitment('!candidate', now, Decimal(mid), 'candidate')
        if forecast(current, now, [candidate, *commitments], recovery)['safe']:
            low = mid
        else:
            high = mid - 1
    return low
