"""Experiment reports reuse the existing bounded AI queue and revision history."""
import logging
from django.db import transaction
from rest_framework.exceptions import ValidationError
from quant.locking import collection_lock
from quant.models import AIRun, ExperimentResult, ExperimentJob, FactorCandidate
from quant.research.contracts import digest
from quant.services import queue, Conflict, ModelUnavailable
from .review_evidence import for_result

logger = logging.getLogger(__name__)


def review_source(result):
    """The first original parent hosts the report; all parents remain in evidence."""
    candidate = FactorCandidate.objects.select_related('report__source', 'report__entry').filter(
        pk=result.request.plan['seeds'][0]['id'], report__entry__anthology_id=result.request.anthology_id,
        report__entry__is_valid=True).first()
    if not candidate:
        raise ValidationError('实验原始研究已不可用，不能创建新的解读')
    return candidate.report.source


def start_review(result, *, request_key: str, model_id='', requirements='', validation_result_id=None):
    source = review_source(result)
    return queue(source.material.entry, {'kind': 'experiment_review', 'source_id': source.pk,
        'experiment_result_id': result.pk, 'validation_result_id': validation_result_id, 'request_key': request_key, 'model_id': model_id, 'requirements': requirements})


def auto_review(result_id: str, lease_token: str) -> None:
    """One best-effort automatic request. Restore and reads never call this."""
    result = ExperimentResult.objects.select_related('request__anthology').filter(pk=result_id).first()
    if result and hasattr(result.request, 'research_round'):
        return  # The bounded campaign owns its single recorded review call.
    if not result or result.data['status'] not in ('completed', 'partial'):
        return
    with collection_lock(result.request.anthology_id), transaction.atomic():
        collection = result.request.anthology
        collection.refresh_from_db()
        if not collection.is_valid or collection.type != 'quant' or collection.permission != 'private':
            return
        if not ExperimentJob.objects.filter(request=result.request, lease_token=lease_token,
                status__in=('completed', 'partial'), owner_id=collection.user_id).exists():
            return  # Restore removes local execution permission, including this deferred follow-up.
        if AIRun.objects.filter(experiment_result=result,validation_result__isnull=True).exists():
            return
        try:
            start_review(result, request_key=digest(['automatic-experiment-review', result.pk])[:40])
        except (ValidationError, Conflict, ModelUnavailable):
            # Calculation facts are already committed. Missing model/capacity can
            # be retried explicitly; they must not turn a successful experiment into failure.
            logger.info('Quant experiment review not queued result=%s', result.pk)


def validate_input(entry, values: dict, existing=None) -> dict:
    result = ExperimentResult.objects.select_related('request__dataset').filter(
        pk=values['experiment_result_id'], request__anthology=entry.anthology).first()
    if result is None or result.data['status'] not in ('completed', 'partial', 'failed', 'cancelled'):
        raise ValidationError('实验结果不存在或不属于当前文集')
    source = review_source(result)
    if source.material.entry_id != entry.pk or source.pk != values['source_id']:
        raise ValidationError('实验解读须关联原始父代的研究来源')
    validation_id = values.pop('validation_result_id',None)
    fixed = None
    if validation_id:
        from quant.models import ValidationResult
        fixed = ValidationResult.objects.select_related('request__plan').filter(pk=validation_id, request__plan__anthology=entry.anthology, request__plan__source_request=result.request).first()
        if fixed is None or fixed.data.get('status') != 'completed':
            raise ValidationError('固定验证解读须引用当前来源已完成的固定验证')
        values['validation_result_id'] = fixed.pk
    if existing and getattr(existing,'validation_result_id',None) != validation_id:
        raise Conflict('同一解读不能更换固定验证结果')
    version = existing.review_version if existing and existing.kind == 'experiment_review' else 10
    context = existing.planning_context if existing and existing.kind == 'experiment_review' else None
    if version in (3, 4, 5, 6, 7, 8, 9, 10) and context is None:
        from .library_retrieval import retrieve
        context = retrieve(result)
        if version in (6, 7, 8, 9, 10):
            from quant.research_memory import freeze
            context = {**context, 'version': 5 if version == 10 else 4 if version == 9 else 3 if version in (7, 8, 9, 10) else 2,
                'research_memory': freeze(context['options'], str(entry.anthology_id), exclude_result_id=result.pk,
                                         exclude_validation_id=fixed.pk if fixed else None, version=3 if version == 10 else 2 if version in (7, 8, 9, 10) else 1)}
        if fixed or version == 10:
            context['fixed_validation'] = {'result_id': fixed.pk, 'result_hash': fixed.content_hash} if fixed else None
        if version==10:
            from quant.search_diagnostics.services import reference
            ref=reference(result)
            if ref:context['selection_diagnostic']=ref
        # Drop only newly retrieved options if the complete evidence would exceed
        # the model input cap; never truncate original attempts or their failures.
        while True:
            try:
                for_result(result, version, context, fixed)
                break
            except ValidationError:
                memory = context.get('research_memory')
                if memory and memory['items']:
                    memory['items'].pop(); memory['omitted_for_size'] += 1
                    continue
                if not context['retrieved']:
                    raise
                context['retrieved'].pop(); context['options'].pop()
                context['omitted_for_size'] += 1
    else:
        for_result(result, version, context, fixed)
    values.update(source_version_id=None, target_language='', target_version='', review_version=version)
    if version in (3, 4, 5, 6, 7, 8, 9, 10):
        values['planning_context'] = context
    return values
