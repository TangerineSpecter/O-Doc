"""Complete sampled Cartesian regions; no interpolation or winner selection."""
from collections import deque
from itertools import product
from math import prod
from .sensitivity import PARTS, _spreads


def rectangles(points: list[dict], axes: list[str], rule: dict, *, stable: bool) -> list[dict]:
    """Grow only complete rectangles over the planned discrete numeric lattice.

    Missing, rejected and unexecuted coordinates remain in the lattice and block
    growth. A dense region cannot jump over them. Monotone spread checks prune
    growth without ranking or cherry-picking a profitable subset of a rectangle.
    """
    if len(axes) < 2:
        return []
    levels = [sorted({point['parameters'][name] for point in points}) for name in axes]
    lookup = {tuple(values.index(point['parameters'][name]) for name, values in zip(axes, levels)): point
              for point in points}
    usable = {coordinate: point for coordinate, point in lookup.items() if point['eligible' if stable else 'comparable']}
    queue = deque(tuple((i, i) for i in coordinate) for coordinate in sorted(usable))
    visited, found = set(), []
    while queue:
        bounds = queue.popleft()
        if bounds in visited:
            continue
        visited.add(bounds)
        count = prod(hi - lo + 1 for lo, hi in bounds)
        if count > len(usable):
            continue
        coordinates = list(product(*(range(lo, hi + 1) for lo, hi in bounds)))
        if any(coordinate not in usable for coordinate in coordinates):
            continue
        members = [usable[coordinate] for coordinate in coordinates]
        spreads = _spreads(members)
        missing = {part: max(point['metrics'][part]['missing_signals'] / point['metrics'][part]['bars'] for point in members)
                        - min(point['metrics'][part]['missing_signals'] / point['metrics'][part]['bars'] for point in members)
                   for part in PARTS}
        if stable and any(spreads[part]['total_return'] > rule['return_spread_limit'] + 1e-12
                or spreads[part]['max_drawdown'] > rule['drawdown_spread_limit'] + 1e-12
                or missing[part] > rule['maximum_missing_fraction_spread'] + 1e-12 for part in PARTS):
            continue
        if count >= rule['minimum_points'] and sum(lo != hi for lo, hi in bounds) >= rule['minimum_dimensions']:
            found.append((bounds, members, spreads))
        for dimension, (lo, hi) in enumerate(bounds):
            for edge in ((lo - 1, hi), (lo, hi + 1)):
                if edge[0] >= 0 and edge[1] < len(levels[dimension]):
                    queue.append(bounds[:dimension] + (edge,) + bounds[dimension + 1:])
    # Every maximal rectangle survives, including overlapping alternatives.
    maximal = [(bounds, members, spreads) for bounds, members, spreads in found if not any(
        bounds != outer and all(a <= lo and hi <= b for (lo, hi), (a, b) in zip(bounds, outer))
        for outer, _, _ in found)]
    return [{'sampled_values': {name: values[lo:hi + 1] for name, values, (lo, hi) in zip(axes, levels, bounds)},
             'attempt_ids': [point['attempt_id'] for point in members], 'spreads': spreads}
            for bounds, members, spreads in sorted(maximal, key=lambda item: item[0])]
