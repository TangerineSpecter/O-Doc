"""纯规则：时间、候选、概率、成长及猜拳；不执行 I/O。"""
import math
from datetime import timedelta


def level_for(experience: int, maximum: int = 50) -> tuple[int, int, int]:
    level, remaining = 1, experience
    while level < maximum:
        needed = 100 + 25 * (level - 1)
        if remaining < needed:
            return level, remaining, needed
        remaining -= needed
        level += 1
    return maximum, remaining, 0


def skill_progress(experience: int, maximum: int = 50) -> dict:
    """居民属性采用其他生活技能一致的 0～1 进度，不改变累计经验。"""
    level, remaining, needed = level_for(experience, maximum)
    return {'level': level, 'experience': experience, 'level_experience': remaining,
            'next_level_experience': experience - remaining + needed if needed else None,
            'progress': remaining / needed if needed else 1}


def capture_probability(level: int, fish_level: int, rod_bonus: float = 0) -> float:
    x = max(-700, min(700, math.log(2) + (level - fish_level) / 10 + rod_bonus))
    return .05 + .90 / (1 + math.exp(-x))


def active(fish: dict, at) -> bool:
    hour = at.hour + at.minute / 60 + at.second / 3600
    return any(start <= hour < end if start < end else hour >= start or hour < end
               for start, end in fish['hours'])


def preference(fish: dict, bait: str) -> int:
    return 3 if bait in fish['preferred'] else 1 if bait in fish['accepted'] else 0


def candidates(rules: dict, spot: str, bait: str, at) -> dict:
    return {key: fish for key, fish in rules['fish'].items()
            if fish['spot'] == spot and preference(fish, bait) and active(fish, at)}


def bait_facts(rules: dict, inventory: dict, spot: str, start, minutes: int) -> dict:
    result = {}
    for bait, quantity in inventory.items():
        if quantity <= 0 or bait not in rules['baits']:
            continue
        fish_ids = set()
        for elapsed in range(rules['interval_seconds'], minutes * 60 + 1, rules['interval_seconds']):
            fish_ids.update(candidates(rules, spot, bait, start + timedelta(seconds=elapsed)))
        if fish_ids:
            result[bait] = {'name': rules['baits'][bait]['name'], 'quantity': quantity,
                'fish': [{'id': key, 'name': rules['fish'][key]['name'],
                          'preferred': preference(rules['fish'][key], bait) == 3,
                          'hours': rules['fish'][key]['hours']} for key in sorted(fish_ids)]}
    return result


def encounter(rules: dict, spot: str, bait: str, at, rng) -> dict:
    pool = candidates(rules, spot, bait, at)
    kings = [(key, fish) for key, fish in pool.items() if fish['king']]
    king_p = rules['king_probability'] * preference(kings[0][1], bait) / 3 if kings else 0
    roll = rng.random()
    if roll < rules['empty_probability']:
        return {'kind': 'empty'}
    if roll < rules['empty_probability'] + rules['junk_probability']:
        return {'kind': 'junk', 'name': rng.choice(['旧靴子', '水草团', '破陶片'])}
    if kings and roll < rules['empty_probability'] + rules['junk_probability'] + king_p:
        return {'kind': 'king', 'fish_id': kings[0][0]}
    normal = [(key, fish) for key, fish in pool.items() if not fish['king']]
    if not normal:
        return {'kind': 'empty'}
    key = rng.choices([key for key, _ in normal],
                      weights=[fish['weight'] * preference(fish, bait) for _, fish in normal])[0]
    return {'kind': 'fish', 'fish_id': key}


def experience_for(fish: dict) -> int:
    return (10 + fish['level'] * 2) * (5 if fish['king'] else 1)


def duel_result(player: str, king: str) -> str:
    if player not in ('rock', 'scissors', 'paper') or king not in ('rock', 'scissors', 'paper'):
        raise ValueError('出拳无效')
    return 'draw' if player == king else 'win' if (player, king) in (
        ('rock','scissors'), ('scissors','paper'), ('paper','rock')) else 'loss'
