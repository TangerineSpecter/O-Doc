import copy
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant.models import AIStudy, AIStudyJob, FactorCandidate, ExternalResponse
from quant.research.contracts import digest
from quant.services import Conflict, model_config
from quant import queue_liveness
from .contracts import fingerprint

ACTIVE = ('pending', 'running')


def start(collection, data):
    existing = AIStudy.objects.filter(anthology=collection, request_key=data['request_key']).first()
    if existing:
        expected = copy.deepcopy(existing.plan)
        supplied = {key: value for key, value in data.items() if key != 'request_key'}
        if (any(expected.get(key) != value for key, value in supplied.items() if key != 'model_id')
                or supplied.get('model_id') and str(supplied['model_id']) != expected['model_id']):
            raise Conflict('请求标识已用于不同的AI研究')
        return existing
    candidates = {p.pk: p for p in FactorCandidate.objects.filter(pk__in=data['candidate_ids'], report__entry__anthology=collection,
        report__entry__is_valid=True).select_related('report')}
    if len(candidates) != len(data['candidate_ids']): raise ValidationError('父代不存在或不属于当前文集')
    evidence = list(ExternalResponse.objects.filter(pk__in=data['evidence_ids'], connector__anthology=collection))
    if len(evidence) != len(data['evidence_ids']): raise ValidationError('外部证据不属于当前文集')
    config = model_config(data['model_id'])
    plan = {key: value for key, value in data.items() if key != 'request_key'} | {'version': 1, 'model_id': str(config['model_id']),
        'seeds': [{'id': key, 'hash': candidates[key].content_hash, 'definition': copy.deepcopy(candidates[key].data)} for key in data['candidate_ids']],
        'evidence': [{'id': row.pk, 'hash': row.content_hash, 'normalized': row.data['normalized']} for row in evidence]}
    study = AIStudy.objects.create(anthology=collection, request_key=data['request_key'], plan=plan, content_hash=digest(plan))
    resume(study)
    return study


def recover(study):
    job = AIStudyJob.objects.filter(study=study).first()
    if job and job.status in ACTIVE and (not job.lease_until or job.lease_until <= timezone.now()) and not queue_liveness.alive(f'study:{job.pk}', job.lease_token):
        job.status, job.error = 'interrupted', '本机研究已中断，已保存的代次仍保留，可明确继续剩余预算'
        job.save(update_fields=['status', 'error', 'updated_at'])
    return job


def resume(study):
    from .worker import dispatch
    job = recover(study)
    if job and job.status in ACTIVE: return
    latest = study.generations.order_by('-number').first()
    if study.generations.count() >= study.plan['max_generations'] or latest and latest.data.get('result') and not latest.data['result']['continue']:
        raise ValidationError('研究已达到代数预算或AI已停止，请从候选发起新研究')
    if AIStudyJob.objects.filter(study__anthology=study.anthology, status__in=ACTIVE).count() >= 2:
        raise Conflict('最多同时执行两项AI研究')
    model_config(study.plan['model_id'])
    if job: job.delete()
    job = AIStudyJob.objects.create(study=study, owner_id=str(study.anthology.user_id), lease_until=timezone.now() + timedelta(minutes=3))
    transaction.on_commit(lambda: dispatch(job.pk))


def inputs(study):
    last = study.generations.filter(data__status='completed').order_by('-number').first()
    if last:
        selected = [r['candidate_id'] for r in last.data['result']['candidates'] if r['selected']]
        parents = [{'id': p.pk, 'hash': p.content_hash, 'definition': p.data} for p in FactorCandidate.objects.filter(pk__in=selected).order_by('id')]
    else: parents = copy.deepcopy(study.plan['seeds'])
    known = [fingerprint(seed['definition']) for seed in study.plan['seeds']]
    for generation in study.generations.all():
        known += [r['fingerprint'] for r in (generation.data.get('result') or {}).get('candidates', []) if r.get('fingerprint')]
    return {'parents': parents, 'known_fingerprints': known, 'previous_summary': last.data['result']['summary'] if last else '',
        'external_evidence': copy.deepcopy(study.plan['evidence']), 'empirical_status': 'unassessed'}


def presentation(study):
    job = recover(study)
    generations = list(study.generations.all())
    terminal = bool(generations and (len(generations) >= study.plan['max_generations'] or generations[-1].data.get('result') and not generations[-1].data['result']['continue']))
    return {'id': study.pk, 'name': study.plan['name'], 'user_report': study.user_report, 'plan_json': __import__('json').dumps(study.plan, ensure_ascii=False),
        'status': job.status if job else 'completed' if terminal else 'interrupted', 'error': job.error if job else '',
        'created_at': study.created_at.isoformat(), 'generations': [{'id': row.pk, 'number': row.number,
            'data_json': __import__('json').dumps(row.data, ensure_ascii=False), 'created_at': row.created_at.isoformat()} for row in generations]}
