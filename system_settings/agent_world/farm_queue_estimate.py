"""仅估算地块及周期容量，缺货、体力、随机事件可能降低实际结果。"""
import math
from .farm_clock import advance_state


def plot_availability(state: dict, seed: str, start: float) -> list[float]:
    """Read a copy, including crops already growing before the planned start."""
    import copy
    state = copy.deepcopy(state)
    advance_state(state, seed, start)
    return [start + max(0, p['crop']['rules']['growth_seconds']-p['crop']['grown']) if p.get('crop') else start for p in state['plots']]


def planting_time(available: float, start: float) -> float:
    return start + math.ceil(max(0, available - start) / 1800) * 1800


def estimate(state: dict, entries: list[dict], rules: dict, seed: str, start: float, cutoff: float) -> dict:
    available = plot_availability(state, seed, start)
    result = []
    for entry in entries:
        planted = harvested = 0
        period = rules['crops'][entry['sku'][5:]]['growth_seconds']
        for _ in range(entry['quantity']):
            if not available:
                break
            index = min(range(len(available)), key=available.__getitem__)
            at = planting_time(available[index], start)
            if at >= cutoff:
                break
            planted += 1
            harvested += int(at+period <= cutoff)
            available[index] = at+period
        result.append({'entry_id': entry['id'], 'sowable': planted, 'harvestable': harvested,
                       'unplanted': entry['quantity']-planted})
    return {'entries': result, 'assumptions': '按地块和生长周期估算；物资、体力、异常及实际开工延迟可能减少完成数量，计划不等于事实'}
