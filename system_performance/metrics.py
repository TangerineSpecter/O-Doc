"""Bounded, mergeable statistics, independent of Django and business arguments."""
import hashlib
import json
import math

LEGACY_BOUNDS_V1 = (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
                    30000, 60000, 120000, 300000, 600000, 1800000)
BOUNDS = list(LEGACY_BOUNDS_V1)
DEFAULT_POLICY = dict(enabled=False, request_ms=1000, sql_ms=200, sql_total_ms=500,
                      sql_count=50, stream_ms=120000, first_chunk_ms=5000,
                      ai_ms=60000, first_output_ms=10000, task_ms=60000,
                      http_ms=3000, sample_days=7, aggregate_days=30, max_mb=200)
ERRORS = {'failed', 'timeout'}


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=True).encode()).hexdigest()


def distribution(values: list[float]) -> list[int]:
    bins = [0] * (len(BOUNDS) + 1)
    for value in values:
        index = next((i for i, bound in enumerate(BOUNDS) if value <= bound), len(BOUNDS))
        bins[index] += 1
    return bins


def histogram_schema():
    return {'version': 1, 'bounds': list(BOUNDS)}


def valid_distribution(bins, bounds, count):
    return (isinstance(bins, list) and len(bins) == len(bounds) + 1
            and all(type(value) is int and value >= 0 for value in bins) and sum(bins) == count)


def stored_bounds(row):
    schema = row.get('dimensions', {}).get('histogram_schema')
    if schema is None:
        return LEGACY_BOUNDS_V1
    if not isinstance(schema, dict) or schema.get('version') != 1:
        return None
    bounds = schema.get('bounds')
    if not isinstance(bounds, list) or not bounds or any(type(n) not in (int, float) or not math.isfinite(n) or n <= 0 for n in bounds):
        return None
    return tuple(bounds) if all(a < b for a, b in zip(bounds, bounds[1:])) else None


def percentile(bins: list[int], quantile: float, bounds=None) -> dict | None:
    bounds = BOUNDS if bounds is None else bounds
    total = sum(bins)
    if not total:
        return None
    rank, seen = max(1, math.ceil(total * quantile)), 0
    for i, count in enumerate(bins):
        seen += count
        if seen >= rank:
            return {'lower_ms': bounds[i - 1] if i else 0,
                    'upper_ms': bounds[i] if i < len(bounds) else None}
    return None


def summarize(rows: list[dict]) -> dict:
    count = sum(row['count'] for row in rows)
    schemas = [stored_bounds(row) for row in rows]
    status = 'empty' if not rows else 'available'
    if any(bounds is None or not valid_distribution(row.get('histogram'), bounds, row['count']) for row, bounds in zip(rows, schemas)):
        status = 'invalid'
    elif len(set(schemas)) > 1:
        status = 'incompatible'
    bounds = schemas[0] if schemas and status == 'available' else None
    bins = [sum(row['histogram'][i] for row in rows) for i in range(len(bounds) + 1)] if bounds is not None else None
    errors = sum(row['errors'] for row in rows)
    slow = sum(row['slow'] for row in rows)
    total = sum(row['total_ms'] for row in rows)
    return dict(count=count, errors=errors, slow=slow, total_ms=total,
                average_ms=total / count if count else None,
                max_ms=max((r['max_ms'] for r in rows), default=None),
                error_ratio=errors / count if count else None,
                slow_ratio=slow / count if count else None,
                p95=percentile(bins, .95, bounds) if bins is not None else None,
                p99=percentile(bins, .99, bounds) if bins is not None else None,
                histogram=bins, histogram_status=status, histogram_bounds=bounds,
                sql_count=sum(r['sql_count'] for r in rows), sql_ms=sum(r['sql_ms'] for r in rows))
