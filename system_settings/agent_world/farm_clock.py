"""纯时间计算；不运行 AI，也不创建经营产物库存。"""
import hashlib
from datetime import datetime
from zoneinfo import ZoneInfo

SHANGHAI = ZoneInfo('Asia/Shanghai')
SLOT = 21600
DAY = 86400


def weather(seed: str, at: float) -> str:
    # UTC+8 的六小时区间；跨设备使用同步的世界种子。
    index = int((at + 28800) // SLOT)
    return 'rain' if int(hashlib.sha256(f'{seed}:{index}'.encode()).hexdigest()[:8], 16) % 100 < 30 else 'sun'


def wet_intervals(seed: str, start: float, end: float, watered_until: float) -> list[tuple[float, float]]:
    intervals = [(start, min(end, watered_until))] if watered_until > start else []
    # 前 24 小时的降雨仍可能对当前区间保湿。
    index = int((start - DAY + 28800) // SLOT)
    last = int((end + 28800) // SLOT)
    for slot in range(index, last + 1):
        left = slot * SLOT - 28800
        if weather(seed, left) == 'rain':
            a, b = max(start, left), min(end, left + SLOT + DAY)
            if b > a:
                intervals.append((a, b))
    merged = []
    for a, b in sorted(intervals):
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(b, merged[-1][1]))
        else:
            merged.append((a, b))
    return merged


def production_result(half_hearts: int, roll: float) -> dict:
    if half_hearts == 10 and roll >= .9:
        return {'quality': 'gold', 'quantity': 1}
    return {'quality': 'normal', 'quantity': 2 if roll < half_hearts * .05 else 1}


def advance_state(state: dict, seed: str, now: float) -> bool:
    changed = False
    for plot in state['plots']:
        crop = plot.get('crop')
        if not crop or crop['grown'] >= crop['rules']['growth_seconds']:
            continue
        start = crop['checked_at']
        if now <= start:
            continue
        elapsed = sum(b-a for a, b in wet_intervals(seed, start, now, plot['watered_until']))
        crop['grown'] = min(crop['rules']['growth_seconds'], crop['grown'] + elapsed)
        crop['checked_at'] = now
        changed = True
    for animal in state['animals']:
        cycle = animal['cycle']
        if cycle.get('result') or now <= cycle['checked_at']:
            continue
        started_at = cycle['checked_at']
        needed = cycle['rules']['period_seconds'] - cycle['grown']
        elapsed = max(0, min(now, animal['fed_until']) - started_at)
        cycle['grown'] = min(cycle['rules']['period_seconds'], cycle['grown'] + elapsed)
        cycle['checked_at'] = now
        if cycle['grown'] >= cycle['rules']['period_seconds']:
            # 一轮只抽一次；保存结果及好感快照，不能在领取时重抽。
            digest = hashlib.sha256(f'{seed}:{animal["id"]}:{cycle["number"]}'.encode()).hexdigest()
            roll = int(digest[:13], 16) / 16**13
            cycle['result'] = {**production_result(animal['half_hearts'], roll), 'half_hearts': animal['half_hearts'], 'completed_at': started_at + needed}
        changed = True
    return changed


def local_day(at: float) -> str:
    return datetime.fromtimestamp(at, SHANGHAI).date().isoformat()
