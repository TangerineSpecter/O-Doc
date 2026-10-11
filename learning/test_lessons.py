"""Lesson evidence, HTTP ownership, retries and complete snapshot integrity."""
import copy
import json
from datetime import timedelta
from unittest.mock import patch
from django.apps import apps
from django.core import serializers
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from anthology.models import Anthology
from system_settings.models import SyncEntityState
from utils.sync_manager import SyncError, SyncManager
from .tests import setup_course, questions, complete_attempt
from .models import Attempt, Exercise, LearningSession, LearningTurn, Grade, LearningItem, AnswerRevision, Request
from .lessons import validate_teaching
from .session_services import start_session, save_session_draft, advance_session, queue_turn, queue_revision
from .services import Conflict, end_exercise, reserve_exercise, submit
from .execution import run_request, generate
from .worker import claim_next, expire_jobs
from .presentation import exercise_data, course_data
from .items import save_item, items_data
from .skills import skill_states
from .sync import metadata, validate, reset_execution


def teaching(course):
    return validate_teaching({'task': '点餐并说明需求', 'role': '服务员', 'opening': 'What would you like?',
        'understanding': '顾客想要什么？', 'dialogue': [{'speaker': '顾客', 'text': 'I would like tea.', 'meaning': '我想要茶。'},
                                                     {'speaker': '服务员', 'text': 'Anything else?', 'meaning': '还要别的吗？'}],
        'expressions': [{'kind': 'frame', 'text': 'I would like …', 'meaning': '我想要……', 'example': 'I would like tea.',
                        'usage': '后面接想要的东西', 'knowledge_name': '礼貌请求'},
                       {'kind': 'word', 'text': 'water', 'meaning': '饮用水', 'example': 'Some water, please.',
                        'usage': '点餐时说明需要水', 'knowledge_name': '礼貌请求'}],
        'substitutions': [{'prompt': '改成要咖啡', 'frame': 'I would like …'}, {'prompt': '说明想要一杯水', 'frame': '关键词：water'}]}, course.pk)


def lesson(course):
    qs = questions(course, count=3, kind='short')
    for q in qs:
        q['weights'] = [60, 25, 15]
    qs[-1].update(type='choice', options=['A', 'B'], reference_answer='A')
    return Exercise.objects.create(course=course, format='scenario', status='ready', teaching=teaching(course), questions=qs,
                                   snapshot={'question_count': 3, 'review_points': [], 'learning_mode': 'scenario'})


def turn_result():
    return {'reply': 'Anything else?', 'feedback': '需求表达清楚，可以继续。', 'corrections': []}


class LessonTests(TestCase):
    def setUp(self):
        self.course = setup_course()
        self.course.anthology.title = '场景英语'
        self.course.anthology.save()
        self.course.learning_mode = 'scenario'
        self.course.question_count = 3
        self.course.save()
        self.user = get_user_model().objects.create_superuser(username='admin', password='test', email='admin@test.local')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.ex = lesson(self.course)

    def run_job(self, req, response=None):
        claim = claim_next()
        self.assertEqual(claim[0], req.id)
        with patch('learning.execution.ask', return_value=response or turn_result()):
            run_request(*claim)
        req.refresh_from_db()
        return req

    def session_at(self, phase):
        session = start_session(self.ex, 'session-start-key')
        session.phase = phase
        session.save(update_fields=['phase'])
        return session

    def snapshot(self):
        objects = list(Anthology.objects.all())
        for model in apps.get_app_config('learning').get_models():
            if model._meta.model_name not in ('runtime', 'devicejob', 'goaljob'):
                objects += list(model.objects.all())
        data = json.loads(serializers.serialize('json', objects))
        return data, metadata(data)

    def test_start_and_advance_idempotence_no_premature_attempt(self):
        session = start_session(self.ex, 'session-start-key')
        self.assertEqual(start_session(self.ex, 'session-start-key').pk, session.pk)
        self.assertEqual(start_session(self.ex, 'another-start-key').pk, session.pk)
        self.assertFalse(Attempt.objects.exists())
        self.assertEqual(exercise_data(self.ex)['questions'], [])
        save_session_draft(session, 0, '顾客想要茶')
        advance_session(session, 1, 'advance-demo-key')
        self.assertEqual(session.phase, 'expressions')
        self.assertEqual(advance_session(session, 1, 'advance-demo-key').phase, 'expressions')
        self.assertFalse(Attempt.objects.exists())
        with self.assertRaises(Conflict):
            save_session_draft(session, 0, '覆盖')

    def test_complete_guided_flow_then_independent_attempt(self):
        session = self.session_at('substitution')
        with self.assertRaises(Conflict):
            advance_session(session, session.revision, 'too-early-advance')
        for i in range(2):
            save_session_draft(session, session.revision, 'I would like coffee.')
            req = queue_turn(session, session.revision, f'substitution-{i}')
            self.assertEqual(self.run_job(req).status, 'completed')
            session.refresh_from_db()
        advance_session(session, session.revision, 'advance-conversation')
        for i in range(3):
            save_session_draft(session, session.revision, 'Some water, please.')
            self.run_job(queue_turn(session, session.revision, f'conversation-{i}'))
            session.refresh_from_db()
        self.assertFalse(Attempt.objects.exists())
        advance_session(session, session.revision, 'advance-verification')
        self.assertEqual(session.phase, 'verification')
        self.assertEqual(session.attempt.assisted, [])
        public = exercise_data(self.ex)
        self.assertEqual(len(public['questions']), 3)
        self.assertNotIn('reference_answer', public['questions'][0])

    def test_teaching_context_never_contains_hidden_questions(self):
        session = self.session_at('conversation')
        save_session_draft(session, 0, 'Coffee, please.')
        req = queue_turn(session, 1, 'conversation-context')
        claim = claim_next()
        with patch('learning.execution.ask', return_value=turn_result()) as ask:
            run_request(*claim)
        context = ask.call_args.args[2]
        self.assertNotIn('questions', context)
        self.assertNotIn('reference_answer', json.dumps(context))
        self.assertFalse(Grade.objects.exists())

    def test_help_preserves_input_and_does_not_create_evidence(self):
        session = self.session_at('conversation')
        save_session_draft(session, 0, 'I need')
        self.run_job(queue_turn(session, 1, 'help-request-key', help_requested=True))
        session.refresh_from_db()
        self.assertEqual(session.draft_text, 'I need')
        self.assertFalse(Attempt.objects.exists())
        self.assertFalse(course_data(self.course)['growth']['expression_count'])

    def test_duplicate_turn_pending_and_retry_failure(self):
        session = self.session_at('conversation')
        save_session_draft(session, 0, 'Coffee, please.')
        req = queue_turn(session, 1, 'duplicate-turn-key')
        self.assertEqual(queue_turn(session, 1, 'duplicate-turn-key').id, req.id)
        with self.assertRaises(Conflict):
            queue_turn(session, session.revision, 'other-turn-key')
        claim = claim_next()
        with patch('learning.execution.ask', side_effect=RuntimeError('provider failed')):
            run_request(*claim)
        turn = LearningTurn.objects.get(pk=req.target_id)
        self.assertEqual(turn.status, 'failed')
        session.refresh_from_db()
        retry = queue_turn(session, session.revision, 'retry-turn-key', retry_id=turn.id)
        self.run_job(retry)
        self.assertEqual(LearningTurn.objects.count(), 1)

    def test_end_cancels_late_model_response_and_releases_slot(self):
        session = self.session_at('conversation')
        save_session_draft(session, 0, 'Coffee, please.')
        req = queue_turn(session, 1, 'late-turn-key')
        claim = claim_next()
        def end_during_call(*args):
            end_exercise(self.ex)
            return turn_result()
        with patch('learning.execution.ask', side_effect=end_during_call):
            run_request(*claim)
        req.refresh_from_db(); session.refresh_from_db()
        self.assertEqual(req.status, 'cancelled')
        self.assertEqual(session.phase, 'ended')
        self.assertEqual(LearningTurn.objects.get(pk=req.target_id).result, {})
        self.assertEqual(course_data(self.course)['pending_count'], 0)

    def test_repractice_reserves_slot_and_starts_new_session(self):
        session = start_session(self.ex, 'first-start-key')
        session.phase = 'completed'; session.attempt = complete_attempt(self.ex); session.save()
        self.course.pending_limit = 1; self.course.save()
        other = lesson(self.course)
        with self.assertRaises(Conflict):
            start_session(self.ex, 'second-start-key')
        end_exercise(other)
        fresh = start_session(self.ex, 'second-start-key')
        self.assertNotEqual(fresh.id, session.id)
        self.assertEqual(fresh.phase, 'demo')
        self.assertIsNone(fresh.attempt)
        self.assertEqual(course_data(self.course)['pending_count'], 1)

    def test_revision_preserves_scores_answers_and_evidence(self):
        attempt = complete_attempt(self.ex, score=50)
        before = skill_states(self.course)
        req = queue_revision(attempt, 'q1', 'I would like coffee.', 'revision-key')
        self.run_job(req, {'feedback': '现在需求表达清楚，原成绩保留。'})
        attempt.refresh_from_db()
        self.assertEqual(attempt.answers['q1'], 'A')
        self.assertEqual(Grade.objects.get(attempt=attempt).result['score'], 50)
        self.assertEqual(skill_states(self.course), before)
        self.assertEqual(AnswerRevision.objects.get(attempt=attempt).original_answer, 'A')

    def test_recognition_does_not_establish_expression(self):
        self.ex.questions = questions(self.course, count=3, kind='choice'); self.ex.save()
        complete_attempt(self.ex)
        state = skill_states(self.course)[0]
        self.assertEqual(state['expression']['status'], '待评估')
        self.assertEqual(len(state['recognition']['evidence']), 1)

    def test_same_exercise_repractice_does_not_add_transfer_or_interval(self):
        complete_attempt(self.ex, when=timezone.now() - timedelta(days=4))
        complete_attempt(self.ex)
        state = skill_states(self.course)[0]['expression']
        self.assertEqual(len(state['evidence']), 1)
        self.assertEqual(state['status'], '学习中')

    def test_item_confirmed_deduplicated_edit_resets_current_evidence(self):
        suggestion = self.ex.teaching['expressions'][0]
        card = save_item(self.course, {**suggestion, 'source_exercise_id': self.ex.id})
        self.assertEqual(save_item(self.course, {**suggestion, 'source_exercise_id': self.ex.id}).id, card.id)
        qs = self.ex.questions
        qs[0].update(learning_item_ids=[card.id], learning_item_versions=[{'item_id': card.id, 'revision': 0}])
        self.ex.save()
        complete_attempt(self.ex)
        self.assertEqual(len(items_data(self.course)[0]['expression']['evidence']), 1)
        save_item(self.course, {**suggestion, 'meaning': '另一个语境'}, card)
        self.assertEqual(items_data(self.course)[0]['expression']['status'], '待评估')
        self.assertEqual(Grade.objects.count(), 1)
        card_id = card.id
        card.delete()
        self.assertTrue(SyncEntityState.objects.filter(model_label='learning.learningitem', object_pk=card_id, is_deleted=True).exists())

    def test_target_and_item_permissions_and_plan_gate(self):
        other = setup_course()
        item = save_item(other, {**self.ex.teaching['expressions'][0]})
        with self.assertRaises(ValidationError):
            reserve_exercise(self.course, 'foreign-item-key', item_id=item.id)
        with self.assertRaises(Conflict):
            reserve_exercise(self.course, 'target-before-initial', knowledge_id=self.ex.questions[0]['knowledge_id'])

    def test_http_contract_and_cross_course_protection(self):
        response = self.client.post(f'/api/learning/{self.course.pk}/exercises/{self.ex.id}/sessions/', {'requestKey': 'http-start-session'}, format='json')
        self.assertEqual(response.status_code, 200)
        data = response.json()['data']
        self.assertIn('draftText', data)
        other = setup_course()
        response = self.client.get(f'/api/learning/{other.pk}/sessions/{data["id"]}/')
        self.assertEqual(response.status_code, 404)
        response = self.client.put(f'/api/learning/{self.course.pk}/sessions/{data["id"]}/', {'revision': 0, 'content': '想要茶'}, format='json')
        self.assertEqual(response.status_code, 200)
        response = self.client.put(f'/api/learning/{self.course.pk}/sessions/{data["id"]}/', {'revision': 0, 'content': '覆盖'}, format='json')
        self.assertEqual(response.status_code, 409)

    def test_snapshot_missing_fact_wrong_relation_and_restore_no_replay(self):
        session = self.session_at('conversation')
        save_session_draft(session, 0, 'Coffee, please.')
        req = queue_turn(session, 1, 'snapshot-turn-key')
        save_item(self.course, self.ex.teaching['expressions'][0])
        data, meta = self.snapshot()
        self.assertEqual(meta['learning_schema_version'], 4)
        validate(data, meta)
        with self.assertRaises(SyncError):
            validate([r for r in data if r['model'] != 'learning.learningturn'], meta)
        tampered = copy.deepcopy(data)
        next(r for r in tampered if r['model'] == 'learning.learningsession')['fields']['exercise'] = 'missing'
        with self.assertRaises(SyncError):
            validate(tampered, metadata(tampered))
        reset_execution()
        self.assertEqual(LearningTurn.objects.get(pk=req.target_id).status, 'failed')
        self.assertIsNone(claim_next())

    def test_expired_turn_can_be_manually_retried(self):
        session = self.session_at('conversation')
        save_session_draft(session, 0, 'Coffee, please.')
        req = queue_turn(session, 1, 'expired-turn-key')
        claim_next()
        from .models import Runtime
        Runtime.objects.filter(course=self.course).update(claimed_at=timezone.now() - timedelta(minutes=6))
        expire_jobs()
        self.assertEqual(LearningTurn.objects.get(pk=req.target_id).status, 'failed')
        self.assertIsNone(claim_next())

    def test_real_serializer_roundtrip_and_legacy_mode(self):
        session = start_session(self.ex, 'restore-session-key')
        save_session_draft(session, 0, '顾客想要茶')
        card = save_item(self.course, self.ex.teaching['expressions'][0])
        manager = SyncManager()
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        manager.apply_snapshot_data(copy.deepcopy(data), meta, full_overwrite=True)
        manager.apply_snapshot_data(copy.deepcopy(data), meta, full_overwrite=True)
        self.assertEqual(LearningSession.objects.get(pk=session.pk).draft_text, '顾客想要茶')
        self.assertTrue(LearningItem.objects.filter(pk=card.pk).exists())
        self.assertIsNone(claim_next())
        broken = [r for r in data if r['model'] != 'learning.learningitem']
        with self.assertRaises(SyncError):
            manager.apply_snapshot_data(broken, meta, full_overwrite=True)
        self.assertTrue(LearningItem.objects.filter(pk=card.pk).exists())
        # Pre-v4 courses must restore as classic, even though new courses default to scenario.
        from .sync_lessons import normalize_legacy
        row = {'model': 'learning.course', 'pk': self.course.pk, 'fields': {'goal': '历史目标'}}
        normalized = normalize_legacy([row])
        self.assertEqual(normalized[0]['fields']['learning_mode'], 'classic')
        self.assertNotIn('learning_mode', row['fields'])

    def test_item_wrong_source_and_revision_failure_retry(self):
        with self.assertRaises(ValidationError):
            save_item(self.course, {**self.ex.teaching['expressions'][0], 'text': 'tampered', 'source_exercise_id': self.ex.id})
        attempt = complete_attempt(self.ex)
        req = queue_revision(attempt, 'q1', 'Coffee, please.', 'failed-revision-key')
        claim = claim_next()
        with patch('learning.execution.ask', side_effect=RuntimeError('provider failed')):
            run_request(*claim)
        correction = AnswerRevision.objects.get(pk=req.target_id)
        self.assertEqual(correction.status, 'failed')
        req = queue_revision(attempt, 'q1', '', 'retry-revision-key', retry_id=correction.pk)
        self.run_job(req, {'feedback': '需求表达清楚。'})
        self.assertEqual(AnswerRevision.objects.count(), 1)
        self.assertEqual(Grade.objects.count(), 1)

    def test_initial_mode_and_target_snapshot_are_frozen(self):
        self.ex.status = 'ended'; self.ex.save()
        req, _ = reserve_exercise(self.course, 'scenario-initial-key')
        self.assertEqual(req.snapshot['learning_mode'], 'scenario')
        self.assertEqual(req.snapshot['question_count'], 5)
        initial = Exercise.objects.get(pk=req.target_id)
        self.assertEqual(initial.format, 'classic')
        initial.questions = questions(self.course)
        initial.save(update_fields=['questions'])
        complete_attempt(initial)
        from .models import Plan
        Plan.objects.create(course=self.course, confirmed=True, stages=[{'title': '日常', 'focus': '表达需求'}]*3)
        card = save_item(self.course, self.ex.teaching['expressions'][0])
        req, _ = reserve_exercise(self.course, 'scenario-target-key', item_id=card.id)
        self.assertEqual(req.snapshot['target_knowledge']['id'], card.knowledge_id)
        self.assertEqual(req.snapshot['learning_items'][0]['revision'], 0)
        self.assertEqual(Exercise.objects.get(pk=req.target_id).format, 'scenario')
        save_item(self.course, {**self.ex.teaching['expressions'][0], 'meaning': '修改后的含义'}, card)
        self.assertEqual(req.snapshot['learning_items'][0]['meaning'], '我想要……')

    def test_due_card_alternates_recognition_without_claiming_expression(self):
        card = save_item(self.course, {**self.ex.teaching['expressions'][0], 'source_exercise_id': self.ex.id})
        self.ex.kind = 'initial'
        self.ex.questions[0].update(learning_item_ids=[card.id], learning_item_versions=[{'item_id': card.id, 'revision': 0}])
        self.ex.save()
        complete_attempt(self.ex, when=timezone.now() - timedelta(days=2))
        from .models import Plan
        Plan.objects.create(course=self.course, confirmed=True, stages=[{'title': '日常', 'focus': '表达需求'}]*3)
        req, _ = reserve_exercise(self.course, 'recognition-review-key')
        self.assertEqual(req.snapshot['learning_items'][0]['practice_skill'], 'recognition')
        ex = Exercise.objects.get(pk=req.target_id)
        qs = copy.deepcopy(self.ex.questions)
        qs[0].update(type='choice', options=['A', 'B'], reference_answer='A')
        for i in (1, 2):
            qs[i].update(type='short', knowledge_id='', knowledge_name=f'表达新需求{i}', learning_item_ids=[], options=[])
        from .generation import validate_exercise
        _, _, validated = validate_exercise({'title': '理解与表达', 'introduction': '换情境', 'questions': qs}, ex)
        self.assertEqual(sum(q['review'] for q in validated), 1)
        self.assertEqual(validated[0]['learning_item_ids'], [card.id])

    def test_due_knowledge_target_shares_expression_with_its_card(self):
        card = save_item(self.course, {**self.ex.teaching['expressions'][0], 'source_exercise_id': self.ex.id})
        self.ex.kind = 'initial'
        # The card has expression evidence but no recognition evidence.
        self.ex.questions[0].update(learning_item_ids=[card.id], learning_item_versions=[{'item_id': card.id, 'revision': 0}])
        self.ex.questions[-1].update(knowledge_id='', knowledge_name='其他理解')
        self.ex.save()
        complete_attempt(self.ex, when=timezone.now() - timedelta(days=2))
        from .models import Plan
        from .generation import validate_exercise
        Plan.objects.create(course=self.course, confirmed=True, stages=[{'title': '日常', 'focus': '表达需求'}]*3)
        for target in ({'knowledge_id': card.knowledge_id}, {'item_id': card.id}):
            with self.subTest(target=target):
                req, _ = reserve_exercise(self.course, f'target-review-{next(iter(target))}', **target)
                self.assertEqual(req.snapshot['learning_items'][0]['practice_skill'], 'expression')
                ex = Exercise.objects.get(pk=req.target_id)
                qs = copy.deepcopy(self.ex.questions)
                qs[0].update(type='short', learning_item_ids=[card.id])
                qs[1].update(knowledge_id='', knowledge_name='另一表达需求', learning_item_ids=[])
                qs[2].update(knowledge_id='', knowledge_name='新的理解', learning_item_ids=[])
                _, _, validated = validate_exercise({'title': '专项复习', 'introduction': '换情境表达', 'questions': qs}, ex)
                self.assertEqual(sum(q['review'] for q in validated), 1)
                self.assertEqual(validated[0]['learning_item_ids'], [card.id])
                ex.status = 'ended';ex.save(update_fields=['status'])

    def test_deleted_card_snapshots_remain_valid_but_forged_grade_rejected(self):
        card = save_item(self.course, {**self.ex.teaching['expressions'][0], 'source_exercise_id': self.ex.id})
        self.ex.snapshot['learning_items'] = [{'id': card.id, 'revision': 0, 'knowledge_id': card.knowledge_id}]
        self.ex.questions[0].update(learning_item_ids=[card.id], learning_item_versions=[{'item_id': card.id, 'revision': 0}])
        self.ex.save()
        attempt = complete_attempt(self.ex)
        grade = Grade.objects.get(attempt=attempt)
        for item in grade.result['items'][:2]:
            item['dimensions'] = [{'score': v, 'reason': '表达正确', 'verdict': 'correct'} for v in (60, 25, 15)]
        grade.save()
        card.delete()
        data, meta = self.snapshot()
        validate(data, meta)
        forged = copy.deepcopy(data)
        next(r for r in forged if r['model'] == 'learning.grade')['fields']['result']['items'][0]['dimensions'][0]['score'] = 59
        with self.assertRaises(SyncError):
            validate(forged, metadata(forged))
        malformed = copy.deepcopy(data)
        next(r for r in malformed if r['model'] == 'learning.exercise')['fields']['snapshot']['learning_items'] = ['bad']
        with self.assertRaises(SyncError):
            validate(malformed, metadata(malformed))

    def test_expression_mastery_requires_distinct_dates_and_due_review(self):
        for days in (5, 2, 0):
            ex = lesson(self.course)
            for q in ex.questions:
                q['review'] = days != 5
            ex.save()
            complete_attempt(ex, when=timezone.now() - timedelta(days=days))
        point = next(p for p in skill_states(self.course) if p['id'] == self.ex.questions[0]['knowledge_id'])
        self.assertEqual(point['expression']['status'], '初步掌握')
        self.assertEqual(len(point['expression']['evidence']), 3)

    def test_scenario_generation_requires_teaching_and_output_and_weights(self):
        from .generation import validate_exercise
        payload = {'title': '点餐', 'introduction': '表达需求', 'questions': self.ex.questions}
        with patch('learning.execution.ask', return_value=payload):
            from .models import Request
            req = Request(course=self.course, target_id=self.ex.pk, snapshot=self.ex.snapshot)
            with self.assertRaises(ValidationError):
                generate(req)
        wrong = copy.deepcopy(payload)
        wrong['questions'][0]['weights'] = [40, 30, 30]
        with self.assertRaises(ValidationError):
            validate_exercise(wrong, self.ex)
        wrong = copy.deepcopy(payload)
        for q in wrong['questions']:
            q.update(type='choice', options=['A', 'B'], reference_answer='A')
        with self.assertRaises(ValidationError):
            validate_exercise(wrong, self.ex)
