"""Real market transactions in an isolated database, with both providers mocked."""
import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase, SimpleTestCase
from . import test_market as fixture_module
from .market_sessions import close_session
from .market_models import MarketSession, MarketTransaction
from .market_runner import run_market_opportunity
from .inventory_stock import stock_quantity
from .market_model_context import model_context, compact_messages, observe
from .market_decision_candidates import candidates
from system_settings.models import WorldAction
from system_settings.decision.jev import DecisionUnavailable


class MarketDecisionTests(TestCase):
    setUp = fixture_module.MarketTests.setUp
    life_item = fixture_module.MarketTests.life_item

    def prepare(self):
        close_session(self.sa, 'fixture finished')
        close_session(self.sb, 'fixture finished')
        self.task.market_config['decision_enabled'] = True
        self.task.market_config['decision_provider'] = 'jev'
        self.task.save()

    def run_with(self, choose, text=None):
        with patch('system_settings.agent_world.market_runner.select_agent', return_value=self.a), \
             patch('system_settings.agent_world.market_decision_loop.choose', side_effect=choose), \
             patch('system_settings.agent_world.market_runner.AIService.chat_completion_messages_with_tools', side_effect=text) as model:
            record = run_market_opportunity(self.task, manual=True)
        return record, model

    def test_jev_wait_never_enters_or_calls_text(self):
        self.prepare()
        record, model = self.run_with(lambda *args, **kwargs: ('wait', .9))
        self.assertEqual(record.status, 'success', record.summary)
        self.assertFalse(MarketSession.objects.filter(record=record).exists())
        self.assertEqual(model.call_count, 0)

    def test_real_adapter_request_links_usage_to_resident_task_and_execution(self):
        from unittest.mock import Mock
        from system_settings.decision.config import save_key
        from system_settings.token_usage.models import AgentTokenUsage
        self.prepare()
        save_key('admin', 'isolated-secret')
        response = Mock(status_code=200)
        response.json.return_value = {'model': 'jev-1.13.0', 'usage': {'input_tokens': 100, 'output_tokens': 8},
            'answers': {'next_action': {'type': 'choice', 'choice': 'wait',
                'probabilities': {'enter': .1, 'wait': .9}, 'confidence': .8}}}
        with patch('system_settings.decision.jev.requests.post', return_value=response), \
             patch('system_settings.agent_world.market_runner.select_agent', return_value=self.a):
            record = run_market_opportunity(self.task, manual=True)
        row = AgentTokenUsage.objects.get()
        self.assertEqual((row.owner_key, row.agent_key, row.task_key, row.record_key),
                         ('admin', self.a.pk, self.task.pk, record.pk))
        self.assertEqual(row.phase, 'JEV 市场选择')
        self.assertEqual(row.model_name, 'jev-1.13.0')

    def test_stock_conflict_refreshes_without_provider_fallback(self):
        self.prepare()
        calls = [0]
        def choose(owner, state, criteria, **kwargs):
            calls[0] += 1
            if calls[0] == 1:
                return 'enter', .8
            if calls[0] == 2:
                return 'buy', .8
            if calls[0] == 3:
                return next(key for key, row in criteria.items() if isinstance(row, dict) and row['label'] == '购买 萝卜种子'), .8
            if calls[0] == 4:
                self.shop.slots[0]['remaining_quantity'] = 0
                self.shop.save()
                return '1', .8
            self.assertIn('库存', state['last_failure']['error'])
            return 'leave', .8
        record, model = self.run_with(choose)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(model.call_count, 0)
        self.assertEqual(MarketTransaction.objects.filter(session__record=record).count(), 0)

    def test_missing_key_falls_back_before_entering(self):
        self.prepare()
        def unavailable(*args, **kwargs):
            raise DecisionUnavailable('本机尚未配置密钥')
        record, model = self.run_with(unavailable, lambda *args, **kwargs: '本次不去')
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(model.call_count, 1)
        payload = json.loads(model.call_args.args[0][1]['content'])
        self.assertEqual(payload['session']['status'], 'not_entered')

    def test_partial_trade_fallback_reuses_session_energy_and_facts(self):
        self.prepare()
        calls = [0]
        def choice(owner, state, criteria, **kwargs):
            calls[0] += 1
            if calls[0] == 1:
                return 'enter', .9
            if calls[0] == 2:
                return 'buy', .9
            if calls[0] == 3:
                return next(key for key, row in criteria.items() if isinstance(row, dict) and row['label'] == '购买 饲料'), .9
            if calls[0] == 4:
                return '1', .9
            raise DecisionUnavailable('服务超时')
        def text(messages, tools, execute, **kwargs):
            payload = json.loads(messages[1]['content'])
            self.assertEqual(payload['session']['status'], 'active')
            self.assertEqual(len(payload['completed_operations']), 1)
            self.assertEqual(payload['market_state']['spending']['balance'], '9995.00')
            execute('enter_market', {'request_id': 'fallback-enter'})
            execute('leave_market', {'reason': '已完成一次采购'})
        before = WorldAction.objects.filter(snapshot__market_energy=True).count()
        record, model = self.run_with(choice, text)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(model.call_count, 1)
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'feed'), 1)
        self.assertEqual(MarketTransaction.objects.filter(session__record=record).count(), 1)
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True).count(), before + 1)
        self.assertEqual(MarketSession.objects.filter(record=record).count(), 1)

    def test_complex_step_returns_to_jev_and_stops_second_write(self):
        self.prepare()
        calls = [0]
        def choice(owner, state, criteria, **kwargs):
            calls[0] += 1
            return ('enter' if calls[0] == 1 else 'other' if calls[0] == 2 else 'wait'), .9
        def text(messages, tools, execute, **kwargs):
            execute('buy_market_shop', {'request_id': 'complex-feed', 'batch_id': self.shop.pk, 'slot_id': 'feed', 'quantity': 3})
            self.fail('A successful write must immediately end the helper')
        record, model = self.run_with(choice, text)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(calls[0], 3)
        self.assertEqual(model.call_count, 1)
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'feed'), 3)
        self.assertIn('完成1笔交易', record.summary)

    def test_compact_context_is_smaller_and_all_crop_details_are_accessible(self):
        from .life_context import build_context
        from .life_scope import life_scope
        from .market_queries import actor_context
        from django.core.serializers.json import DjangoJSONEncoder
        life = build_context('admin', self.a)
        with life_scope(SimpleNamespace(pk='not-used', actor_id=self.a.pk, owner_id='admin'), life), \
             patch('system_settings.agent_world.market_spending.spending_context', return_value={'balance': '10000', 'spendable': '10000'}):
            compact = model_context('admin', self.a)
        old = {**actor_context('admin', self.a), 'life': life}
        encode = lambda value: json.dumps(value, cls=DjangoJSONEncoder, ensure_ascii=False)
        self.assertLess(len(encode(compact)), len(encode(old)))
        self.assertNotIn('cooking', compact['life'])
        details = observe('admin', self.a, {'topic': 'planting'})
        self.assertEqual(len(details['crop_comparisons']['items']), 16)
        self.assertIn('star_probabilities', details['crop_comparisons']['items'][0]['without_fertilizer'])

    def test_candidates_respect_cash_capacity_inventory_and_purchase_caps(self):
        self.a.money = Decimal('0')
        self.a.save()
        self.assertFalse(any(row['tool'].startswith('buy_') for row in candidates('admin', self.a)))
        self.a.money = Decimal('10000')
        self.a.save()
        choices = candidates('admin', self.a)
        self.assertFalse(any(row['arguments'].get('slot_id') == '1' for row in choices))
        seed = next(row for row in choices if row['arguments'].get('slot_id') == '0')
        self.assertEqual(seed['maximum'], 2)

    def test_sale_quantity_recovery_matches_exact_price_lots(self):
        from .inventory_stock import add_stock
        from .market_decision_candidates import quantities
        item = add_stock(self.a.pk, 'admin', self.a.name, 'crop.radish', 2, '萝卜', 'farm_crop', 18)
        add_stock(self.a.pk, 'admin', self.a.name, 'crop.radish', 3, '萝卜', 'farm_crop', 20)
        row = next(row for row in candidates('admin', self.a) if row['arguments'].get('item_id') == item.pk)
        choices = quantities(row)
        self.assertEqual(Decimal(choices['1']['total_revenue']), Decimal(18))
        self.assertEqual(Decimal(choices['5']['total_revenue']), Decimal(96))

    def test_stopped_session_is_not_revived_by_fallback(self):
        self.prepare()
        calls = [0]
        def choice(owner, state, criteria, **kwargs):
            calls[0] += 1
            if calls[0] == 1:
                return 'enter', .9
            close_session(MarketSession.objects.filter(actor_id=self.a.pk, status='active').get(), '已停止')
            raise DecisionUnavailable('JEV 故障')
        record, model = self.run_with(choice)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(model.call_count, 0)
        self.assertIn('已停止', record.summary)

    def test_market_config_partial_save_and_restore(self):
        path = f'/api/settings/agent-tasks/{self.task.pk}/'
        result = self.client.patch(path, {'marketConfig': {'decisionEnabled': True, 'decisionProvider': 'jev'}}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.task.refresh_from_db()
        self.assertTrue(self.task.market_config['decision_enabled'])
        self.assertEqual(self.task.market_config['owner_id'], 'admin')
        result = self.client.patch(path, {'prompt': '节约采购'}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.task.refresh_from_db()
        self.assertTrue(self.task.market_config['decision_enabled'])
        self.assertEqual(self.client.patch(path, {'marketConfig': {'decisionProvider': 'unknown'}}, format='json').status_code, 400)
        result = self.client.patch(path, {'marketConfig': {'ownerId': 'someone', 'decisionEnabled': False}}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.task.refresh_from_db()
        self.assertEqual(self.task.market_config['owner_id'], 'admin')
        self.assertFalse(self.task.market_config['decision_enabled'])

    def test_detail_pages_include_price_lots_and_history_without_cross_owner_access(self):
        from .inventory_stock import add_stock
        item = add_stock(self.a.pk, 'admin', self.a.name, 'crop.radish', 1, '萝卜', 'farm_crop', 18)
        item.source['lots'] = [{'quantity': 1, 'price': str(i + 1)} for i in range(23)]
        item.quantity = 23
        item.save()
        detail = observe('admin', self.a, {'topic': 'inventory_lots', 'item_id': item.pk, 'page': 2})
        self.assertEqual(detail['price_lots']['total'], 23)
        self.assertEqual(len(detail['price_lots']['items']), 3)
        with self.assertRaises(ValueError):
            observe('admin', self.b, {'topic': 'inventory_lots', 'item_id': item.pk})

    def test_life_detail_pages_do_not_inherit_initial_snapshot_truncation(self):
        from .life_models import LifeGoal
        for index in range(25):
            LifeGoal.objects.create(owner_id='admin', actor_id=self.a.pk, title=f'目标{index:02}')
        result = observe('admin', self.a, {'topic': 'life', 'page': 2})
        self.assertEqual(result['goals']['total'], 25)
        self.assertEqual(len(result['goals']['items']), 5)
        recipes = observe('admin', self.a, {'topic': 'cooking'})['recipes']
        self.assertGreater(recipes['total'], 0)
        self.assertIn('ingredients', recipes['items'][0])

    def test_dated_tool_projection_remains_json_for_history_compaction(self):
        from system_settings.models import AgentRunRecord
        from utils.ai_service import AIService
        from .market_model_execution import MarketExecution
        record = AgentRunRecord.objects.create(task=self.task, agent=self.a)
        runtime = MarketExecution(self.task, self.a, record, 'json-projection', 'manual')
        with patch('system_settings.agent_world.market_model_execution.call_market_tool',
                   return_value={'items': [{'created_at': self.now, 'value': Decimal('18.25')}] }):
            result = runtime.execute('get_my_market_listings', {})
        wire = json.loads(AIService._stringify_tool_result(result))
        self.assertEqual(wire['items'][0]['value'], '18.25')
        self.assertIsInstance(wire['items'][0]['created_at'], str)

    def test_candidate_pages_keep_every_option_and_exit_paths(self):
        self.prepare()
        rows = [{'id': f'item:{index}', 'tool': 'buy_market_shop', 'label': f'商品{index}',
                 'arguments': {'batch_id': self.shop.pk, 'slot_id': 'feed'}, 'maximum': 1,
                 'needed': 0, 'unit_price': '5', 'detail': {}} for index in range(43)]
        seen = set()
        def choose(owner, state, criteria, **kwargs):
            if 'enter' in criteria:
                return 'enter', .8
            if 'buy' in criteria:
                return 'buy', .8
            self.assertTrue({'wait', 'leave', 'other'} <= set(criteria))
            self.assertLessEqual(len(criteria), 255)
            seen.update(key for key in criteria if key.startswith('item:'))
            return ('next_page' if 'next_page' in criteria else 'leave'), .8
        with patch('system_settings.agent_world.market_decision_loop.candidates', return_value=rows):
            record, model = self.run_with(choose)
        self.assertEqual(seen, {row['id'] for row in rows})
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(model.call_count, 0)

    def test_jev_fault_at_call_limit_ends_without_text_fallback(self):
        self.prepare()
        def choose(owner, state, criteria, **kwargs):
            if 'enter' in criteria:
                return 'enter', .8
            session = MarketSession.objects.get(record__status='running', actor_id=self.a.pk)
            session.call_count = 20
            session.save(update_fields=['call_count'])
            raise DecisionUnavailable('服务故障')
        record, model = self.run_with(choose)
        self.assertEqual(model.call_count, 0)
        self.assertIn('二十次', record.summary)


class TranscriptTests(SimpleTestCase):
    def test_superseded_reads_keep_tool_pairs_and_failed_reads(self):
        messages = [{'role': 'user', 'content': json.dumps({'market_state': {'balance': 'old'}, 'completed_operations': []})}]
        for identity, payload in [('one', {'inventory': ['x' * 1000]}), ('bad', {'error': 'failed'}), ('two', {'balance': 'new'})]:
            messages.extend([{'role': 'assistant', 'tool_calls': [{'id': identity, 'function': {'name': 'get_market_context', 'arguments': '{}'}}]},
                             {'role': 'tool', 'tool_call_id': identity, 'content': json.dumps(payload)}])
        compact = compact_messages(messages)
        self.assertEqual(len(compact), len(messages))
        self.assertIn('superseded', compact[2]['content'])
        self.assertIn('failed', compact[4]['content'])
        self.assertIn('new', compact[6]['content'])
        self.assertNotIn('old', compact[0]['content'])
        self.assertIn('x' * 1000, messages[2]['content'])
