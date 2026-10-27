"""Fixed-sample output association; neither equivalence nor financial validity."""
import time
import math
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from quant.locking import collection_lock
from quant.models import FactorComparison, FactorRelation
from quant.research.contracts import digest
from quant.comparisons.contracts import validate_plan
from quant.comparisons.output_compare import guard, validate_policy, validate_timestamps
from quant.experiments.search import recipe
from quant.experiments.expression import calculate
from quant.label_studies.statistics import pearson, ranks

METHOD = 'fixed-output-association-1'
KIND = 'sample_correlation'
MINIMUM = 30
CLAIM = 'descriptive_aligned_outputs_not_equivalence_complementarity_or_profit'


def compute(plan: dict, snapshot: dict, *, deadline=None) -> dict:
    deadline = time.monotonic() + 15 if deadline is None else deadline
    validate_plan(plan)
    rows = snapshot['rows']; stamps = [row['timestamp'] for row in rows]
    validate_policy(plan['policy'], len(rows)); validate_timestamps(stamps, deadline=deadline)
    values = []
    for name in ('left', 'right'):
        side = plan[name]; candidate = side['candidate']
        recipe(candidate, side['bindings'], side['parameters'])
        inputs = {key: [row[column] for row in rows] for key, column in side['bindings'].items()}
        values.append(calculate(candidate['expression'], inputs, side['parameters'],
            expected=candidate['output_type'], deadline=deadline))
    return summarize(stamps, *values, plan['policy']['warmup_bars'],
        [plan[side]['candidate']['output_type'] for side in ('left', 'right')], deadline=deadline)


def summarize(stamps: list, left: list, right: list, warmup: int, output_types: list, *, deadline=None) -> dict:
    deadline = time.monotonic() + 15 if deadline is None else deadline
    validate_timestamps(stamps, deadline=deadline)
    if type(warmup) is not int or not 0 <= warmup <= 2000 or len(stamps)-warmup < MINIMUM or len(output_types) != 2:
        raise ValidationError('统计预热、样本数或输出类型无效')
    for values, kind in zip((left, right), output_types):
        if not isinstance(values, list) or len(values) != len(stamps) or kind not in ('numeric_series', 'boolean_series'):
            raise ValidationError('统计输出长度或类型不一致')
        for index, value in enumerate(values):
            if index % 128 == 0: guard(deadline=deadline)
            if value is not None and (type(value) is not bool if kind == 'boolean_series' else type(value) not in (int,float) or not math.isfinite(value)):
                raise ValidationError('统计输出值类型或有限性无效')
    counts = {'total_rows': len(stamps), 'warmup_rows': warmup, 'compared_rows': len(stamps)-warmup,
        'common_valid': 0, 'left_missing': 0, 'right_missing': 0, 'both_missing': 0}
    paired = [[], []]; indices = []
    for index in range(warmup, len(stamps)):
        if index % 128 == 0: guard(deadline=deadline)
        a, b = left[index], right[index]
        counts['left_missing'] += int(a is None); counts['right_missing'] += int(b is None)
        counts['both_missing'] += int(a is None and b is None)
        if a is not None and b is not None:
            # Boolean observations explicitly use 0/1; no implicit truth coercion.
            paired[0].append(float(a)); paired[1].append(float(b)); indices.append(index)
    counts['common_valid'] = len(indices)
    linear = ranked = None; status = 'insufficient'; reason = 'fewer_than_30_common_rows'
    if len(indices) >= MINIMUM:
        linear = pearson(*paired); ranked = pearson(*[ranks(items) for items in paired])
        status = 'completed' if linear is not None and ranked is not None else 'undefined'
        reason = '' if status == 'completed' else 'constant_or_near_constant_output'
    guard(deadline=deadline)
    return {'version': 1, 'method': METHOD, 'claim': CLAIM, 'status': status, 'reason': reason,
        'counts': counts, 'coverage': len(indices)/(len(stamps)-warmup),
        'pearson': round(linear, 12) if linear is not None else None,
        'spearman': round(ranked, 12) if ranked is not None else None,
        'output_types': output_types,
        'start': stamps[warmup], 'end': stamps[-1],
        'paired_start': stamps[indices[0]] if indices else None, 'paired_end': stamps[indices[-1]] if indices else None,
        'paired_indices_hash': digest(indices),
        'output_hashes': {side: digest(list(zip(stamps, value))) for side, value in zip(('left', 'right'), (left, right))},
        'minimum_common_rows': MINIMUM, 'inference': 'no_p_value_or_independent_sample_size',
        'alignment': 'same_row_and_timestamp_no_shift_pairwise_common_finite_after_explicit_warmup'}


def evidence(comparison_id, comparison_hash, plan, statistics):
    return {'version': 1, 'method': METHOD, 'comparison_id': comparison_id, 'comparison_hash': comparison_hash,
        'dataset_id': plan['dataset_id'], 'dataset_hash': plan['dataset_hash'], 'statistics': statistics, 'claim': CLAIM}


def present(record):
    import json
    return {'id': record.pk, 'created_at': record.created_at.isoformat(), 'content_hash': record.content_hash,
        'evidence_json': json.dumps(record.evidence, ensure_ascii=False, allow_nan=False)}


def find(comparison):
    return FactorRelation.objects.filter(kind=KIND, evidence__comparison_id=comparison.pk).first()


def create(collection, comparison_id):
    from quant.comparisons.services import _available, _COMPUTATIONS, candidates
    from quant.services import Conflict
    owner = str(collection.user_id)
    with collection_lock(collection.pk), transaction.atomic():
        _available(collection, owner)
        comparison = get_object_or_404(FactorComparison.objects.select_related('dataset'),
            anthology=collection, pk=comparison_id)
        if candidates(collection).filter(pk__in=(comparison.left_id, comparison.right_id)).count() != 2:
            raise ValidationError('统计关系须关联当前文集两个有效候选')
        if comparison.result.get('evaluation_status') != 'completed':
            raise ValidationError('请先完成固定样本输出对照，再分析统计关系')
        old = find(comparison)
        if old: return old
    if not _COMPUTATIONS.acquire(blocking=False):
        raise Conflict('本机已有两份因子对照或统计正在计算，请稍后重试')
    try:
        try:
            statistics = compute(comparison.plan, comparison.dataset.snapshot)
        except TimeoutError as exc:
            raise ValidationError('统计分析超过15秒，未保存关系，可显式重试') from exc
    finally:
        _COMPUTATIONS.release()
    if statistics['output_hashes'] != comparison.result['output_hashes']:
        raise ValidationError('本次输出与原对照不一致，请使用兼容环境重新建立对照')
    value = evidence(comparison.pk, comparison.content_hash, comparison.plan, statistics)
    fingerprint = digest(value); left, right = sorted((comparison.left_id, comparison.right_id))
    with collection_lock(collection.pk), transaction.atomic():
        _available(collection, owner)
        current = FactorComparison.objects.filter(pk=comparison.pk, anthology=collection,
            content_hash=comparison.content_hash).first()
        if not current or candidates(collection).filter(pk__in=(left, right)).count() != 2:
            raise Conflict('计算期间对照或候选已改变，请刷新后重试')
        old = find(comparison)
        if old: return old
        return FactorRelation.objects.create(id=digest([METHOD, left, right, fingerprint])[:40],
            left_id=left, right_id=right, kind=KIND, evidence=value, content_hash=fingerprint)
