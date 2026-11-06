"""Policy writes share the asset/snapshot gate; model calls never hold it."""
import json
from threading import Event, Thread
from types import SimpleNamespace
from unittest.mock import patch

from django.core import serializers
from django.db import close_old_connections, connections
from django.test import TransactionTestCase
from django.utils import timezone

from system_settings.models import Agent
from utils.sync_datetime import SyncJSONEncoder
from .farm_gate import farm_gate
from .life_time import local_time
from .market_disposition_worker import Budget, ModelUnavailable, _ask
from .market_models import MarketConfig, MarketIntegrity
from .market_plan_models import MarketDisposition, MarketPlan
from .market_policy_review import KEY, Progress, decide
from .market_strategy_sync import validate_source
from .market_sync import ASSET_MODELS


class MarketPolicyLockingTests(TransactionTestCase):
    def setUp(self):
        self.owner = 'policy-lock-test'
        self.agent = Agent.objects.create(name='并发复核验证')
        self.sku = 'souvenir.lock-check'
        self.errors = []

    def snapshot(self):
        data = []
        for model in (*ASSET_MODELS, MarketIntegrity):
            data.extend(json.loads(serializers.serialize('json', model.objects.all(), cls=SyncJSONEncoder)))
        validate_source(data)
        return data

    def start_writer(self, operation):
        attempted, done = Event(), Event()

        def write():
            close_old_connections()
            attempted.set()
            try:
                operation()
            except Exception as exc:
                self.errors.append(exc)
            finally:
                connections.close_all()
                done.set()

        thread = Thread(target=write)
        thread.start()
        self.assertTrue(attempted.wait(5))
        return thread, done

    def finish_writer(self, thread, done):
        thread.join(10)
        self.assertTrue(done.is_set(), '市场写入未在释放快照锁后完成')
        if self.errors:
            raise self.errors[0]
        self.snapshot()

    def plan(self):
        MarketConfig.objects.create(pk=self.owner, seed='test')
        return MarketPlan.objects.create(pk='policy-lock-plan', owner_id=self.owner,
            actor_id=self.agent.pk, plan_date=local_time(timezone.now()).date())

    def test_progress_waits_for_snapshot_and_preserves_other_context(self):
        plan = self.plan()
        progress = Progress(plan, self.sku, 'a' * 64)
        progress.answers = {'target:self_use': '1'}
        try:
            with farm_gate():
                thread, done = self.start_writer(progress.save)
                self.assertFalse(done.wait(.2), '复核答案绕过了快照锁')
                self.assertEqual(MarketPlan.objects.get(pk=plan.pk).context, {})
                self.snapshot()
                plan.context = {'answers': {'daily': 'keep'}}
                plan.save(update_fields=['context', 'updated_at'])
        finally:
            self.finish_writer(thread, done)
        plan.refresh_from_db()
        self.assertEqual(plan.context['answers'], {'daily': 'keep'})
        self.assertEqual(plan.context[KEY][self.sku]['answers'], progress.answers)

    def test_purchase_answer_waits_for_snapshot_and_preserves_reviews(self):
        from .market_planning import _save_plan_answer
        plan = self.plan()
        try:
            with farm_gate():
                thread, done = self.start_writer(lambda: _save_plan_answer(plan, 'daily', 'keep'))
                self.assertFalse(done.wait(.2), '采购答案绕过了快照锁')
                progress = Progress(plan, self.sku, 'a' * 64)
                progress.save()
                self.snapshot()
        finally:
            self.finish_writer(thread, done)
        plan.refresh_from_db()
        self.assertIn(self.sku, plan.context[KEY])
        self.assertEqual(plan.context['answers'], {'daily': 'keep'})

    def test_initialization_and_failure_are_guarded_but_model_call_is_not(self):
        model_started, model_release = Event(), Event()

        def unavailable(*args, **kwargs):
            model_started.set()
            if not model_release.wait(5):
                raise TimeoutError('模型调用占用了快照锁')
            return None

        def review():
            try:
                decide(self.owner, self.agent, SimpleNamespace(sku=self.sku), Budget(), {}, _ask)
            except ModelUnavailable:
                pass

        with patch('system_settings.agent_world.market_disposition_worker.choose_scene', side_effect=unavailable):
            try:
                with farm_gate():
                    thread, done = self.start_writer(review)
                    self.assertFalse(model_started.wait(.2), '初始化绕过了快照锁')
                    self.assertFalse(MarketConfig.objects.filter(pk=self.owner).exists())
                    self.assertFalse(MarketPlan.objects.exists())
                    self.assertFalse(MarketDisposition.objects.exists())
                self.assertTrue(model_started.wait(5))
                with farm_gate():
                    self.snapshot()
                    model_release.set()
                    self.assertFalse(done.wait(.2), '模型失败后的进度写入绕过了快照锁')
            finally:
                model_release.set()
                self.finish_writer(thread, done)
        plan = MarketPlan.objects.get(owner_id=self.owner)
        self.assertEqual(plan.context[KEY][self.sku]['status'], 'review')
        self.assertEqual(MarketDisposition.objects.get(owner_id=self.owner).strategy, {})
