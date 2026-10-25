"""Freeze, compute and publish bounded comparisons outside a long write transaction."""
import copy
import json
import threading
import time

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from quant.factors.curation import curation_data
from quant.locking import collection_lock
from quant.models import FactorCandidate, FactorComparison, FactorMerge, FactorMergeWithdrawal, MarketDataset
from quant.research.contracts import digest
from quant.services import Conflict, touch
from .contracts import ENGINE, METHOD, comparison_hash, merge_hash, runtime, side, validate_plan, withdrawal_hash
from .kernel import evaluate_pair, failure_result, validate_policy

_COMPUTATIONS = threading.BoundedSemaphore(2)


def candidates(collection):
    return FactorCandidate.objects.filter(report__entry__anthology=collection, report__entry__is_valid=True).select_related(
        'report__entry', 'report__source').prefetch_related('revisions')


def _available(collection, expected_owner=None) -> None:
    collection.refresh_from_db()
    if (not collection.is_valid or collection.type != 'quant' or collection.permission != 'private'
            or expected_owner is not None and str(collection.user_id) != expected_owner):
        raise ValidationError('量化文集不可用')


def _plan(collection, values: dict, expected_owner=None) -> tuple[dict, MarketDataset]:
    _available(collection, expected_owner)
    dataset = get_object_or_404(MarketDataset, anthology=collection, pk=values['dataset_id'])
    frozen = {}
    for field in ('left', 'right'):
        raw = values[field]
        if (not isinstance(raw, dict) or not isinstance(raw.get('candidate_id'), str)
                or not 1 <= len(raw['candidate_id']) <= 40):
            raise ValidationError('对照候选标识无效')
        candidate = get_object_or_404(candidates(collection), pk=raw['candidate_id'])
        frozen[field] = side(candidate, raw)
    plan = {'version': 1, 'method': METHOD, 'engine_version': ENGINE, 'runtime': runtime(), 'name': values['name'],
        **frozen, 'dataset_id': dataset.pk, 'dataset_hash': dataset.content_hash, 'policy': copy.deepcopy(values['policy'])}
    validate_plan(plan)
    validate_policy(plan['policy'], len(dataset.snapshot['rows']))
    return plan, dataset


def _existing(collection, values: dict, plan: dict):
    existing = FactorComparison.objects.filter(anthology=collection, request_key=values['request_key']).first()
    # Runtime versions describe the original evidence, not a user-editable input.
    # A later library upgrade must not turn an idempotent retry into new work.
    same_input = existing is None or digest({**existing.plan, 'runtime': plan['runtime']}) == digest(plan)
    if not same_input:
        raise Conflict('请求标识已用于不同因子对照，请使用新标识')
    return existing


def compare(collection, values: dict) -> FactorComparison:
    owner = str(collection.user_id)
    with collection_lock(collection.pk), transaction.atomic():
        plan, dataset = _plan(collection, values, owner)
        existing = _existing(collection, values, plan)
        if existing:
            return existing
        snapshot = copy.deepcopy(dataset.snapshot)
    if not _COMPUTATIONS.acquire(blocking=False):
        raise Conflict('本机已有两份因子对照正在计算，请稍后重试')
    try:
        try:
            result = evaluate_pair(*[{key: plan[field][key] for key in ('candidate', 'bindings', 'parameters')}
                for field in ('left', 'right')], snapshot, plan['policy'], deadline=time.monotonic() + 15)
        except TimeoutError:
            result = failure_result(snapshot, plan['policy'])
    finally:
        _COMPUTATIONS.release()
    # Source snapshots are immutable, but a restore or deletion can happen while
    # CPU work runs. Recheck the complete input before publishing its evidence.
    with collection_lock(collection.pk), transaction.atomic():
        current, _ = _plan(collection, values, owner)
        if digest(current) != digest(plan):
            raise Conflict('对照期间来源或行情已改变，请刷新后重新比较')
        existing = _existing(collection, values, plan)
        if existing:
            return existing
        record = FactorComparison.objects.create(id=digest(['factor-comparison-v1', str(collection.pk), values['request_key']])[:40],
            anthology=collection, left_id=plan['left']['id'], right_id=plan['right']['id'], dataset_id=plan['dataset_id'],
            request_key=values['request_key'], plan=plan, result=result, content_hash=comparison_hash(plan, result))
        from quant.verification.services import comparison as archive_verification
        archive_verification(record)
        for identity in (record.left_id, record.right_id):
            touch(FactorCandidate.objects.select_related('report__entry').get(pk=identity).report.entry)
        return record


def comparison_data(record: FactorComparison, detail=False) -> dict:
    data = {'id': record.pk, 'name': record.plan['name'], 'left_id': record.left_id, 'right_id': record.right_id,
        'dataset_id': record.dataset_id, 'created_at': record.created_at.isoformat(), 'content_hash': record.content_hash,
        'verdict': record.result['status']}
    if detail:
        from quant.experiments.datasets import dataset_data
        data.update(plan_json=json.dumps(record.plan, ensure_ascii=False, allow_nan=False),
            result_json=json.dumps(record.result, ensure_ascii=False, allow_nan=False),
            dataset_json=json.dumps(dataset_data(record.dataset), ensure_ascii=False, allow_nan=False),
            merges=[merge_data(row) for row in record.merges.select_related('comparison', 'withdrawal')])
    return data


def _curation(candidate: FactorCandidate) -> dict:
    value = curation_data(candidate)
    return {'candidate_id': candidate.pk, 'revision_id': value['current_revision_id'], 'data': copy.deepcopy(value['curation'])}


def create_merge(collection, values: dict) -> FactorMerge:
    with collection_lock(collection.pk), transaction.atomic():
        _available(collection)
        old = FactorMerge.objects.filter(anthology=collection, request_key=values['request_key']).first()
        if old:
            if (old.comparison_id, old.name, old.reason) != (values['comparison_id'], values['name'], values['reason']):
                raise Conflict('请求标识已用于不同合并，请使用新标识')
            return old
        comparison = get_object_or_404(FactorComparison, anthology=collection, pk=values['comparison_id'])
        if comparison.result.get('status') != 'pass' or comparison.result.get('evaluation_status') != 'completed':
            raise ValidationError('只有已完成且固定样本输出一致的直接对照才能作为合并依据')
        current = {key: get_object_or_404(candidates(collection), pk=getattr(comparison, key + '_id')) for key in ('left', 'right')}
        active = FactorMerge.objects.filter(anthology=collection, withdrawal__isnull=True)
        endpoints = {comparison.left_id, comparison.right_id}
        if any({row.comparison.left_id, row.comparison.right_id} == endpoints for row in active.select_related('comparison')):
            raise Conflict('这两个候选已有有效合并；撤销原合并后可重新建立依据')
        curation = {'version': 1, **{key: _curation(candidate) for key, candidate in current.items()}}
        value = merge_hash(str(collection.pk), comparison.pk, comparison.content_hash, values['name'], values['reason'], curation)
        record = FactorMerge.objects.create(id=digest(['factor-merge-v1', str(collection.pk), values['request_key']])[:40],
            anthology=collection, comparison=comparison, request_key=values['request_key'], name=values['name'], reason=values['reason'],
            curation=curation, content_hash=value)
        for candidate in current.values():
            touch(candidate.report.entry)
        return record


def withdraw(collection, merge: FactorMerge, values: dict) -> FactorMerge:
    with collection_lock(collection.pk), transaction.atomic():
        _available(collection)
        old = FactorMergeWithdrawal.objects.filter(anthology=collection, request_key=values['request_key']).first()
        if old:
            if old.merge_id != merge.pk or old.reason != values['reason']:
                raise Conflict('请求标识已用于不同撤销，请使用新标识')
            return old.merge
        if FactorMergeWithdrawal.objects.filter(merge=merge).exists():
            raise Conflict('这份合并已经撤销，请刷新查看历史')
        value = withdrawal_hash(str(collection.pk), merge.pk, merge.content_hash, values['reason'])
        FactorMergeWithdrawal.objects.create(id=digest(['factor-merge-withdrawal-v1', str(collection.pk), values['request_key']])[:40],
            anthology=collection, merge=merge, request_key=values['request_key'], reason=values['reason'], content_hash=value)
        for candidate in (merge.comparison.left, merge.comparison.right):
            touch(candidate.report.entry)
        return merge


def merge_data(record: FactorMerge) -> dict:
    try:
        withdrawal = record.withdrawal
    except FactorMergeWithdrawal.DoesNotExist:
        withdrawal = None
    return {'id': record.pk, 'comparison_id': record.comparison_id, 'left_id': record.comparison.left_id,
        'right_id': record.comparison.right_id, 'name': record.name, 'reason': record.reason,
        'created_at': record.created_at.isoformat(), 'content_hash': record.content_hash, 'active': withdrawal is None,
        'curation_json': json.dumps(record.curation, ensure_ascii=False, allow_nan=False),
        'withdrawal': {'id': withdrawal.pk, 'reason': withdrawal.reason, 'created_at': withdrawal.created_at.isoformat()} if withdrawal else None}
