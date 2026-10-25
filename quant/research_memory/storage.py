"""Freeze permission-filtered history when an explicit analysis task is requested."""
from django.utils import timezone
from django.conf import settings
from django.db.models import Count, Prefetch, Q
from itertools import islice
from rest_framework.exceptions import ValidationError
from quant.models import ExperimentResult, FactorCandidate, FactorComparison, FactorMerge, FactorMergeWithdrawal, SourceRevision
from .contract import SCAN_LIMIT, instant, select
from .evidence import experiment_record, feedback_record


def _reference(row) -> dict:
    return {'data': row.data, 'source_id': str(row.report.source_id), 'entry_id': str(row.report.entry_id),
            'collection_id': str(row.report.entry.anthology_id), 'created_at': row.created_at.isoformat(),
            'is_live': row.report.entry.is_valid}


class Reader:
    def __init__(self):
        self.references = {}
        self.targets = {}
        self.source_references = {}
        self.linked_experiments = {}
        self.experiment_records = {}

    def candidates(self, identities: list[str]) -> dict:
        missing = set(identities) - self.references.keys()
        for row in FactorCandidate.objects.filter(pk__in=missing).select_related('report__entry'):
            self.references[row.pk] = _reference(row)
        return {identity: self.references[identity] for identity in identities if identity in self.references}

    def experiment(self, result) -> dict:
        if result.pk in self.experiment_records:return self.experiment_records[result.pk]
        request = result.request
        refs = self.candidates([row['id'] for row in request.plan['seeds']])
        record = experiment_record(result.pk,
            {'request': request.pk, 'data': result.data, 'content_hash': result.content_hash, 'created_at': result.created_at.isoformat()},
            {'anthology': request.anthology_id, 'plan': request.plan, 'content_hash': request.content_hash},
            {'anthology': request.dataset.anthology_id, 'snapshot': request.dataset.snapshot, 'content_hash': request.dataset.content_hash},
            [{'ordinal': row.ordinal, 'attempt': row.attempt, 'content_hash': row.content_hash}
             for row in request.checkpoints.all()], refs)
        # Curation/deletion affects new discovery only; a frozen reference remains replayable.
        record['is_live'] = all(row['is_live'] for row in refs.values())
        self.experiment_records[result.pk]=record
        return record

    def feedback(self, source) -> dict:
        payload, entry = source.payload, source.material.entry
        target_id = payload['target_source_id']
        if target_id not in self.targets:
            self.targets[target_id] = SourceRevision.objects.select_related('material').filter(pk=target_id).first()
        target = self.targets[target_id]
        if target is None:
            raise ValidationError('历史反馈原始材料不存在')
        if target_id not in self.source_references:
            self.source_references[target_id] = {row.pk: _reference(row) for row in FactorCandidate.objects.filter(
                report__source_id=target_id).select_related('report__entry')}
        refs = self.source_references[target_id]
        linked = None
        if payload.get('experiment_result_id'):
            result_id = payload['experiment_result_id']
            if result_id not in self.linked_experiments:
                self.linked_experiments[result_id] = ExperimentResult.objects.filter(pk=result_id,
                    request__anthology_id=entry.anthology_id).select_related('request__dataset').prefetch_related('request__checkpoints').first()
            result = self.linked_experiments[result_id]
            if (result is None or result.request.anthology_id != entry.anthology_id
                    or instant(result.created_at.isoformat()) > instant(source.created_at.isoformat())):
                raise ValidationError('历史反馈关联实验不存在或时间无效')
            linked = self.experiment(result)
        return feedback_record(source.pk,
            {'payload': payload, 'content_hash': source.content_hash, 'created_at': source.created_at.isoformat(), 'entry_id': entry.pk},
            {'anthology': entry.anthology_id},
            {'payload': target.payload, 'content_hash': target.content_hash, 'entry_id': target.material.entry_id,
             'created_at': target.created_at.isoformat()}, refs,
            linked['seeds'] if linked else None, linked['market'] if linked else None)

    def comparison(self, comparison, cutoff: str) -> dict:
        from .comparisons import record
        refs = self.candidates([comparison.left_id, comparison.right_id])
        merges = []
        for row in comparison.memory_merges:
            value = {key: getattr(row, key) for key in ('id', 'name', 'reason', 'curation', 'content_hash')}
            value.update(anthology=str(row.anthology_id), comparison=row.comparison_id, created_at=row.created_at.isoformat())
            try:
                withdrawal = row.withdrawal
            except FactorMergeWithdrawal.DoesNotExist:
                withdrawal = None
            value['withdrawal'] = ({'id': withdrawal.pk, 'anthology': str(withdrawal.anthology_id), 'merge': withdrawal.merge_id,
                'reason': withdrawal.reason, 'content_hash': withdrawal.content_hash, 'created_at': withdrawal.created_at.isoformat()}
                if withdrawal else None)
            merges.append(value)
        value = record(comparison.pk, {'anthology': str(comparison.anthology_id), 'plan': comparison.plan,
            'result': comparison.result, 'content_hash': comparison.content_hash, 'created_at': comparison.created_at.isoformat()},
            {'anthology': str(comparison.dataset.anthology_id), 'snapshot': comparison.dataset.snapshot,
             'content_hash': comparison.dataset.content_hash}, refs, merges, cutoff=cutoff, merge_total=comparison.memory_merge_total)
        value['is_live'] = all(row['is_live'] for row in refs.values())
        return value


    def fixed_validation(self,result,cutoff):
        from .fixed_validations import record
        request=result.request;plan=request.plan;original=plan.source_request.result
        source=self.experiment(original)
        value=record(result.pk,{'request':request.pk,'data':result.data,'content_hash':result.content_hash,'created_at':result.created_at.isoformat()},
            {'plan':plan.pk,'data':request.data,'content_hash':request.content_hash,'created_at':request.created_at.isoformat()},
            {'anthology':plan.anthology_id,'source_request':plan.source_request_id,'data':plan.data,'content_hash':plan.content_hash,'created_at':plan.created_at.isoformat()},
            {'anthology':request.dataset.anthology_id,'snapshot':request.dataset.snapshot,'content_hash':request.dataset.content_hash},source,cutoff=cutoff)
        value['is_live']=all(self.references[s['id']]['is_live'] for s in value['seeds'])
        return value


def freeze(options: list[dict], collection_id: str, *, exclude_result_id: str | None = None,
           exclude_validation_id: str | None = None, before: str | None = None, source_id: str | None = None, version: int = 1) -> dict:
    cutoff = instant(before if before is not None else timezone.now().isoformat()).isoformat()
    query_cutoff = instant(cutoff) if settings.USE_TZ else timezone.make_naive(instant(cutoff), timezone.get_default_timezone())
    reader, scanned = Reader(), {'experiments': 0, 'feedback': 0}
    if version >= 2:
        scanned['comparisons'] = 0
    if version >= 3:
        scanned['fixed_validations'] = 0
    current_market = None
    if exclude_result_id:
        current = ExperimentResult.objects.filter(pk=exclude_result_id, request__anthology_id=collection_id).select_related('request__dataset').prefetch_related('request__checkpoints').first()
        if current is None:
            raise ValidationError('当前实验不属于研究文集')
        current_market = reader.experiment(current)['market']
    from .scanning import Budget
    budget=Budget(version>=3);batch_size=1 if version>=3 else 20
    def fixed_records():
        from quant.models import ValidationResult
        fixed=ValidationResult.objects.filter(request__plan__anthology_id=collection_id,created_at__lt=query_cutoff).exclude(pk=exclude_validation_id or '').select_related(
            'request__dataset','request__plan__source_request__dataset','request__plan__source_request__result').prefetch_related(
            'request__plan__source_request__checkpoints').order_by('-created_at','id')[:SCAN_LIMIT]
        for row in fixed.iterator(chunk_size=batch_size):
            if not budget.accept(row.data,row.request.data,row.request.plan.data,row.request.plan.source_request.result.data,row.request.plan.source_request.dataset.snapshot):return
            scanned['fixed_validations']+=1
            try:
                value=reader.fixed_validation(row,cutoff)
                if value['is_live']: yield value
            except (ValidationError,KeyError,TypeError,ValueError,RecursionError):
                continue
    # Iterate small ORM chunks; raw prices never enter the model-facing memory.
    def records():
        if version>=3:yield from fixed_records()
        if budget.exhausted:return
        experiments = ExperimentResult.objects.filter(request__anthology_id=collection_id, created_at__lt=query_cutoff)
        if exclude_result_id:
            experiments = experiments.exclude(pk=exclude_result_id)
        stream = experiments.select_related('request__dataset').prefetch_related('request__checkpoints').order_by('-created_at', 'id')[:SCAN_LIMIT].iterator(chunk_size=batch_size)
        while batch := list(islice(stream,batch_size)):
            identities = [seed['id'] for row in batch for seed in row.request.plan['seeds']]
            reader.candidates(identities)
            for row in batch:
                if not budget.accept(row.data,row.request.plan,row.request.dataset.snapshot):return
                scanned['experiments'] += 1
                try:
                    record = reader.experiment(row)
                    if record['is_live']:
                        yield record
                except (ValidationError, KeyError, TypeError, ValueError, RecursionError):
                    continue  # An invalid historical link cannot prevent analyzing current material.
        feedback = SourceRevision.objects.filter(material__entry__anthology_id=collection_id, material__entry__is_valid=True,
            payload__provenance='external_feedback', created_at__lt=query_cutoff)
        if source_id:
            feedback = feedback.exclude(pk=source_id)
        for row in feedback.select_related('material__entry').order_by('-created_at', 'id')[:SCAN_LIMIT].iterator(chunk_size=batch_size):
            if not budget.accept(row.payload):return
            scanned['feedback'] += 1
            try:
                yield reader.feedback(row)
            except (ValidationError, KeyError, TypeError, ValueError, RecursionError):
                continue
        if version >= 2:
            from .comparisons import MERGE_LIMIT
            merge_rows = FactorMerge.objects.filter(created_at__lt=query_cutoff).select_related('withdrawal').order_by('-created_at', '-id')[:MERGE_LIMIT]
            comparisons = FactorComparison.objects.filter(anthology_id=collection_id, created_at__lt=query_cutoff).select_related('dataset').annotate(
                memory_merge_total=Count('merges', filter=Q(merges__created_at__lt=query_cutoff))).prefetch_related(
                Prefetch('merges', queryset=merge_rows, to_attr='memory_merges')).order_by('-created_at', 'id')[:SCAN_LIMIT]
            stream = comparisons.iterator(chunk_size=batch_size)
            while batch := list(islice(stream,batch_size)):
                reader.candidates([identity for row in batch for identity in (row.left_id, row.right_id)])
                for row in batch:
                    if not budget.accept(row.plan,row.result,row.dataset.snapshot):return
                    scanned['comparisons'] += 1
                    try:
                        value = reader.comparison(row, cutoff)
                        if value['is_live']:
                            yield value
                    except (ValidationError, KeyError, TypeError, ValueError, RecursionError):
                        continue
    return select(records(), options, collection_id=collection_id, cutoff=cutoff, scanned=scanned,
                  current_market=current_market, exclude_result_id=exclude_result_id, exclude_source_id=source_id, exclude_validation_id=exclude_validation_id, version=version,scan_limits=budget.info if version>=3 else None)
