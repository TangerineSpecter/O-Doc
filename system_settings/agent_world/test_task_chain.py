"""异常必须进入执行详情；同次执行的业务步骤必须先聚合再分页。"""
from datetime import timedelta
from unittest.mock import patch
from types import SimpleNamespace
from django.test import TestCase
from django.utils import timezone
from system_settings.models import AgentRunRecord, AgentActivity, WorldAction, AgentExecutionLease, WorldActionRuntime
from system_settings.agent_task_scheduler import AgentTaskScheduler
from . import test_market, test_publish
from .market_runner import run_market_opportunity
from .publish_runner import run_publish_opportunity, repair_publication
from .farm_runner import run_farm_opportunity
from .daily_feed_groups import grouped_execution_events
from .daily_feed import _window
from .life_time import local_time
from .inventory_stock import stock_quantity


class TaskChainTests(TestCase):
    def setUp(self):
        test_market.MarketTests.setUp(self)
        from .market_sessions import close_session
        close_session(self.sa, 'fixture closed')
        close_session(self.sb, 'fixture closed')

    def test_provider_failure_preserves_purchase_and_diagnostic(self):
        # 使用真实市场工具，错误发生在已经成交之后。
        def model(messages, tools, execute, **kwargs):
            shop = execute('get_market_shop', {})
            execute('enter_market', {})
            execute('buy_market_shop', {'request_id': 'before-error', 'batch_id': shop['id'], 'slot_id': 'feed', 'quantity': 1})
            raise TimeoutError('provider deadline api_key=secret-value')
        with patch('system_settings.agent_world.market_runner.select_agent', return_value=self.a), \
             patch('system_settings.agent_world.market_runner.AIService.chat_completion_messages_with_tools', side_effect=model):
            record = run_market_opportunity(self.task, key='chain-fail', manual=True)
        record.refresh_from_db()
        self.assertEqual(record.status, 'failed')
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'feed'), 1)
        self.assertIn('TimeoutError', record.output)
        self.assertNotIn('secret-value', record.output)
        self.assertEqual(record.steps[-1]['status'], 'failed')
        self.assertIn('buy_market_shop', record.steps[-1]['detail'])
        self.assertIn('TimeoutError', record.agent_runs[0]['content'])
        activity = AgentActivity.objects.get(run_record=record, activity_type='work')
        self.assertEqual(activity.status, 'failed')
        self.assertIn('TimeoutError', activity.summary)
        # 同一次市场执行仍然只有一张业务卡，保留进出及购买三个步骤。
        response = self.client.get('/api/settings/agent-world/daily-feed/', {'date': local_time().date().isoformat(), 'category': 'market'})
        self.assertEqual(response.status_code, 200, response.data)
        items = [row for row in response.data['data']['items'] if record.pk in row['id']]
        self.assertEqual(len(items), 1, items)
        self.assertEqual(len(items[0]['steps']), 3)
        self.assertEqual(items[0]['status'], 'failed')

    def test_rejected_tool_is_recorded_even_when_model_recovers(self):
        def model(messages, tools, execute, **kwargs):
            execute('enter_market', {})
            result = execute('buy_market_shop', {'request_id': 'bad', 'batch_id': 'missing', 'slot_id': 'feed', 'quantity': 1})
            self.assertIn('error', result)
            execute('leave_market', {'reason': '没有合适商品'})
        with patch('system_settings.agent_world.market_runner.select_agent', return_value=self.a), \
             patch('system_settings.agent_world.market_runner.AIService.chat_completion_messages_with_tools', side_effect=model):
            record = run_market_opportunity(self.task, key='recover-tool', manual=True)
        self.assertEqual(record.status, 'success')
        self.assertTrue(any(step['status'] == 'failed' and 'buy_market_shop' in step['title'] for step in record.steps))

    def test_farm_model_failure_has_phase_and_terminal_step(self):
        with patch('system_settings.agent_world.farm_runner.select_agent', return_value=self.a), \
             patch('system_settings.agent_world.farm_runner.decide', side_effect=ValueError('invalid plan')):
            record = run_farm_opportunity(self.farm_task, key='farm-error', manual=True)
        record.refresh_from_db()
        self.assertEqual(record.status, 'failed')
        self.assertIn('模型选择经营计划失败（ValueError）', record.output)
        self.assertEqual(record.steps[-1]['status'], 'failed')

    def test_interrupted_recovery_is_idempotent(self):
        from .action_runner import repair_effects
        record = AgentRunRecord.objects.create(task=self.task, task_name=self.task.name, agent=self.a,
            status='failed', agent_runs=[{'agent': self.a.pk, 'status': 'running', 'steps': []}])
        action = WorldAction.objects.create(pk='interrupted', task=self.task, agent=self.a, record=record,
            status='failed', snapshot={'market': True}, result={'reason': '执行中断，底层原因未知'})
        repair_effects(action)
        repair_effects(action)
        record.refresh_from_db()
        self.assertEqual(len(record.steps), 1)
        self.assertEqual(record.agent_runs[0]['status'], 'failed')
        self.assertIn('底层原因未知', record.output)
        self.assertEqual(AgentActivity.objects.get(run_record=record).current_action, '市场机会结束')

    def test_travel_retry_keeps_failure_in_execution_steps(self):
        from .travel_models import TravelJourney, TravelNode
        from .travel_activity import start_activity, update_activity
        from .travel_steps import record_attempt
        journey = TravelJourney.objects.create(pk='retry-trip', task=self.task, agent=self.a,
            actor_id=self.a.pk, owner_id='admin', phase='plan', snapshot={'agent_name': self.a.name})
        start_activity(journey)
        node = TravelNode.objects.create(pk='retry-trip:plan', journey=journey, kind='plan')
        record_attempt(node, 'failed', 'plan失败（TimeoutError）：deadline', node_status='waiting')
        record_attempt(node, 'success')
        update_activity(journey)
        record = WorldAction.objects.get(pk=journey.pk).record
        self.assertEqual([step['status'] for step in record.steps], ['failed', 'success'])
        self.assertIn('TimeoutError', record.steps[0]['detail'])

    def test_custom_task_failure_has_output_and_agent_trace(self):
        task = test_market.AgentTask.objects.create(name='自定义任务', agent=self.a, agent_ids=[self.a.pk])
        with patch('system_settings.agent_task_scheduler.AIService.chat_completion_messages', side_effect=TimeoutError('model deadline')):
            record = AgentTaskScheduler()._run_task(task, trigger='手动执行')
        self.assertEqual(record.status, 'failed')
        self.assertIn('TimeoutError', record.output)
        self.assertEqual(record.agent_runs[0]['steps'][-1]['status'], 'failed')
        self.assertIn('TimeoutError', record.agent_runs[0]['content'])

    def test_builtin_startup_failure_creates_execution_record(self):
        with patch('system_settings.agent_world.market_runner.run_market_opportunity', side_effect=ValueError('invalid owner')):
            record = AgentTaskScheduler()._run_task(self.task, trigger='手动执行')
        self.assertEqual(record.status, 'failed')
        self.assertIn('ValueError', record.output)
        self.assertEqual(record.steps[-1]['status'], 'failed')
        self.assertEqual(AgentRunRecord.objects.filter(task=self.task).count(), 1)

    def test_interaction_model_failure_has_phase_and_output(self):
        from .action_runner import run_opportunity
        with patch('system_settings.agent_world.action_runner.select_agent', return_value=self.a), \
             patch('system_settings.agent_world.action_runner.choose_post', return_value=SimpleNamespace(title='测试帖')), \
             patch('system_settings.agent_world.action_runner.evaluate', side_effect=TimeoutError('read deadline')):
            record = run_opportunity(self.task, AgentTaskScheduler(), key='interaction-error', manual=True)
        record.refresh_from_db()
        self.assertEqual(record.status, 'failed')
        self.assertIn('模型阅读与评价失败（TimeoutError）', record.output)
        self.assertTrue(any(step['status'] == 'failed' and 'TimeoutError' in step['detail'] for step in record.steps))


class PublishDiagnosticTests(TestCase):
    setUp = test_publish.PublicationTests.setUp

    def test_publish_failure_has_original_exception_and_is_not_repeated(self):
        AgentExecutionLease.objects.all().delete()
        WorldActionRuntime.objects.all().update(token='', until=None)
        with patch('system_settings.agent_world.publish_runner.select_agent', return_value=self.agent), \
             patch('system_settings.agent_world.publish_runner.eligibility', return_value=''), \
             patch('system_settings.agent_world.publish_runner.Workflow.run', side_effect=TimeoutError('search timed out')):
            record = run_publish_opportunity(self.task, AgentTaskScheduler(), key='publish-error', manual=True)
        self.assertEqual(record.status, 'failed')
        self.assertIn('TimeoutError', record.output)
        self.assertIn('search timed out', record.steps[-1]['detail'])
        previous = list(record.steps)
        repair_publication(WorldAction.objects.get(pk='publish-error'))
        record.refresh_from_db()
        self.assertEqual(record.steps, previous)

    def test_multiple_posts_are_grouped_before_api_pagination(self):
        record = AgentRunRecord.objects.create(task=self.task, task_name=self.task.name, agent=self.agent)
        for index in range(2):
            AgentActivity.objects.create(agent=self.agent, run_record=record, activity_type='interaction',
                event_key=f'chain-comment-{index}', action='comment', title=f'评论帖子{index}', artifact_coll_id=self.collection.pk,
                artifact_article_id=f'post-{index}', occurred_at=timezone.now(), summary=f'评论内容{index}')
        response = self.client.get('/api/settings/agent-world/daily-feed/',
            {'date': local_time().date().isoformat(), 'category': 'interaction'})
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data['data']['items']
        self.assertEqual(len(rows), 1, rows)
        self.assertEqual(len(rows[0]['steps']), 2)
        self.assertEqual(rows[0]['target']['id'], record.pk)


class ExecutionGroupingTests(TestCase):
    def event(self, key, category='market', source='market', actor='a', group='market:run', amount='-10', at=None):
        return {'id': key, 'category': category, 'source': source, 'actorId': actor, 'actorName': actor,
                'title': key, 'detail': key, 'amount': amount, 'status': 'success',
                'occurredAt': local_time(at).isoformat(), '_execution_group': group}

    def test_distinct_executions_and_actors_are_not_merged(self):
        start, end = _window(local_time().date())
        rows = [self.event('one'), self.event('two'), self.event('other', group='market:other'), self.event('seller', actor='b')]
        cards = grouped_execution_events(rows, start, end)
        self.assertEqual(len(cards), 3)
        self.assertEqual(next(row['amount'] for row in cards if len(row['steps']) == 2), '-20')

    def test_multiple_sales_to_same_execution_are_one_seller_card(self):
        start, end = _window(local_time().date())
        rows = [self.event('sale-1', 'trade', 'market-seller', 'seller', 'market-sale:buyer-run', '20'),
                self.event('sale-2', 'trade', 'market-seller', 'seller', 'market-sale:buyer-run', '30')]
        cards = grouped_execution_events(rows, start, end)
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]['category'], 'trade')
        self.assertEqual(cards[0]['amount'], '50')

    def test_cross_day_execution_appears_only_on_latest_day(self):
        today = local_time().date()
        start, end = _window(today)
        old = start - timedelta(minutes=1)
        rows = [self.event('old', at=old), self.event('new', at=start + timedelta(minutes=1))]
        cards = grouped_execution_events(rows, start, end)
        self.assertEqual(len(cards), 1)
        self.assertEqual(len(cards[0]['steps']), 2)
        rows = [self.event('old', at=old), self.event('new', at=start + timedelta(minutes=1))]
        yesterday_start, yesterday_end = _window(today - timedelta(days=1))
        self.assertEqual(grouped_execution_events(rows, yesterday_start, yesterday_end), [])

    def test_multiple_artifacts_are_one_task_card(self):
        start, end = _window(local_time().date())
        rows = [self.event('post-1', 'interaction', 'activity', group='activity:run', amount=None),
                self.event('post-2', 'interaction', 'activity', group='activity:run', amount=None)]
        cards = grouped_execution_events(rows, start, end)
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]['category'], 'interaction')
        self.assertEqual(len(cards[0]['steps']), 2)
