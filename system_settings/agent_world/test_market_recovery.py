"""隔离模拟进程退出；状态修复不得触发模型或重放交易。"""
import json
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from system_settings.agent_activity import update_work_activity
from system_settings.models import AgentActivity, AgentRunRecord, SyncEntityState, WorldAction
from system_settings.token_usage.models import AgentTokenUsage
from .daily_feed import day_events
from .life_time import local_time
from .market_models import MarketRuntime, MarketTransaction
from .market_recovery import PROCESS_INTERRUPTED
from .market_runner import run_market_opportunity
from .market_sessions import cleanup, close_session, enter
from .market_tools import call_market_tool
from . import test_market


class MarketRecoveryTests(TestCase):
    def setUp(self):
        test_market.MarketTests.setUp(self)
        close_session(self.sa, 'done')
        close_session(self.sb, 'done')
        self.record = AgentRunRecord.objects.create(task=self.task, task_name=self.task.name, agent=self.a,
            agent_name=self.a.name, status='running', started_at=self.now,
            steps=[{'title': 'JEV 市场选择', 'status': 'info'}],
            agent_runs=[{'agent': self.a.pk, 'status': 'running', 'steps': []}])
        self.action = WorldAction.objects.create(pk='recover-opportunity', task=self.task, agent=self.a,
            actor_id=self.a.pk, record=self.record, snapshot={'market': True})
        self.session = enter('admin', self.a, 'recover-session', task=self.task, record=self.record,
                             mode='manual', now=self.now)
        update_work_activity(self.record, self.a, status='running', current_action='进入市场')
        self.success_usage = AgentTokenUsage.objects.create(record_key=self.record.pk, device_id='test',
            status='success', input_tokens=2751, output_tokens=32, total_tokens=2783, usage_complete=True)
        self.pending_usage = AgentTokenUsage.objects.create(record_key=self.record.pk, device_id='test',
            status='running', input_tokens=10)
        self.ended_at = self.now + timedelta(seconds=9)

    def recover(self):
        with patch('system_settings.agent_world.market_sessions.os.kill', side_effect=ProcessLookupError):
            cleanup(restart=True, now=self.ended_at)
        self.record.refresh_from_db()
        self.action.refresh_from_db()
        self.session.refresh_from_db()

    def test_dead_process_finishes_every_status_and_preserves_usage(self):
        energy_before = WorldAction.objects.filter(snapshot__market_energy=True).count()
        self.recover()
        self.assertEqual(self.session.status, 'closed')
        self.assertEqual(self.session.reason, PROCESS_INTERRUPTED)
        self.assertEqual(self.record.status, 'failed')
        self.assertEqual(self.record.duration, '9秒')
        self.assertEqual(self.record.agent_runs[0]['status'], 'failed')
        self.assertEqual(self.record.agent_runs[0]['steps'][-1]['title'], '市场执行中断')
        self.assertEqual(self.action.status, 'failed')
        self.assertTrue(self.action.effects_done)
        activity = AgentActivity.objects.get(run_record=self.record)
        self.assertEqual((activity.status, activity.current_action), ('failed', '市场执行已中断'))
        self.pending_usage.refresh_from_db()
        self.success_usage.refresh_from_db()
        self.assertEqual(self.pending_usage.status, 'interrupted')
        self.assertEqual(self.pending_usage.ended_at, self.ended_at)
        self.assertEqual(self.pending_usage.input_tokens, 10)
        self.assertIsNone(self.pending_usage.total_tokens)
        self.assertFalse(self.pending_usage.usage_complete)
        self.assertEqual(self.success_usage.total_tokens, 2783)
        self.assertEqual(self.success_usage.status, 'success')
        self.assertTrue(SyncEntityState.objects.filter(model_label='system_settings.agenttokenusage',
                                                     object_pk=self.pending_usage.pk).exists())
        self.assertFalse(MarketRuntime.objects.filter(pk=self.session.pk).exists())
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True).count(), energy_before)
        steps = self.record.steps
        self.recover()
        self.assertEqual(self.record.steps, steps)
        with patch('system_settings.agent_world.market_runner.AIService') as model:
            self.assertEqual(run_market_opportunity(self.task, key=self.action.pk, manual=True).pk, self.record.pk)
        model.assert_not_called()

    def test_already_closed_legacy_session_is_reconciled(self):
        close_session(self.session, PROCESS_INTERRUPTED, self.ended_at)
        cleanup(now=self.ended_at)
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, 'failed')

    def test_committed_purchase_is_preserved_without_replaying(self):
        call_market_tool('buy_market_shop', {'request_id': 'before-crash', 'session_id': self.session.pk,
                         'batch_id': self.shop.pk, 'slot_id': '0', 'quantity': 1}, self.a)
        self.a.refresh_from_db()
        money = self.a.money
        trades = list(MarketTransaction.objects.values_list('pk', 'result'))
        self.recover()
        self.recover()
        self.a.refresh_from_db()
        self.assertEqual(self.a.money, money)
        self.assertEqual(list(MarketTransaction.objects.values_list('pk', 'result')), trades)
        self.assertEqual(len(json.loads(self.record.output)['transactions']), 1)
        self.assertIn('已提交的 1 笔操作保留', self.record.summary)

    def test_live_runner_and_ordinary_leave_are_not_interrupted(self):
        with patch('system_settings.agent_world.market_sessions.os.kill', return_value=None):
            cleanup(restart=True, now=self.ended_at)
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, 'running')
        close_session(self.session, '采购完成', self.ended_at)
        cleanup(now=self.ended_at)
        self.record.refresh_from_db()
        self.assertEqual(self.record.status, 'running')  # 正常 runner 随后写入终态。

    def test_shared_market_session_does_not_finish_other_task_records(self):
        self.action.snapshot = {'combat': True}
        self.action.save()
        self.recover()
        self.assertEqual(self.record.status, 'running')

    def test_feed_distinguishes_interruption_from_resident_leave(self):
        self.recover()
        request = APIRequestFactory().get('/')
        request.user = self.user
        rows, *_ = day_events(request, 'admin', local_time(self.now).date(), actor_id=self.a.pk)
        event = next(row for row in rows if row['id'] == f'execution:market:{self.record.pk}:{self.a.pk}')
        self.assertEqual(event['status'], 'failed')
        self.assertEqual(event['steps'][-1]['title'], '市场会话中断')
        self.assertEqual(event['reason'], PROCESS_INTERRUPTED)

    def test_old_model_protocol_reason_is_hidden_without_rewriting_history(self):
        reason = '无当天farm_queue不可虚构种植计划，故离场'
        close_session(self.session, reason, self.ended_at)
        self.record.status = 'success'
        self.record.summary = '本次完成0笔交易，未成交'
        self.record.save()
        request = APIRequestFactory().get('/')
        request.user = self.user
        rows, *_ = day_events(request, 'admin', local_time(self.now).date(), actor_id=self.a.pk)
        event = next(row for row in rows if row['id'] == f'execution:market:{self.record.pk}:{self.a.pk}')
        self.assertNotIn('farm_queue', event['reason'])
        self.assertIn('未成交', event['reason'])
        self.session.refresh_from_db()
        self.assertEqual(self.session.reason, reason)
