"""Descriptive Pearson/Spearman coefficients, with explicit undefined cases."""
import math


def ranks(values: list[float]) -> list[float]:
    ordered = sorted(range(len(values)), key=values.__getitem__)
    result = [0.] * len(values); at = 0
    while at < len(ordered):
        end = at + 1
        while end < len(ordered) and values[ordered[end]] == values[ordered[at]]: end += 1
        for index in ordered[at:end]: result[index] = (at + 1 + end) / 2
        at = end
    return result


def pearson(left: list[float], right: list[float]) -> float | None:
    if len(left) != len(right) or len(left) < 2: return None
    def center(values):
        scale = max(abs(value) for value in values)
        if scale == 0: return None
        scaled = [value / scale for value in values]
        mean = math.fsum(scaled) / len(scaled)
        residual = [value - mean for value in scaled]
        norm = math.sqrt(math.fsum(value * value for value in residual))
        # Exact constants have no correlation; near constants remain explicit
        # undefined instead of manufacturing a stable-looking large IC.
        if norm <= 1e-13 * abs(mean): return None
        return [value / norm for value in residual]
    a, b = center(left), center(right)
    if a is None or b is None: return None
    value = math.fsum(x * y for x, y in zip(a, b))
    return max(-1., min(1., value))
