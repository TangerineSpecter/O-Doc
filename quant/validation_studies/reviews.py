"""One authorized follow-up AI report; restored facts never grant provider access."""
import logging
from django.db import transaction
from rest_framework.exceptions import ValidationError
from quant.locking import collection_lock
from quant.models import AIRun,ValidationResult,ValidationJob
from quant.research.contracts import digest
from quant.services import Conflict,ModelUnavailable
from quant.experiments.reviews import start_review

logger=logging.getLogger(__name__)


def start(result,request_key,model_id='',requirements=''):
    if result.data.get('status')!='completed': raise ValidationError('固定验证完成后才能生成解读')
    return start_review(result.request.plan.source_request.result,request_key=request_key,model_id=model_id,
        requirements=requirements,validation_result_id=result.pk)


def automatic(result_id,token):
    result=ValidationResult.objects.select_related('request__plan__anthology','request__plan__source_request__result').filter(pk=result_id).first()
    if not result or result.data['status']!='completed': return
    collection=result.request.plan.anthology
    with collection_lock(collection.pk),transaction.atomic():
        collection.refresh_from_db()
        if (not collection.is_valid or collection.type!='quant' or collection.permission!='private'
                or not ValidationJob.objects.filter(request=result.request,lease_token=token,status='completed',owner_id=collection.user_id).exists()
                or AIRun.objects.filter(validation_result=result).exists()): return
        try: start(result,digest(['automatic-fixed-validation-review',result.pk])[:40])
        except (ValidationError,Conflict,ModelUnavailable):
            logger.info('Fixed-validation review not queued result=%s',result.pk)
