"""Pure calendar and draw rules. No database, model requests or wall clock."""
import hashlib
import random
from datetime import datetime, timedelta, time
from .life_time import SHANGHAI

RULES_VERSION = 1
NORMAL_ROUNDS = 200
OVERTIME_ROUNDS = 50
POTION_POOL = ('healing', 'focus', 'iron', 'fury', 'regen')
SLOTS = {'weapon': '武器', 'offhand': '副手', 'head': '头部', 'body': '胸部',
         'hands': '手部', 'feet': '脚部', 'accessory': '饰品', 'ring_1': '戒指一', 'ring_2': '戒指二'}


def key(*parts: object) -> str:
    return hashlib.sha256(':'.join(str(part) for part in parts).encode()).hexdigest()


def at_two(day):
    return datetime.combine(day, time(14), tzinfo=SHANGHAI)


def next_sunday(day):
    return day + timedelta(days=(6 - day.weekday()) % 7 or 7)


def draw(entrants: list[str], byes: dict[str, int], seed: str) -> list[tuple[str, str]]:
    rng, pool, pairs = random.Random(seed), sorted(entrants), []
    if len(pool) % 2:
        least = min(byes.get(actor, 0) for actor in pool)
        bye = rng.choice([actor for actor in pool if byes.get(actor, 0) == least])
        pool.remove(bye)
        pairs.append((bye, ''))
    rng.shuffle(pool)
    return pairs + list(zip(pool[::2], pool[1::2]))

