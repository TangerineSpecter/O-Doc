"""Shared conservative live-data budget, stored only in the local policy JSON.

Callers hold the singleton policy row lock in the same transaction as their writes.
The budget is deliberately distinct from PostgreSQL's retained/free disk pages.
"""
import json
from django.db import connection, models
from .models import PerformanceBucket, PerformanceSample, PerformanceFlushBatch, DatabaseStatSnapshot, PerformanceInflight

ROW_OVERHEAD = 2048
TABLES = (PerformanceSample, DatabaseStatSnapshot, PerformanceBucket, PerformanceFlushBatch, PerformanceInflight)


def estimate(model, values):
    size = ROW_OVERHEAD
    for field in model._meta.fields:
        if isinstance(field, models.JSONField):
            value = values.get(field.name) if isinstance(values, dict) else getattr(values, field.name)
            size += 2 * len(json.dumps(value, ensure_ascii=False).encode())
    return size


def row_cost_sql(model):
    fields = [field for field in model._meta.fields if isinstance(field, models.JSONField)]
    return str(ROW_OVERHEAD) + ''.join(
        f' + 2 * COALESCE(octet_length({connection.ops.quote_name(field.column)}::text),0)' for field in fields)


def measure_live_bytes():
    # Only diagnostic tables are scanned, with the caller's short statement
    # timeout. Reconciliation runs on first use / maintenance, never per event.
    total = ROW_OVERHEAD  # singleton policy and its small metadata
    with connection.cursor() as cursor:
        for model in TABLES:
            table = connection.ops.quote_name(model._meta.db_table)
            cursor.execute(f'SELECT COALESCE(SUM({row_cost_sql(model)}),0) FROM {table}')
            total += int(cursor.fetchone()[0])
    return total


class Budget:
    def __init__(self, policy, *, reconcile=False):
        self.policy = policy
        self.limit = int(policy.value.get('max_mb', 200)) * 1024 * 1024
        self.state = dict(policy.value.get('_storage') or {})
        self.state.setdefault('limited', False)
        self.state.setdefault('discarded_samples', 0)
        self.state.setdefault('rejected_events', 0)

        if reconcile or 'used_bytes' not in self.state:
            self.set_usage(measure_live_bytes())

    def reserve(self, amount, *, detail=False):
        if (detail and self.state['limited']) or self.state['used_bytes'] + amount > self.limit:
            self.state['limited'] = True
            return False
        self.state['used_bytes'] += amount
        return True

    def set_usage(self, used_bytes):
        self.state['used_bytes'] = used_bytes
        if self.state['used_bytes'] > self.limit:
            self.state['limited'] = True
        elif self.state['used_bytes'] <= int(self.limit * .85):
            self.state['limited'] = False

    def save(self):
        self.policy.value = {**self.policy.value, '_storage': self.state}
        self.policy.save(update_fields=['value'])

    def info(self):
        return {**self.state, 'limit_bytes': self.limit}
