"""Isolated facts, scoring, HTTP ownership, concurrency and snapshot regressions."""
import json
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core import serializers
from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from anthology.models import Anthology
from system_settings.models import AIModel, AIProvider
from utils.sync_manager import SyncError, SyncManager
from .execution import run_request
from .generation import point_id, validate_exercise
from .grading import combine, objective_items, validate_quality
from .models import Attempt, Course, DeviceJob, Exercise, Grade, KnowledgePoint, Plan, Request, Runtime, GoalProposal, GoalJob
from .presentation import course_data, exercise_data
from .progress import knowledge_state
from .services import Conflict, assist, end_exercise, new_attempt, queue_chat, reserve_exercise, save_draft, submit
from .sync import metadata, reset_execution, validate
from .time_utils import aware
from .worker import claim_next, expire_jobs, schedule_tick


def setup_course():
    provider = AIProvider.objects.create(name='Test', base_url='https://example.test', api_key='unused')
    model = AIModel.objects.create(provider=provider, name='test', type='chat')
    anthology = Anthology.objects.create(title='英语学习', type='learning', permission='private', user_id='admin')
    return Course.objects.create(anthology=anthology, goal='旅行与工作', scenarios=['work', 'travel'], model=model)


def questions(course, count=5, kind='choice'):
    pid = point_id(course.pk, '礼貌请求')
    KnowledgePoint.objects.get_or_create(id=pid, defaults={'course': course, 'name': '礼貌请求'})
    return [{'id': f'q{i+1}', 'type': kind, 'prompt': f'第{i+1}题：在咖啡店礼貌点单', 'options': ['A', 'B'] if kind == 'choice' else [], 'knowledge_id': pid,
             'knowledge_name': '礼貌请求', 'reference_answer': 'A' if kind == 'choice' else "I'd like coffee, please.", 'accepted_answers': ['coffee'],
             'explanation': '礼貌请求的用法', 'rubric': '允许合理表达', 'weights': [40, 30, 30], 'review': False} for i in range(count)]


def ready(course, kind='practice'):
    return Exercise.objects.create(course=course, kind=kind, status='ready', questions=questions(course), snapshot={'question_count': 5, 'review_points': []})


def complete_attempt(ex, when=None, assisted=False, score=100):
    attempt = Attempt.objects.create(exercise=ex, answers={q['id']: 'A' for q in ex.questions}, status='completed', submitted_at=when or timezone.now(), assisted=[q['id'] for q in ex.questions] if assisted else [])
    Grade.objects.create(attempt=attempt, result=combine([{'question_id': q['id'], 'score': score, 'skipped': False, 'feedback': '反馈', 'dimensions': [], 'natural_expression': 'A'} for q in ex.questions], ex.questions))
    ex.status = 'completed'
    ex.save()
    return attempt


class LearningTests(TestCase):
    def setUp(self):
        self.course = setup_course()
        self.user = get_user_model().objects.create_superuser(username='admin', password='test', email='admin@test.local')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def run_queued(self, req):
        claim = claim_next()
        self.assertEqual(claim[0], req.id)
        run_request(*claim)
        req.refresh_from_db()
        return req

    def test_default_limits_initial_idempotence_and_failure_release(self):
        req, created = reserve_exercise(self.course, 'key-12345')
        self.assertTrue(created)
        same, created = reserve_exercise(self.course, 'key-12345')
        self.assertEqual(req.id, same.id)
        self.assertFalse(created)
        self.assertIsNone(reserve_exercise(self.course, 'key-67890')[0])
        self.assertEqual(Exercise.objects.get(pk=req.target_id).snapshot['question_count'], 5)
        with patch('learning.execution.ask', side_effect=RuntimeError('provider failure')):
            self.run_queued(req)
        self.assertEqual(req.status, 'failed')
        self.assertEqual(course_data(self.course)['pending_count'], 0)
        self.assertTrue(reserve_exercise(self.course, 'key-new12')[1])

    def test_initial_generation_and_answer_hiding(self):
        req, _ = reserve_exercise(self.course, 'gen-12345')
        payload = {'title': '咖啡店', 'introduction': '礼貌表达', 'questions': [{**q, 'knowledge_id': ''} for q in questions(self.course)]}
        with patch('learning.execution.ask', return_value=payload):
            self.run_queued(req)
        ex = Exercise.objects.get(pk=req.target_id)
        self.assertEqual(ex.status, 'ready')
        data = exercise_data(ex)
        self.assertNotIn('reference_answer', data['questions'][0])
        self.assertNotIn('rubric', data['questions'][0])
        self.assertNotIn('snapshot', data)

    def test_draft_revision_submit_immutable_and_skips(self):
        ex = ready(self.course)
        a = new_attempt(ex)
        save_draft(a, 0, {'q1': 'A'})
        with self.assertRaises(Conflict):
            save_draft(a, 0, {'q1': 'B'})
        with self.assertRaises(Conflict):
            submit(a, 'submit123')
        req = submit(a, 'submit123', confirm_skips=True)
        self.assertEqual(submit(a, 'submit123', confirm_skips=True).id, req.id)
        with self.assertRaises(Conflict):
            save_draft(a, 1, {'q1': 'B'})
        self.run_queued(req)
        a.refresh_from_db()
        self.assertEqual(a.status, 'completed')
        result = Grade.objects.get(attempt=a).result
        self.assertEqual(result['score'], 100)
        self.assertEqual(result['completion'], 20)
        self.assertEqual(len(knowledge_state(self.course)[0]['evidence']), 1)

    def test_assistance_does_not_advance_mastery(self):
        ex = ready(self.course)
        a = new_attempt(ex)
        assist(a, 'q1')
        a.refresh_from_db()
        save_draft(a, a.revision, {q['id']: 'A' for q in ex.questions})
        req = submit(a, 'submit321')
        self.run_queued(req)
        p = knowledge_state(self.course)[0]
        self.assertTrue(p['evidence'][0]['assisted'])
        self.assertEqual(p['status'], '学习中')

    def test_quality_accepts_alternative_expression_and_rejects_inconsistent_score(self):
        qs = questions(self.course, 1, 'translation')
        item = {'question_id': 'q1', 'score': 100, 'feedback': '表达准确，参考句只是示例', 'natural_expression': "Could I have a coffee, please?", 'dimensions': [{'score': s, 'reason': '表达正确', 'verdict': 'correct'} for s in [40, 30, 30]]}
        self.assertEqual(validate_quality({'items': [item]}, qs)[0]['score'], 100)
        item['score'] = 20
        with self.assertRaises(ValidationError):
            validate_quality({'items': [item]}, qs)
        item['score'] = 100
        item['dimensions'][0]['verdict'] = 'incorrect'
        with self.assertRaises(ValidationError):
            validate_quality({'items': [item]}, qs)

    def test_fill_preserves_punctuation_and_casefold(self):
        ex = ready(self.course)
        ex.questions[0]['type'], ex.questions[0]['accepted_answers'] = 'fill', ['Coffee']
        ex.save()
        a = Attempt.objects.create(exercise=ex, answers={'q1': ' coffee '})
        self.assertEqual(objective_items(a)[0][0]['score'], 100)
        a.answers = {'q1': 'coffee!'}
        self.assertEqual(objective_items(a)[0][0]['score'], 0)

    def test_failed_grade_not_zero_retry_and_review_history(self):
        ex = ready(self.course)
        ex.questions[0]['type'] = 'translation'
        ex.save()
        a = new_attempt(ex)
        save_draft(a, 0, {q['id']: 'A' for q in ex.questions})
        req = submit(a, 'grade123')
        with patch('learning.execution.ask', side_effect=RuntimeError('failure')):
            self.run_queued(req)
        self.assertFalse(Grade.objects.filter(attempt=a).exists())
        self.assertEqual(course_data(self.course)['pending_count'], 1)
        item = {'question_id': 'q1', 'score': 100, 'feedback': '正确', 'natural_expression': 'A', 'dimensions': [{'score': s, 'reason': '正确', 'verdict': 'correct'} for s in [40, 30, 30]]}
        retry = submit(a, 'retry123', retry=True)
        with patch('learning.execution.ask', return_value={'items': [item]}):
            self.run_queued(retry)
        review = submit(a, 'review12', review=True)
        with patch('learning.execution.ask', return_value={'items': [item]}):
            self.run_queued(review)
        self.assertEqual(Grade.objects.filter(attempt=a).count(), 2)
        self.assertEqual(len(knowledge_state(self.course)[0]['evidence']), 1)
        with self.assertRaises(Conflict):
            submit(a, 'review34', review=True)

    def test_initial_plan_required_then_confirmed(self):
        initial = ready(self.course, 'initial')
        complete_attempt(initial)
        with self.assertRaises(Conflict):
            reserve_exercise(self.course, 'next1234')
        plan = Plan.objects.create(course=self.course, stages=[{'title': str(i), 'focus': '重点'} for i in range(3)])
        response = self.client.post(f'/api/learning/{self.course.pk}/plan/', {'planId': plan.id, 'stages': plan.stages, 'stage': 0}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(reserve_exercise(self.course, 'next1234')[1])

    def test_review_intervals_and_mastery_require_distinct_days_and_due_review(self):
        now = timezone.now()
        for day in (0, 2, 6):
            ex = ready(self.course)
            ex.questions[0]['review'] = day > 0
            ex.save()
            complete_attempt(ex, now - timedelta(days=7-day))
        point = knowledge_state(self.course, now=now)[0]
        self.assertEqual(point['status'], '初步掌握')
        self.assertEqual(len(point['evidence']), 3)
        self.assertEqual(knowledge_state(self.course, now=now + timedelta(days=8))[0]['status'], '需复习')
        self.assertEqual(knowledge_state(self.course)[0]['last_score'], 100)

    def test_long_absence_generates_single_recap_and_review_quota(self):
        ex = ready(self.course, 'initial')
        complete_attempt(ex, timezone.now() - timedelta(days=15))
        Plan.objects.create(course=self.course, stages=[{'title': '1', 'focus': '重点'}]*3, confirmed=True)
        req, _ = reserve_exercise(self.course, 'recap123')
        generated = Exercise.objects.get(pk=req.target_id)
        self.assertEqual(generated.kind, 'recap')
        self.assertEqual(generated.snapshot['question_count'], 3)
        self.assertIsNone(reserve_exercise(self.course, 'recap456')[0])
        self.assertEqual(len(generated.snapshot['review_points']), 1)

    def test_end_cancels_requests_and_keeps_answers(self):
        ex = ready(self.course)
        a = new_attempt(ex)
        save_draft(a, 0, {'q1': 'A'})
        req = submit(a, 'end12345', confirm_skips=True)
        end_exercise(ex)
        req.refresh_from_db(); a.refresh_from_db()
        self.assertEqual(req.status, 'cancelled')
        self.assertEqual(a.answers, {'q1': 'A'})
        self.assertEqual(course_data(self.course)['pending_count'], 0)

    def test_chat_records_assistance_and_cannot_change_scores(self):
        ex = ready(self.course)
        a = new_attempt(ex)
        req = queue_chat(self.course, '提示一下', 'chat1234', a, 'q1')
        a.refresh_from_db()
        self.assertIn('q1', a.assisted)
        with patch('learning.execution.ask', return_value={'reply': '先考虑礼貌请求'}):
            self.run_queued(req)
        self.assertFalse(Grade.objects.exists())
        self.assertEqual(course_data(self.course)['messages'][-1]['content'], '先考虑礼貌请求')

    def test_owner_private_and_no_world_involvement(self):
        other = get_user_model().objects.create_user(username='other', password='test')
        self.client.force_authenticate(other)
        response = self.client.get(f'/api/learning/{self.course.pk}/')
        self.assertEqual(response.status_code, 404)
        self.client.force_authenticate(None)
        self.assertNotEqual(self.client.get(f'/api/learning/{self.course.pk}/').status_code, 200)
        self.assertNotIn(self.course.pk, [v['coll_id'] for v in self.client.get('/api/anthology/list').data.get('data', [])] if self.client.get('/api/anthology/list').status_code == 200 else [])
        self.client.force_authenticate(self.user)
        response = self.client.put(f'/api/anthology/update/{self.course.pk}', {'permission': 'public'}, format='json')
        self.course.anthology.refresh_from_db()
        self.assertEqual(self.course.anthology.permission, 'private')

    def test_model_missing_explicit_failure(self):
        self.course.model.delete()
        self.course.refresh_from_db()
        with self.assertRaises(ValidationError):
            reserve_exercise(self.course, 'nomodel1')
        self.assertFalse(Exercise.objects.exists())

    def test_generation_rejects_missing_answer_and_wrong_count(self):
        ex = ready(self.course)
        payload = {'title': '题目', 'introduction': '说明', 'questions': questions(self.course)}
        payload['questions'][0]['reference_answer'] = ''
        with self.assertRaises(ValidationError):
            validate_exercise(payload, ex)
        payload['questions'] = []
        with self.assertRaises(ValidationError):
            validate_exercise(payload, ex)

    def test_schedule_no_catchup_and_daily_idempotence(self):
        now = timezone.now().replace(second=30, microsecond=0)
        self.course.timezone = 'UTC'; self.course.schedule_time = aware(now).astimezone(__import__('zoneinfo').ZoneInfo('UTC')).strftime('%H:%M'); self.course.save()
        rt = Runtime.objects.create(course=self.course, enabled=True, enabled_at=now-timedelta(days=1))
        schedule_tick(now); schedule_tick(now)
        self.assertEqual(Request.objects.count(), 1)
        end_exercise(Exercise.objects.first())
        schedule_tick(now + timedelta(hours=2))
        self.assertEqual(Request.objects.count(), 1)
        rt.enabled_at = now + timedelta(seconds=1); rt.save()
        schedule_tick(now + timedelta(days=1, hours=2))
        self.assertEqual(Request.objects.count(), 1)

    def snapshot(self):
        labels = [Anthology, Course, KnowledgePoint, Exercise, Attempt, Grade, Plan, Request]
        return sum([json.loads(serializers.serialize('json', m.objects.all())) for m in labels], [])

    def test_sync_complete_missing_duplicate_old_and_local_permissions(self):
        ex = ready(self.course)
        complete_attempt(ex)
        data = self.snapshot()
        validate(data, metadata())
        validate(data, metadata())
        before = knowledge_state(self.course)
        self.assertEqual(before, knowledge_state(self.course))
        with self.assertRaises(SyncError):
            validate([r for r in data if r['model'] != 'learning.grade'], metadata())
        broken = json.loads(json.dumps(data))
        next(r for r in broken if r['model'] == 'learning.exercise')['fields']['questions'][0].pop('reference_answer')
        with self.assertRaises(SyncError):
            validate(broken)
        validate([], {})
        self.assertNotIn(Runtime, list(SyncManager()._iter_target_models()))
        self.assertNotIn(DeviceJob, list(SyncManager()._iter_target_models()))

    def test_restored_requests_never_replay(self):
        req, _ = reserve_exercise(self.course, 'restore1')
        Runtime.objects.create(course=self.course, enabled=True)
        reset_execution()
        self.assertIsNone(claim_next())
        self.assertFalse(Runtime.objects.get(course=self.course).enabled)
        req.refresh_from_db()
        self.assertEqual(req.status, 'failed')

    def test_worker_expired_request_preserves_facts(self):
        req, _ = reserve_exercise(self.course, 'expire12')
        claim_next()
        rt = Runtime.objects.get(course=self.course)
        rt.claimed_at = timezone.now() - timedelta(minutes=6); rt.save()
        expire_jobs()
        req.refresh_from_db()
        self.assertEqual(req.status, 'failed')
        self.assertEqual(course_data(self.course)['pending_count'], 0)

    def test_settings_validation_api_and_camel_contract(self):
        data = {'goal': '学习英语', 'subject': 'english', 'scenarios': ['grammar'], 'level': '基础', 'minutes': 10, 'questionCount': 5, 'pendingLimit': 2, 'teacherName': '老师', 'modelId': self.course.model_id, 'style': '耐心', 'scheduleTime': '09:00', 'timezone': 'Asia/Shanghai', 'autoEnabled': False}
        url = f'/api/learning/{self.course.pk}/'
        proposal = GoalProposal.objects.create(id='settings-test', anthology=self.course.anthology, snapshot={'selected': ['grammar'], 'supplement': ''}, result={'goal': data['goal'], 'scenarios': data['scenarios'], 'note': '初测后确认计划'}, status='ready')
        data['goalProposalId'] = proposal.id
        self.assertEqual(self.client.put(url, data, format='json').status_code, 200)
        for field, value in [('questionCount', 2), ('pendingLimit', 6), ('timezone', 'invalid'), ('subject', 'programming')]:
            response = self.client.put(url, {**data, field: value}, format='json')
            self.assertEqual(response.status_code, 400)


class ConcurrentReservationTests(TransactionTestCase):
    def test_last_slot_across_threads(self):
        from concurrent.futures import ThreadPoolExecutor
        course = setup_course()
        complete_attempt(ready(course, 'initial'))
        Plan.objects.create(course=course, stages=[{'title': '阶段', 'focus': '重点'}]*3, confirmed=True)
        for limit in (1, 2, 5):
            course.pending_limit = limit; course.save()
            Exercise.objects.filter(course=course, status='generating').delete()
            def reserve(i):
                close_old_connections()
                try:
                    return reserve_exercise(Course.objects.get(pk=course.pk), f'concurrent-{limit}-{i}')[1]
                finally:
                    close_old_connections()
            with ThreadPoolExecutor(max_workers=6) as pool:
                results = list(pool.map(reserve, range(8)))
            self.assertEqual(sum(results), limit)
            self.assertEqual(Exercise.objects.filter(course=course, status='generating').count(), limit)

class AnswerContractTests(TestCase):
    setUp = LearningTests.setUp
    def test_question_identity_survives_camel_conversion(self):
        ex = ready(self.course)
        attempt = new_attempt(ex)
        url = f'/api/learning/{self.course.pk}/attempts/{attempt.id}/'
        response = self.client.put(url, {'revision': 0, 'answerItems': [{'questionId': 'q1', 'answer': 'A'}]}, format='json')
        self.assertEqual(response.status_code, 200)
        attempt.refresh_from_db()
        self.assertEqual(attempt.answers, {'q1': 'A'})
        data = json.loads(response.render().content)
        self.assertEqual(data['data']['answerItems'], [{'questionId': 'q1', 'answer': 'A'}])


class SnapshotRestoreTests(TestCase):
    setUp = LearningTests.setUp

    def test_real_snapshot_roundtrip_and_rejected_restore_atomicity(self):
        ex = ready(self.course)
        complete_attempt(ex)
        manager = SyncManager()
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        before = knowledge_state(self.course)
        manager.apply_snapshot_data(data, meta, full_overwrite=True)
        manager.apply_snapshot_data(data, meta, full_overwrite=True)
        self.assertEqual(before, knowledge_state(self.course))
        self.assertEqual(Grade.objects.count(), 1)
        broken = [r for r in data if r['model'] != 'learning.grade']
        with self.assertRaises(SyncError):
            manager.apply_snapshot_data(broken, meta, full_overwrite=True)
        self.assertEqual(Grade.objects.count(), 1)

class ExtendedLearningTests(TestCase):
    setUp = LearningTests.setUp
    run_queued = LearningTests.run_queued

    def test_anonymous_cannot_mutate_admin_learning_collection(self):
        self.client.force_authenticate(None)
        for method, path, payload in [('put', 'update', {'title': '被改名'}), ('delete', 'delete', {})]:
            response = getattr(self.client, method)(f'/api/anthology/{path}/{self.course.pk}', payload, format='json')
            self.assertNotEqual(response.status_code, 200)
        self.course.anthology.refresh_from_db()
        self.assertEqual(self.course.anthology.title, '英语学习')
        self.assertTrue(self.course.anthology.is_valid)

    def test_same_question_id_different_attempt_keys_cannot_alias(self):
        ex = ready(self.course)
        a = new_attempt(ex)
        save_draft(a, 0, {q['id']: 'A' for q in ex.questions})
        req = submit(a, 'same-key')
        self.run_queued(req)
        b = new_attempt(ex)
        save_draft(b, 0, {q['id']: 'B' for q in ex.questions})
        second = submit(b, 'same-key')
        self.assertNotEqual(req.id, second.id)
        self.assertEqual(second.target_id, b.id)

    def test_stage_milestone_enqueues_single_evaluation(self):
        Plan.objects.create(course=self.course, stages=[{'title': '阶段', 'focus': '重点'}]*3, confirmed=True)
        for _ in range(4): complete_attempt(ready(self.course))
        ex = ready(self.course)
        a = new_attempt(ex)
        save_draft(a, 0, {q['id']: 'A' for q in ex.questions})
        req = submit(a, 'stage-grade')
        self.run_queued(req)
        self.assertEqual(Request.objects.filter(kind='evaluate').count(), 1)
        self.assertTrue(course_data(self.course)['stage_evaluation_due'])

    def test_repractice_respects_pending_limit(self):
        completed = ready(self.course)
        complete_attempt(completed)
        self.course.pending_limit = 1; self.course.save()
        ready(self.course)
        completed.refresh_from_db()
        with self.assertRaises(Conflict):
            new_attempt(completed)

    def test_chat_prompt_has_no_unsubmitted_answer(self):
        ex = ready(self.course)
        ex.questions[0]['reference_answer'] = 'private-hidden-answer'; ex.save()
        a = new_attempt(ex)
        req = queue_chat(self.course, '帮我理解题意', 'context-help', a, 'q1')
        with patch('learning.execution.ask', return_value={'reply': '请先看场景'}) as model:
            self.run_queued(req)
        context = model.call_args.args[2]
        self.assertNotIn('private-hidden-answer', json.dumps(context))

    def test_goal_change_keeps_history_and_requires_plan_confirmation(self):
        plan = Plan.objects.create(course=self.course, stages=[{'title': '原重点', 'focus': '语法'}]*3, confirmed=True)
        from .serializers import CourseSerializer
        config = dict(CourseSerializer(self.course).data)
        config['goal'] = '工作邮件'
        proposal = GoalProposal.objects.create(id='goal-change-test', anthology=self.course.anthology, snapshot={'selected': ['email'], 'supplement': ''}, result={'goal': config['goal'], 'scenarios': config['scenarios'], 'note': '学习邮件'}, status='ready')
        config['goalProposalId'] = proposal.id
        response = self.client.put(f'/api/learning/{self.course.pk}/', config, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Plan.objects.filter(course=self.course).count(), 2)
        plan.refresh_from_db(); self.assertTrue(plan.confirmed)
        self.assertFalse(Plan.objects.filter(course=self.course).latest('created_at').confirmed)

    def test_medium_and_wrong_quality_ordering(self):
        qs = questions(self.course, 2, 'short')
        items=[]
        for q, scores in zip(qs, ([30, 15, 15], [0, 0, 0])):
            items.append({'question_id': q['id'], 'score': sum(scores), 'feedback': '依据表达评分', 'natural_expression': '参考表达', 'dimensions': [{'score': v, 'reason': '部分准确' if v else '未表达目标', 'verdict': 'partial' if v else 'incorrect'} for v in scores]})
        result=validate_quality({'items':items}, qs)
        self.assertEqual([v['score'] for v in result], [60, 0])

    def test_sync_rejects_modified_but_nonempty_answer(self):
        complete_attempt(ready(self.course))
        data = SyncManager().build_snapshot_data()
        meta = metadata(data)
        changed = json.loads(json.dumps(data))
        next(r for r in changed if r['model']=='learning.exercise')['fields']['questions'][0]['reference_answer']='changed answer'
        with self.assertRaises(SyncError): validate(changed, meta)


class AdaptiveAssessmentTests(TestCase):
    def setUp(self):
        self.course = setup_course()

    def test_optional_self_rating_only_reaches_initial_generation(self):
        from .serializers import CourseSerializer
        from .adaptation import learning_assessment
        self.assertEqual(self.course.level, '不确定')
        self.course.level = '基础'
        self.course.save()
        req, _ = reserve_exercise(self.course, 'initial-adaptive')
        self.assertEqual(req.snapshot['starting_level'], '基础')
        self.assertNotIn('level', req.snapshot)
        end_exercise(Exercise.objects.get(pk=req.target_id))
        complete_attempt(ready(self.course, 'initial'))
        Plan.objects.create(course=self.course, confirmed=True, stages=[{'title': '学习', 'focus': '应用'}] * 3)
        req, _ = reserve_exercise(self.course, 'practice-adaptive')
        self.assertNotIn('starting_level', req.snapshot)
        self.assertNotIn('level', req.snapshot)
        self.assertEqual(req.snapshot['assessment'], learning_assessment(self.course))
        data = dict(CourseSerializer(self.course).data)
        data.pop('level')
        serializer = CourseSerializer(data=data)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['level'], '不确定')
        self.course.refresh_from_db()
        self.assertEqual(self.course.level, '基础')

    def test_independent_transfer_assistance_failure_and_review_recompute(self):
        from .adaptation import learning_assessment
        now = timezone.now()
        first = ready(self.course)
        a = complete_attempt(first, when=now - timedelta(days=3))
        self.assertEqual(learning_assessment(self.course)['points'][0]['guidance'], '保持练习')
        complete_attempt(first, when=now - timedelta(days=2))
        self.assertEqual(learning_assessment(self.course)['points'][0]['guidance'], '保持练习')
        second = ready(self.course)
        b = complete_attempt(second, when=now - timedelta(days=1))
        assessment = learning_assessment(self.course)
        self.assertEqual(assessment['status'], '持续评估中')
        self.assertEqual(assessment['points'][0]['guidance'], '提升挑战')
        # Effective review replaces the original evidence instead of accumulating it.
        revised = combine([{'question_id': q['id'], 'score': 50, 'skipped': False, 'feedback': '复核', 'dimensions': [], 'natural_expression': ''} for q in second.questions], second.questions)
        Grade.objects.create(attempt=b, version=2, result=revised)
        self.assertEqual(learning_assessment(self.course)['points'][0]['guidance'], '巩固基础')
        self.assertEqual(len(learning_assessment(self.course)['points'][0]['recent_evidence']), 2)
        third = ready(self.course)
        complete_attempt(third, assisted=True)
        self.assertEqual(learning_assessment(self.course)['points'][0]['guidance'], '巩固基础')
        # Aging alone changes due status, not the challenge recommendation.
        current = knowledge_state(self.course)
        aged = knowledge_state(self.course, now=now + timedelta(days=100))
        self.assertEqual(learning_assessment(self.course, current)['points'][0]['guidance'], learning_assessment(self.course, aged)['points'][0]['guidance'])
        self.assertEqual(course_data(self.course)['assessment'], learning_assessment(self.course))

    def test_generation_prompt_uses_frozen_dynamic_evidence(self):
        from .execution import generate
        initial = ready(self.course, 'initial')
        complete_attempt(initial)
        Plan.objects.create(course=self.course, confirmed=True, stages=[{'title': '学习', 'focus': '应用'}] * 3)
        complete_attempt(ready(self.course))
        req, _ = reserve_exercise(self.course, 'snapshot-adaptive')
        original = json.loads(json.dumps(req.snapshot))
        complete_attempt(ready(self.course), score=20)
        payload = {'title': '咖啡店', 'introduction': '礼貌表达', 'questions': questions(self.course)}
        with patch('learning.execution.ask', return_value=payload) as ask:
            generate(req)
        self.assertEqual(ask.call_args.args[2], original)
        self.assertIn('assessment', ask.call_args.args[1])
        self.assertEqual(original['assessment']['points'][0]['guidance'], '提升挑战')


class GoalSetupTests(TestCase):
    setUp = LearningTests.setUp

    def goal_input(self, **changes):
        return {'selected': ['email', 'dining'], 'supplement': '', 'modelId': self.course.model_id, 'style': '耐心', 'requestKey': 'goal-preset-test', **changes}

    def prepare(self, **changes):
        response = self.client.post(f'/api/learning/{self.course.pk}/goals/', self.goal_input(**changes), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return GoalProposal.objects.get(pk=response.data['data']['id'])

    def test_presets_no_model_call_confirmed_goal_and_tamper_rejection(self):
        from .serializers import CourseSerializer
        with patch('learning.execution.ask') as ask:
            proposal = self.prepare()
        ask.assert_not_called()
        self.assertEqual(proposal.status, 'ready')
        self.assertEqual(proposal.result['scenarios'], ['work', 'travel'])
        self.assertIn('邮件', proposal.result['goal'])
        self.assertFalse(GoalJob.objects.exists())
        self.assertEqual(self.prepare().pk, proposal.pk)
        data = {**dict(CourseSerializer(self.course).data), **proposal.result}
        url = f'/api/learning/{self.course.pk}/'
        self.assertEqual(self.client.put(url, data, format='json').status_code, 400)
        data['goalProposalId'] = proposal.id
        self.assertEqual(self.client.put(url, {**data, 'goal': '随便乱填'}, format='json').status_code, 400)
        response = self.client.put(url, data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        proposal.refresh_from_db(); self.assertEqual(proposal.status, 'confirmed')
        self.assertIsNotNone(proposal.confirmed_at)
        self.course.refresh_from_db(); self.assertEqual(self.course.goal, proposal.result['goal'])
        data.pop('goalProposalId'); data['minutes'] = 15
        self.assertEqual(self.client.put(url, data, format='json').status_code, 200)

    def test_invalid_inputs_rejected_before_call_and_uncertain_supported(self):
        url = f'/api/learning/{self.course.pk}/goals/'
        for updates in ({'selected': []}, {'selected': ['unsure', 'email']}, {'selected': ['bad']}, {'supplement': '！！！'}, {'supplement': '哈哈哈哈'}):
            response = self.client.post(url, self.goal_input(**updates), format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(GoalProposal.objects.exists())
        proposal = self.prepare(selected=['unsure'])
        self.assertIn('初测', proposal.result['goal'])

    def test_refinement_rejection_failure_retry_and_frozen_input(self):
        from .goals import claim_goal, run_goal
        original = self.course.goal
        proposal = self.prepare(supplement='一周达到母语水平，能与国外同事讨论项目')
        self.assertEqual(proposal.status, 'pending')
        response = self.client.get(f'/api/learning/{self.course.pk}/goals/', {'proposal_id': proposal.id})
        self.assertEqual(response.status_code, 200)
        result = {'valid': True, 'goal': '能用英语简要讨论项目进度', 'scenarios': ['work'], 'note': '一周达到母语水平不现实，建议先练项目沟通；点餐可以放在后续阶段。'}
        with patch('learning.execution.ask', return_value=result) as ask:
            run_goal(*claim_goal())
        self.assertIn('一周', ask.call_args.args[2]['supplement'])
        proposal.refresh_from_db(); self.assertEqual(proposal.status, 'ready')
        self.course.refresh_from_db(); self.assertEqual(self.course.goal, original)
        bad = self.prepare(supplement='帮我做饭', requestKey='goal-reject-test')
        with patch('learning.execution.ask', return_value={'valid': False}):
            run_goal(*claim_goal())
        bad.refresh_from_db(); self.assertEqual(bad.status, 'rejected')
        failed = self.prepare(supplement='我想提高英语', requestKey='goal-failed-test')
        with patch('learning.execution.ask', side_effect=RuntimeError('provider unavailable')):
            run_goal(*claim_goal())
        failed.refresh_from_db(); self.assertEqual(failed.status, 'failed')
        retry = self.prepare(supplement='我想提高英语', requestKey='goal-retry-test')
        self.assertNotEqual(retry.pk, failed.pk)
        self.assertFalse(Exercise.objects.exists())

    def test_ownership_restart_and_sync_roundtrip(self):
        from .goals import claim_goal, expire_goals
        anth = Anthology.objects.create(title='别人的学习', type='learning', permission='private', user_id='someone-else')
        self.assertEqual(self.client.post(f'/api/learning/{anth.pk}/goals/', self.goal_input(), format='json').status_code, 404)
        self.assertEqual(self.client.get(f'/api/learning/{anth.pk}/goals/').status_code, 404)
        proposal = self.prepare(supplement='读懂英文技术文档')
        claim_goal()
        GoalJob.objects.filter(proposal=proposal).update(claimed_at=timezone.now() - timedelta(minutes=6))
        expire_goals()
        proposal.refresh_from_db(); self.assertEqual(proposal.status, 'failed')
        proposal = self.prepare(supplement='读懂英文技术文档', requestKey='goal-sync-test')
        manager = SyncManager()
        self.assertNotIn(GoalJob, list(manager._iter_target_models()))
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        self.assertEqual(meta['learning_schema_version'], 3)
        missing = [row for row in data if row['model'] != 'learning.goalproposal']
        with self.assertRaises(SyncError): validate(missing, meta)
        broken = json.loads(json.dumps(data))
        next(row for row in broken if row['model'] == 'learning.goalproposal')['fields']['anthology'] = anth.pk
        # Different existing private anthology is valid history ownership; missing association is not.
        next(row for row in broken if row['model'] == 'learning.goalproposal')['fields']['anthology'] = 'missing'
        with self.assertRaises(SyncError): validate(broken)
        manager.apply_snapshot_data(data, meta, full_overwrite=True)
        manager.apply_snapshot_data(data, meta, full_overwrite=True)
        proposal.refresh_from_db(); self.assertEqual(proposal.status, 'failed')
        self.assertFalse(GoalJob.objects.exists())
        self.assertEqual(GoalProposal.objects.count(), 2)


    def test_goal_snapshot_version_and_confirmation_integrity(self):
        proposal = self.prepare()
        from .goals import confirm_goal
        confirm_goal(self.course.anthology, self.course, {'goal_proposal_id': proposal.id, **proposal.result})
        manager = SyncManager()
        base_meta = manager.build_snapshot_meta(data_list=manager.build_snapshot_data())
        for check in (manager.validate_remote_snapshot_version, manager.validate_import_snapshot_version):
            check({**base_meta, 'learning_schema_version': 1})
            check({**base_meta, 'learning_schema_version': 2})
            check({**base_meta, 'learning_schema_version': 3})
            with self.assertRaises(SyncError): check({**base_meta, 'learning_schema_version': 4})
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        broken = json.loads(json.dumps(data))
        next(row for row in broken if row['model'] == 'learning.goalproposal')['fields']['confirmed_at'] = None
        with self.assertRaises(SyncError): validate(broken)
        manager.apply_snapshot_data(data, meta, full_overwrite=True)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, 'confirmed')
        self.assertIsNotNone(proposal.confirmed_at)


    def test_subject_catalog_broad_travel_and_legacy_compatibility(self):
        response = self.client.get('/api/learning/catalog/')
        self.assertEqual(response.status_code, 200)
        subjects = response.data['data']['subjects']
        self.assertEqual([item['id'] for item in subjects], ['english'])
        self.assertEqual([item['id'] for item in subjects[0]['directions']], ['work', 'travel', 'foundation', 'unsure'])
        self.assertEqual(subjects[0]['legacy_directions']['dining'], 'travel')
        proposal = self.prepare(selected=['travel'], subject='english')
        for focus in ('点餐', '问路', '住宿', '购物'):
            self.assertIn(focus, proposal.result['goal'])
        self.assertEqual(proposal.result['scenarios'], ['travel'])
        self.assertEqual(proposal.snapshot['subject'], 'english')
        legacy = self.prepare(selected=['dining'], requestKey='legacy-dining-test')
        self.assertIn('点餐', legacy.result['goal'])
        self.assertNotIn('购物', legacy.result['goal'])
        response = self.client.post(f'/api/learning/{self.course.pk}/goals/', self.goal_input(subject='programming', selected=['travel']), format='json')
        self.assertEqual(response.status_code, 400)


class ReviewRegressionTests(TestCase):
    setUp = LearningTests.setUp

    def test_latest_unconfirmed_plan_blocks_manual_and_scheduled_generation(self):
        complete_attempt(ready(self.course, 'initial'))
        old = Plan.objects.create(course=self.course, confirmed=True, stages=[{'title': '旧计划', 'focus': '旧重点'}] * 3)
        new = Plan.objects.create(course=self.course, confirmed=False, stages=[{'title': '新计划', 'focus': '新重点'}] * 3)
        self.assertEqual(course_data(self.course)['plan']['id'], new.id)
        with self.assertRaises(Conflict):
            reserve_exercise(self.course, 'manual-new-plan')
        response = self.client.post(f'/api/learning/{self.course.pk}/generate/', {'requestKey': 'http-new-plan'}, format='json')
        self.assertEqual(response.status_code, 409)
        now = timezone.now().replace(second=30, microsecond=0)
        self.course.timezone = 'UTC'
        self.course.schedule_time = aware(now).astimezone(__import__('zoneinfo').ZoneInfo('UTC')).strftime('%H:%M')
        self.course.save()
        Runtime.objects.create(course=self.course, enabled=True, enabled_at=now - timedelta(days=1))
        with self.assertLogs('learning.worker', level='ERROR'):
            schedule_tick(now)
        self.assertFalse(Request.objects.exists())
        self.assertFalse(DeviceJob.objects.exists())
        self.assertFalse(Exercise.objects.filter(course=self.course, status='generating').exists())
        response = self.client.post(f'/api/learning/{self.course.pk}/plan/', {'planId': new.id, 'stages': new.stages, 'stage': 0}, format='json')
        self.assertEqual(response.status_code, 200)
        schedule_tick(now)
        req = Request.objects.get(kind='generate')
        self.assertEqual(req.snapshot['plan']['title'], '新计划')
        old.refresh_from_db()
        self.assertTrue(old.confirmed)

    def test_repractice_latest_low_score_survives_later_new_exercise(self):
        from .adaptation import learning_assessment
        now = timezone.now()
        a, b, c = ready(self.course), ready(self.course), ready(self.course)
        complete_attempt(a, when=now - timedelta(days=4))
        complete_attempt(b, when=now - timedelta(days=3))
        low = complete_attempt(a, when=now - timedelta(days=2), score=20)
        complete_attempt(c, when=now - timedelta(days=1))
        point = learning_assessment(self.course)['points'][0]
        self.assertEqual([e['exercise_id'] for e in point['recent_evidence']], [b.id, a.id, c.id])
        self.assertEqual([e['score'] for e in point['recent_evidence']], [100, 20, 100])
        self.assertEqual(point['recent_evidence'][1]['attempt_id'], low.id)
        self.assertEqual(point['guidance'], '保持练习')

    def test_repractice_moves_exercise_into_recent_window_without_double_count(self):
        from .adaptation import learning_assessment
        now = timezone.now()
        exercises = [ready(self.course) for _ in range(4)]
        for index, ex in enumerate(exercises):
            complete_attempt(ex, when=now - timedelta(days=5 - index))
        latest = complete_attempt(exercises[0], when=now - timedelta(days=1), assisted=True)
        point = learning_assessment(self.course)['points'][0]
        self.assertEqual([e['exercise_id'] for e in point['recent_evidence']], [exercises[2].id, exercises[3].id, exercises[0].id])
        self.assertEqual(point['recent_evidence'][-1]['attempt_id'], latest.id)
        self.assertTrue(point['recent_evidence'][-1]['assisted'])
        self.assertEqual(point['guidance'], '巩固基础')
        self.assertEqual(learning_assessment(self.course)['evidence_count'], 3)
