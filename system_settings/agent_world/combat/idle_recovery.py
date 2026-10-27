"""Read-only idle resource projection from the synchronized recovery baseline."""
from datetime import datetime, timedelta

from ..life_time import local_time

BLOCK_SECONDS = 300


def project(hp: int, mp: int, hp_max: int, mp_max: int, recovered_at,
            rest_until=None, now=None) -> dict:
    now = local_time(now)
    base = local_time(recovered_at)
    rest = local_time(rest_until) if rest_until else None
    hp_step, mp_step = max(1, int(hp_max * .05)), max(1, int(mp_max * .1))
    mp_blocks = max(0, int((now - base).total_seconds() // BLOCK_SECONDS))
    mp = min(mp_max, mp + mp_step * mp_blocks)
    mp_base = base + timedelta(seconds=mp_blocks * BLOCK_SECONDS)
    hp_base = max(base, rest) if rest else base
    resting = bool(rest and now < rest)
    if rest and not resting:
        hp = hp_max
    hp_blocks = max(0, int((now - hp_base).total_seconds() // BLOCK_SECONDS))
    if not resting:
        hp = min(hp_max, hp + hp_step * hp_blocks)
    hp_base += timedelta(seconds=hp_blocks * BLOCK_SECONDS)

    def resource(value, maximum, step, anchor):
        blocks = max(0, (maximum - value + step - 1) // step)
        return {
            'amount': step,
            'next_at': (anchor + timedelta(seconds=BLOCK_SECONDS)).isoformat() if blocks else None,
            'full_at': (anchor + timedelta(seconds=blocks * BLOCK_SECONDS)).isoformat() if blocks else None,
        }

    hp_timing = resource(hp, hp_max, hp_step, hp_base)
    if resting:
        hp_timing['next_at'] = rest.isoformat()
        hp_timing['full_at'] = rest.isoformat()
    mp_timing = resource(mp, mp_max, mp_step, mp_base)
    deadlines = [value for value in (hp_timing['next_at'], mp_timing['next_at']) if value]
    return {'hp': hp, 'mp': mp, 'recovery': {
        'server_now': now.isoformat(),
        'next_at': min(deadlines, key=datetime.fromisoformat) if deadlines else None,
        'hp': hp_timing, 'mp': mp_timing,
    }}
