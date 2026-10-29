"""A bounded model-only loop. Restoring saved generations never dispatches it."""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from django.conf import settings
from django.db import close_old_connections, transaction
from django.utils import timezone
from quant import queue_liveness
from quant.locking import collection_lock
from quant.models import AIStudyJob, AIStudyGeneration
from quant.research.contracts import digest
from quant.services import model_config
from utils.ai_observer import observe_ai
from utils.ai_service import AIService
from utils.bounded_completion import complete
from utils.token_usage import usage_scope
from .contracts import prompt, normalize
from .services import ACTIVE, inputs
from .publication import publish
from .review import review_prompt, validate_review
from .response_json import parse_generation

executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='quant-ai-study')


def dispatch(identity):
    if getattr(settings, 'QUANT_DISABLE_WORKERS', False): return
    job = AIStudyJob.objects.filter(pk=identity, status='pending').first()
    if not job: return
    lease = queue_liveness.claim(f'study:{job.pk}', job.lease_token)
    if not lease: return
    try: future = executor.submit(execute, identity)
    except Exception:
        lease.close()
        job.status, job.error = 'failed', '研究执行器不可用'
        job.save(update_fields=['status', 'error', 'updated_at'])
        return
    future.add_done_callback(lambda _future: lease.close())


def execute(identity):
    if not getattr(settings, 'QUANT_DISABLE_WORKERS', False): close_old_connections()
    job = AIStudyJob.objects.select_related('study__anthology').filter(pk=identity, status__in=ACTIVE).first()
    if not job: return
    study = job.study
    def check():
        current = AIStudyJob.objects.filter(pk=identity, lease_token=job.lease_token, status__in=ACTIVE,
            study__anthology__is_valid=True, study__anthology__permission='private', study__anthology__user_id=job.owner_id).first()
        if not current: raise InterruptedError('研究已停止或本机执行授权已失效')
    def progress(*_args):
        check()
        AIStudyJob.objects.filter(pk=identity).update(lease_until=timezone.now() + timedelta(minutes=3))
    try:
        config = model_config(study.plan['model_id'])
        while study.generations.count() < study.plan['max_generations']:
            check()
            number = study.generations.count() + 1
            with collection_lock(study.anthology_id), transaction.atomic():
                check(); frozen = inputs(study)
                job.status, job.lease_until = 'running', timezone.now() + timedelta(minutes=3)
                job.save(update_fields=['status', 'lease_until', 'updated_at'])
            raw = ''
            try:
                with usage_scope(owner_id=study.anthology.user_id, record=study, purpose='quant', phase=f'ai_study.generation_{number}'), observe_ai(progress, check):
                    raw = complete(config, prompt(study.plan, frozen, number), json_output=True, max_tokens=24000,
                        extra_body=AIService._thinking_options(config), deadline_seconds=120, allow_retries=False)
                check()
                payload, format_repair = parse_generation(raw, study.plan['version'])
                result = normalize(payload, {p['id']: p['definition'] for p in frozen['parents']},
                    study.plan['population'], study.plan['keep'], frozen['known_fingerprints'], study.plan['version'])
                data = {'version': 1, 'status': 'completed', 'input': frozen, 'raw_output': raw, 'result': result,
                    'model_id': study.plan['model_id'], 'error': ''}
                if study.plan['version'] >= 5: data['format_repair'] = format_repair
                if study.plan['version'] >= 4:
                    data.update(review_raw='', review=None, review_error='')
                    try:
                        with usage_scope(owner_id=study.anthology.user_id, record=study, purpose='quant', phase=f'ai_study.review_{number}'), observe_ai(progress, check):
                            review_raw = complete(config, review_prompt(study.plan, result, number), json_output=True,
                                max_tokens=12000, extra_body=AIService._thinking_options(config), deadline_seconds=120, allow_retries=False)
                        check()
                        data['review_raw'] = review_raw
                        review_text = re.sub(r'^```(?:json)?\s*', '', review_raw.strip()).removesuffix('```').strip()
                        if len(review_text) > 120000: raise ValueError('复核输出过长')
                        data['review'] = validate_review(json.loads(review_text), result)
                    except InterruptedError:
                        raise
                    except Exception:
                        data['review_error'] = 'AI复核未完成或未正确引用程序结果，保留AI原稿和程序核对。'
            except InterruptedError: raise
            except Exception as exc:
                message = ('模型输出不是完整有效的JSON，未发布候选；原稿已保留，可继续剩余预算或发起新研究。'
                    if isinstance(exc, json.JSONDecodeError) else
                    f'本代未发布：{type(exc).__name__}。原输出保留，可核对后明确继续剩余预算。')
                data = {'version': 1, 'status': 'failed', 'input': frozen, 'raw_output': raw, 'result': None,
                    'model_id': study.plan['model_id'], 'error': message}
            with collection_lock(study.anthology_id), transaction.atomic():
                check()
                generation = AIStudyGeneration.objects.create(id=digest(['ai-study-generation-1', study.pk, number])[:40],
                    study=study, number=number, data={}, content_hash='')
                if data['result']:
                    for row in data['result']['candidates']:
                        if row['selected']: row['candidate_id'] = publish(generation, row)
                generation.data, generation.content_hash = data, digest(data)
                generation.save(update_fields=['data', 'content_hash', 'updated_at'])
            if data['status'] == 'failed':
                job.status, job.error = 'failed', data['error']; break
            if not result['continue']:
                job.status, job.error = 'completed', result['stop_reason'] or '没有继续研究的候选'; break
        else: job.status, job.error = 'completed', '已达到设定代数预算'
        AIStudyJob.objects.filter(pk=identity, status__in=ACTIVE).update(status=job.status, error=job.error, lease_until=None)
    except InterruptedError:
        pass
    except Exception as exc:
        AIStudyJob.objects.filter(pk=identity, status__in=ACTIVE).update(status='failed', error=f'研究停止：{type(exc).__name__}，已保存代次保留', lease_until=None)
    finally:
        if not getattr(settings, 'QUANT_DISABLE_WORKERS', False): close_old_connections()
