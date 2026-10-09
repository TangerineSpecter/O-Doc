"""Validate the complete learning domain before deserializing any rows."""
from django.core import serializers
import json
from utils.sync_manager import SyncError
from system_settings.sync_state import canonical_hash


def manifest(data):
    return {label: sorted(str(row['pk']) for row in data if row.get('model') == label)
            for label in sorted({row['model'] for row in data if row.get('model', '').startswith('learning.')})}


def metadata(data=None):
    from django.apps import apps
    if data is None:
        data = []
        for model in apps.get_app_config('learning').get_models():
            if model._meta.model_name in ('runtime', 'devicejob', 'goaljob'):
                continue
            data += json.loads(serializers.serialize('json', model.objects.all()))
    return {'learning_schema_version': 3, 'learning_manifest': manifest(data),
            'learning_fact_hashes': {f"{r['model']}:{r['pk']}": canonical_hash(r['fields']) for r in data if r.get('model', '').startswith('learning.')}}


def validate(data, meta=None):
    if (meta or {}).get('learning_schema_version', 0) > 3:
        raise SyncError('学习快照版本高于本机，请升级后恢复')
    expected = (meta or {}).get('learning_manifest')
    if expected is not None and expected != manifest(data):
        raise SyncError('学习快照缺少业务记录，拒绝恢复')
    hashes = (meta or {}).get('learning_fact_hashes')
    if hashes is not None and hashes != {f"{r['model']}:{r['pk']}": canonical_hash(r['fields']) for r in data if r.get('model', '').startswith('learning.')}:
        raise SyncError('学习快照业务事实校验失败')
    rows = {}
    for row in data:
        label = row.get('model', '')
        if label.startswith('learning.'):
            if label in ('learning.runtime', 'learning.devicejob', 'learning.goaljob'):
                raise SyncError('学习快照包含本机执行授权，拒绝恢复')
            rows.setdefault(label, {})[str(row['pk'])] = row['fields']
    anthology = {str(row['pk']): row['fields'] for row in data if row.get('model') == 'anthology.anthology'}
    for anth in anthology.values():
        if anth.get('type') == 'learning' and anth.get('permission') != 'private':
            raise SyncError('学习文集不能公开')
    courses = rows.get('learning.course', {})
    for cid, config in courses.items():
        anth = anthology.get(cid)
        if not anth or anth.get('type') != 'learning' or anth.get('permission') != 'private':
            raise SyncError('学习文集归属或私密配置不完整')
        from .catalog import SUBJECTS
        if config.get('subject') not in SUBJECTS or not 1 <= config.get('pending_limit', 0) <= 5 or not 3 <= config.get('question_count', 0) <= 10:
            raise SyncError('学习配置无效')
    for label, entries in rows.items():
        for pk, fields in entries.items():
            course_id = str(fields.get('course', ''))
            if 'course' in fields and course_id not in courses:
                raise SyncError('学习记录缺少所属课程')
            if label == 'learning.goalproposal':
                if fields.get('status') not in ('pending', 'running', 'ready', 'rejected', 'failed', 'confirmed') or (fields.get('status') == 'confirmed' and not fields.get('confirmed_at')):
                    raise SyncError('学习目标提案状态或确认记录不完整')
                anth = anthology.get(str(fields.get('anthology')))
                if not anth or anth.get('type') != 'learning' or anth.get('permission') != 'private':
                    raise SyncError('学习目标提案缺少私密文集归属')
                from .catalog import SUBJECTS
                snap = fields.get('snapshot')
                if not isinstance(snap, dict) or not isinstance(snap.get('selected'), list) or len(snap['selected']) > 10 or snap.get('subject', 'english') not in SUBJECTS or any(v not in SUBJECTS[snap.get('subject', 'english')]['goals'] for v in snap['selected']) or not isinstance(snap.get('supplement'), str):
                    raise SyncError('学习目标提案输入不完整')
                if fields.get('status') in ('ready', 'confirmed'):
                    from .goals import validate_result
                    try:
                        validate_result({'valid': True, **fields.get('result', {})}, snap.get('subject', 'english'))
                    except Exception as exc:
                        raise SyncError('学习目标提案结果不完整') from exc
            if label == 'learning.plan':
                stages = fields.get('stages')
                if not isinstance(stages, list) or len(stages) != 3 or fields.get('stage') not in (0, 1, 2) or any(not isinstance(v, dict) or not v.get('title') or not v.get('focus') for v in stages):
                    raise SyncError('学习计划格式无效')
            if label == 'learning.request':
                target_label = {'generate': 'learning.exercise', 'grade': 'learning.attempt', 'review': 'learning.attempt', 'chat': 'learning.chatmessage'}.get(fields.get('kind'))
                target = rows.get(target_label, {}).get(str(fields.get('target_id'))) if target_label else None
                if target_label and not target:
                    raise SyncError('学习请求缺少关联事实')
                if target and target_label == 'learning.attempt':
                    target = rows.get('learning.exercise', {}).get(str(target.get('exercise')))
                if target and str(target.get('course')) != course_id:
                    raise SyncError('学习请求引用了其他课程')
            if label == 'learning.exercise':
                qs = fields.get('questions')
                if not isinstance(qs, list) or (fields.get('status') not in ('generating', 'failed', 'ended') and not qs):
                    raise SyncError('学习练习缺少题目')
                for q in qs:
                    point = rows.get('learning.knowledgepoint', {}).get(str(q.get('knowledge_id')))
                    if not point or str(point['course']) != course_id or not q.get('reference_answer') or not q.get('explanation') or not q.get('rubric'):
                        raise SyncError('学习练习缺少答案或知识点事实')
            if label == 'learning.attempt':
                ex = rows.get('learning.exercise', {}).get(str(fields.get('exercise')))
                if not ex or set(fields.get('answers', {})) - {q['id'] for q in ex['questions']}:
                    raise SyncError('学习作答缺少练习或包含未知题目')
                if fields.get('status') == 'completed' and not any(str(g.get('attempt')) == pk for g in rows.get('learning.grade', {}).values()):
                    raise SyncError('学习作答缺少评分事实')
            if label == 'learning.grade':
                attempt = rows.get('learning.attempt', {}).get(str(fields.get('attempt')))
                if not attempt:
                    raise SyncError('学习评分缺少作答')
                ex = rows['learning.exercise'][str(attempt['exercise'])]
                ids = [q['id'] for q in ex['questions']]
                items = fields.get('result', {}).get('items', [])
                if len(items) != len(ids) or {i.get('question_id') for i in items} != set(ids):
                    raise SyncError('学习评分不完整')
            if label == 'learning.chatmessage' and fields.get('attempt'):
                attempt = rows.get('learning.attempt', {}).get(str(fields['attempt']))
                if not attempt or str(rows['learning.exercise'][str(attempt['exercise'])]['course']) != course_id:
                    raise SyncError('学习聊天引用了其他课程作答')


def reset_execution():
    from .models import Attempt, DeviceJob, Exercise, Request, Runtime, GoalJob, GoalProposal
    DeviceJob.objects.all().delete()
    GoalJob.objects.all().delete()
    GoalProposal.objects.filter(status__in=['pending', 'running']).update(status='failed', error='同步恢复后未自动执行，请重新整理目标')
    for rt in Runtime.objects.all():
        rt.enabled, rt.owner, rt.claimed_at = False, '', None
        rt.save()
    for req in Request.objects.filter(status__in=['pending', 'running']):
        req.status, req.error = 'failed', '同步恢复后未自动执行，请手动重试'
        req.save(update_fields=['status', 'error', 'updated_at'])
        if req.kind == 'generate':
            ex = Exercise.objects.get(pk=req.target_id)
            ex.status = 'failed'
            ex.save(update_fields=['status'])
        elif req.kind in ('grade', 'review'):
            attempt = Attempt.objects.get(pk=req.target_id)
            attempt.status = 'failed'
            attempt.save(update_fields=['status'])
            ex = attempt.exercise
            ex.status = 'failed_grading'
            ex.save(update_fields=['status'])
