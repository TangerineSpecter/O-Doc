"""Market intent choices execute real isolated trades; all model calls are mocked."""
import json
from decimal import Decimal
from django.test import TestCase
from system_settings.models import WorldAction
from system_settings.decision.jev import DecisionUnavailable
from . import test_market_decision as decision_fixtures
from .inventory_stock import add_stock, stock_quantity
from .market_decision_candidates import candidates, quantities
from .market_decision_options import action_options
from .market_models import MarketListing, MarketSession, MarketTransaction
from .market_tools import call_market_tool
from .market_sessions import close_session


class MarketIntentTests(TestCase):
    setUp = decision_fixtures.MarketDecisionTests.setUp
    prepare = decision_fixtures.MarketDecisionTests.prepare
    run_with = decision_fixtures.MarketDecisionTests.run_with

    def stock(self, quantity=3, *, actor=None, sku='crop.radish', kind='farm_crop'):
        actor = actor or self.a
        return add_stock(actor.pk, 'admin', actor.name, sku, quantity, '萝卜', kind, 18)

    def listing(self):
        item = self.stock()
        result = call_market_tool('create_market_listing', {'item_id': item.pk, 'quantity': 2,
            'unit_price': '30', 'request_id': 'existing-listing'}, self.a)
        return MarketListing.objects.get(pk=result['listing_id'])

    def test_only_eligible_stock_and_own_active_listings_are_offered(self):
        crop = self.stock()
        souvenir = self.stock(sku='souvenir.test', kind='souvenir')
        seed = self.stock(sku='seed.radish', kind='farm_seed')
        foreign = self.stock(actor=self.b)
        call_market_tool('create_market_listing', {'item_id': foreign.pk, 'quantity': 1,
            'unit_price': '30', 'request_id': 'foreign-listing'}, self.b)
        rows = candidates('admin', self.a)
        listing_ids = {r['arguments']['item_id'] for r in rows if r['tool'] == 'create_market_listing'}
        sale_ids = {r['arguments']['item_id'] for r in rows if r['tool'] == 'sell_to_market_shop'}
        self.assertEqual(listing_ids, {crop.pk, souvenir.pk})
        self.assertEqual(sale_ids, {crop.pk})
        self.assertNotIn(seed.pk, listing_ids)
        self.assertEqual(set(action_options(rows)), {'buy', 'sell', 'list'})
        row = self.listing()
        managed = [r for r in candidates('admin', self.a) if r['tool'] in ('reprice_market_listing', 'withdraw_market_listing')]
        self.assertEqual(len(managed), 2)
        self.assertTrue(all(r['arguments'] == {'listing_id': row.pk, 'version': 1} for r in managed))
        row.status = 'withdrawn'
        row.save()
        self.assertNotIn('manage', action_options(candidates('admin', self.a)))

    def test_jev_can_recover_sale_without_text_or_purchase(self):
        self.stock()
        self.prepare()
        def choose(owner, state, criteria, **kwargs):
            if 'enter' in criteria:
                self.assertEqual(Decimal(state['available_actions']['sell']['examples'][0]['recovery_for_maximum']), Decimal('54'))
                return 'enter', .8
            if 'buy' in criteria:
                return ('sell' if 'sell' in criteria else 'leave'), .8
            if '1' in criteria:
                return '3', .8
            return next(key for key, row in criteria.items() if isinstance(row, dict) and row['label'] == '回收出售 萝卜'), .8
        record, text = self.run_with(choose)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(text.call_count, 0)
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'crop.radish'), 0)
        self.a.refresh_from_db()
        self.assertEqual(self.a.money, Decimal('10054'))
        self.assertEqual(MarketTransaction.objects.get(session__record=record).operation['kind'], 'sell')

    def test_listing_uses_jev_item_quantity_and_only_text_price(self):
        item = self.stock()
        self.prepare()
        count = [0]
        def choose(owner, state, criteria, **kwargs):
            count[0] += 1
            if 'enter' in criteria:
                return 'enter', .8
            if 'buy' in criteria:
                if count[0] == 5:
                    self.assertIn('manage', criteria)
                    return 'wait', .8
                self.assertIn('sell', criteria)
                self.assertIn('list', criteria)
                return 'list', .8
            if '1' in criteria:
                self.assertIsNone(criteria['1']['total_revenue'])
                return '1', .8
            return next(key for key, row in criteria.items() if isinstance(row, dict) and row['label'] == '上架 萝卜'), .8
        def price(messages, tools, execute, **kwargs):
            payload = json.loads(messages[1]['content'])
            selected = payload['selected_operation']
            self.assertEqual(selected['arguments']['item_id'], item.pk)
            self.assertEqual(selected['arguments']['quantity'], 1)
            names = {t['function']['name'] for t in tools}
            self.assertIn('create_market_listing', names)
            self.assertNotIn('buy_market_shop', names)
            self.assertNotIn('update_farm_queue', names)
            self.assertIn('error', execute('buy_market_shop', {}))
            self.assertIn('error', execute(selected['tool'], {**selected['arguments'], 'quantity': 2, 'unit_price': '30'}))
            execute(selected['tool'], {**selected['arguments'], 'unit_price': '30'})
            self.fail('Successful listing must return to JEV immediately')
        record, text = self.run_with(choose, price)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual((count[0], text.call_count), (5, 1))
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'crop.radish'), 2)
        self.a.refresh_from_db()
        self.assertEqual(self.a.money, Decimal('10000'))
        listing = MarketListing.objects.get()
        self.assertEqual((listing.remaining_quantity, listing.unit_price), (1, Decimal('30')))
        self.assertIn('完成0笔交易', record.summary)
        self.assertIn('尚未成交', record.summary)
        self.assertEqual(MarketTransaction.objects.filter(session__record=record).count(), 1)

    def test_manage_reprice_skips_quantity_and_returns_to_jev(self):
        listing = self.listing()
        self.prepare()
        def choose(owner, state, criteria, **kwargs):
            listing.refresh_from_db()
            if 'enter' in criteria:
                return 'enter', .8
            if 'buy' in criteria:
                if listing.version > 1:
                    self.assertEqual(criteria['manage']['examples'][0]['current_listing_price'], '35.00')
                    return 'wait', .8
                return 'manage', .8
            self.assertNotIn('1', criteria)
            return next(key for key, row in criteria.items() if isinstance(row, dict) and row['label'] == '改价 萝卜'), .8
        def price(messages, tools, execute, **kwargs):
            selected = json.loads(messages[1]['content'])['selected_operation']
            self.assertEqual(selected['arguments']['version'], 1)
            self.assertNotIn('quantity', selected['arguments'])
            execute(selected['tool'], {**selected['arguments'], 'unit_price': '35'})
        record, text = self.run_with(choose, price)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(text.call_count, 1)
        listing.refresh_from_db()
        self.assertEqual((listing.unit_price, listing.version, listing.remaining_quantity), (Decimal('35'), 2, 2))
        self.assertIn('调整挂牌价格', record.summary)

    def test_manage_withdraw_executes_in_code_without_text(self):
        listing = self.listing()
        self.prepare()
        def choose(owner, state, criteria, **kwargs):
            listing.refresh_from_db()
            if 'enter' in criteria:
                return 'enter', .8
            if 'buy' in criteria:
                if listing.status == 'withdrawn':
                    self.assertNotIn('manage', criteria)
                    self.assertIn('list', criteria)
                    return 'leave', .8
                return 'manage', .8
            return next(key for key, row in criteria.items() if isinstance(row, dict) and row['label'] == '撤回 萝卜'), .8
        record, text = self.run_with(choose)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(text.call_count, 0)
        listing.refresh_from_db()
        self.assertEqual(listing.status, 'withdrawn')
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'crop.radish'), 3)
        self.assertIn('撤回挂牌', record.summary)

    def test_stale_listing_version_returns_failure_to_jev_before_retry(self):
        listing = self.listing()
        self.prepare()
        attempts = [0]
        def choose(owner, state, criteria, **kwargs):
            listing.refresh_from_db()
            if 'enter' in criteria:
                return 'enter', .8
            if 'buy' in criteria:
                if attempts[0] == 1:
                    self.assertIn('已变化', state['last_failure']['error'])
                    self.assertEqual(listing.unit_price, Decimal('26'))
                return ('wait' if attempts[0] == 2 else 'manage'), .8
            row = next((key, row) for key, row in criteria.items() if isinstance(row, dict) and row['label'] == '改价 萝卜')
            self.assertEqual(row[1]['detail']['version'], listing.version)
            return row[0], .8
        def price(messages, tools, execute, **kwargs):
            attempts[0] += 1
            selected = json.loads(messages[1]['content'])['selected_operation']
            if attempts[0] == 1:
                listing.version += 1
                listing.unit_price = Decimal('26')
                listing.save()
            execute(selected['tool'], {**selected['arguments'], 'unit_price': '35'})
        record, text = self.run_with(choose, price)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(text.call_count, 2)
        listing.refresh_from_db()
        self.assertEqual((listing.unit_price, listing.version), (Decimal('35'), 3))
        self.assertEqual(MarketTransaction.objects.filter(session__record=record).count(), 1)

    def test_jev_fault_after_listing_falls_back_with_committed_fact_once(self):
        self.stock()
        self.prepare()
        calls = [0]
        def choose(owner, state, criteria, **kwargs):
            calls[0] += 1
            if calls[0] == 5:
                raise DecisionUnavailable('模拟JEV故障')
            if 'enter' in criteria:
                return 'enter', .8
            if 'buy' in criteria:
                return 'list', .8
            if '1' in criteria:
                return '1', .8
            return next(key for key, row in criteria.items() if isinstance(row, dict) and row['label'] == '上架 萝卜'), .8
        def text(messages, tools, execute, **kwargs):
            payload = json.loads(messages[1]['content'])
            if 'selected_operation' in payload:
                selected = payload['selected_operation']
                execute(selected['tool'], {**selected['arguments'], 'unit_price': '30'})
            else:
                self.assertEqual(payload['session']['status'], 'active')
                self.assertEqual(len(payload['completed_operations']), 1)
                self.assertEqual(payload['completed_operations'][0]['tool'], 'create_market_listing')
                self.assertIn('manage', payload['available_actions'])
                execute('leave_market', {'reason': '已上架，等待成交'})
        before = WorldAction.objects.filter(snapshot__market_energy=True).count()
        record, model = self.run_with(choose, text)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(model.call_count, 2)
        self.assertEqual(MarketListing.objects.count(), 1)
        self.assertEqual(MarketTransaction.objects.filter(session__record=record).count(), 1)
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True).count(), before + 1)

    def test_own_listing_management_pages_include_all_options(self):
        item = self.stock()
        for index in range(23):
            MarketListing.objects.create(id=f'own-{index}', owner_id='admin', seller_id=self.a.pk,
                seller_name=self.a.name, item={'name': item.name, 'source': item.source, 'quantity': 1},
                initial_quantity=1, remaining_quantity=1, unit_price='30')
        self.prepare()
        seen = set()
        def choose(owner, state, criteria, **kwargs):
            if 'enter' in criteria:
                self.assertEqual(state['available_actions']['manage']['feasible_items'], 46)
                self.assertEqual(len(state['available_actions']['manage']['examples']), 3)
                self.assertTrue(state['available_actions']['manage']['has_more'])
                return 'enter', .8
            if 'buy' in criteria:
                return 'manage', .8
            self.assertTrue({'wait', 'leave', 'other', 'change_action'} <= set(criteria))
            seen.update(key for key in criteria if key.startswith('item:'))
            return ('next_page' if 'next_page' in criteria else 'leave'), .8
        record, text = self.run_with(choose)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(len(seen), 46)
        self.assertEqual(text.call_count, 0)

    def test_stopped_session_prevents_selected_listing_write(self):
        self.stock()
        self.prepare()
        def choose(owner, state, criteria, **kwargs):
            if 'enter' in criteria:
                return 'enter', .8
            if 'buy' in criteria:
                return 'list', .8
            if '1' in criteria:
                return '1', .8
            return next(key for key, row in criteria.items() if isinstance(row, dict) and row['label'] == '上架 萝卜'), .8
        def price(messages, tools, execute, **kwargs):
            selected = json.loads(messages[1]['content'])['selected_operation']
            close_session(MarketSession.objects.get(record__status='running', actor_id=self.a.pk), '已停止')
            execute(selected['tool'], {**selected['arguments'], 'unit_price': '30'})
        record, text = self.run_with(choose, price)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertIn('已停止', record.summary)
        self.assertFalse(MarketListing.objects.exists())

    def test_twentieth_call_keeps_committed_listing_and_ends_execution(self):
        from .market_model_execution import MarketFinished
        self.stock()
        self.prepare()
        def choose(owner, state, criteria, **kwargs):
            if 'enter' in criteria:
                return 'enter', .8
            if 'buy' in criteria:
                return 'list', .8
            if '1' in criteria:
                return '1', .8
            return next(key for key, row in criteria.items() if isinstance(row, dict) and row['label'] == '上架 萝卜'), .8
        def price(messages, tools, execute, **kwargs):
            selected = json.loads(messages[1]['content'])['selected_operation']
            session = MarketSession.objects.get(record__status='running', actor_id=self.a.pk)
            session.call_count = 19
            session.save(update_fields=['call_count'])
            try:
                execute(selected['tool'], {**selected['arguments'], 'unit_price': '30'})
            except MarketFinished as exc:
                # AIService also catches expected_tool_stop after a committed twentieth call.
                return str(exc)
        before = WorldAction.objects.filter(snapshot__market_energy=True).count()
        record, text = self.run_with(choose, price)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertIn('二十次', record.summary)
        self.assertNotIn('未提交', record.summary)
        self.assertEqual(text.call_count, 1)
        self.assertEqual(MarketListing.objects.count(), 1)
        self.assertEqual(MarketTransaction.objects.filter(session__record=record).count(), 1)
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'crop.radish'), 2)
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True).count(), before + 1)

    def test_text_only_receives_sale_listing_and_management_summary(self):
        self.listing()
        self.prepare()
        self.task.market_config['decision_enabled'] = False
        self.task.save()
        def text(messages, tools, execute, **kwargs):
            payload = json.loads(messages[1]['content'])
            self.assertEqual(set(payload['available_actions']), {'buy', 'sell', 'list', 'manage'})
            self.assertEqual(Decimal(payload['available_actions']['sell']['examples'][0]['recovery_for_one']), Decimal('18'))
            names = {t['function']['name'] for t in tools}
            self.assertTrue({'create_market_listing', 'sell_to_market_shop', 'reprice_market_listing', 'withdraw_market_listing'} <= names)
        record, model = self.run_with(lambda *args, **kwargs: self.fail('JEV disabled'), text)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(model.call_count, 1)
        self.assertTrue(model.call_args.kwargs['disable_thinking'])

    def test_full_mature_farm_without_plan_can_restock_seeds(self):
        import copy
        from .farm_models import AgentFarm
        from .farm_catalog import DEFAULT_RULES
        from .market_model_context import model_context
        from .market_shopping import SEED_GUIDANCE
        farm = AgentFarm.objects.get(pk=self.a.pk)
        rule = DEFAULT_RULES['crops']['radish']
        for plot in farm.state['plots']:
            plot['crop'] = {'kind': 'radish', 'grown': rule['growth_seconds'], 'rules': copy.deepcopy(rule),
                            'planted_at': self.now.timestamp(), 'checked_at': self.now.timestamp()}
        farm.save()
        original = copy.deepcopy(farm.state)
        context = model_context('admin', self.a)
        self.assertIsNone(context['farm_queue'])
        self.assertEqual(context['farm']['empty_plots'], 0)
        self.assertEqual(context['farm']['harvest_ready'], len(farm.state['plots']))
        self.assertEqual(context['farm']['seed_quantity'], 0)
        self.assertEqual(context['farm']['next_round_seed_reference'], len(farm.state['plots']))
        self.shop.slots[0]['remaining_quantity'] = self.shop.slots[0]['initial_quantity'] = 10
        self.shop.save()
        candidate = next(row for row in candidates('admin', self.a) if row['arguments'].get('slot_id') == '0')
        self.assertIn(str(len(farm.state['plots'])), quantities(candidate))
        self.prepare()
        self.task.market_config['decision_enabled'] = False
        self.task.save()
        def shop(messages, tools, execute, **kwargs):
            self.assertIn(SEED_GUIDANCE, messages[0]['content'])
            self.assertNotIn('update_farm_queue', {t['function']['name'] for t in tools})
            execute('enter_market', {})
            execute('buy_market_shop', {'request_id': 'next-round', 'batch_id': self.shop.pk,
                                       'slot_id': '0', 'quantity': 2})
            execute('leave_market', {'reason': '为下一轮备好种子'})
        record, _ = self.run_with(lambda *args, **kwargs: self.fail('JEV disabled'), shop)
        self.assertEqual(record.status, 'success', record.summary)
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'seed.radish'), 2)
        farm.refresh_from_db()
        self.assertEqual(farm.state, original)
        self.assertEqual(model_context('admin', self.a)['farm']['next_round_seed_reference'], len(farm.state['plots']) - 2)

    def test_jev_receives_optional_seed_reserve_guidance(self):
        self.prepare()
        def choose(owner, state, criteria, **kwargs):
            self.assertIn('不限制采购', state['resident']['shopping_guidance'])
            self.assertIn('不是购买要求', state['resident']['shopping_guidance'])
            self.assertEqual(state['market']['farm']['seed_quantity'], 0)
            self.assertGreater(state['market']['farm']['next_round_seed_reference'], 0)
            return 'wait', .8
        record, model = self.run_with(choose)
        self.assertEqual(record.status, 'success')
        self.assertFalse(MarketSession.objects.filter(record=record).exists())
        self.assertEqual(model.call_count, 0)

    def test_recipe_list_is_small_and_full_selected_details_remain_available(self):
        from .market_model_context import observe
        from .cooking_queries import recipes
        raw = recipes('admin', self.a)
        summary = observe('admin', self.a, {'topic': 'cooking'})
        self.assertEqual(summary['recipes']['total'], len(raw))
        self.assertNotIn('description', summary['recipes']['items'][0])
        self.assertNotIn('quality_previews', summary['recipes']['items'][0])
        self.assertLess(len(json.dumps(summary)), len(json.dumps(raw)) // 2)
        first = summary['recipes']['items'][0]
        detail = observe('admin', self.a, {'topic': 'recipe', 'recipe_id': first['id']})['recipe']
        self.assertEqual(detail['ingredients'], first['ingredients'])
        self.assertEqual(detail['description'], raw[0]['description'])
        self.assertIn('sale_price', detail)
        with self.assertRaisesMessage(ValueError, '食谱不存在'):
            observe('admin', self.a, {'topic': 'recipe', 'recipe_id': 'nonexistent'})

    def test_detail_diagnostics_record_topic_and_size_without_query_body(self):
        self.prepare()
        self.task.market_config['decision_enabled'] = False
        self.task.save()
        def read(messages, tools, execute, **kwargs):
            execute('enter_market', {})
            execute('observe_market_detail', {'topic': 'planting', 'page': 1, 'search': '萝卜'})
            execute('leave_market', {'reason': 'farm_queue不可虚构种植计划'})
        record, _ = self.run_with(lambda *args, **kwargs: self.fail('JEV disabled'), read)
        self.assertEqual(record.status, 'success')
        steps = record.steps
        query = next(s for s in steps if s['title'] == '市场工具 observe_market_detail')
        self.assertIn('种子与肥料', query['detail'])
        returned = next(s for s in steps if s['title'] == '市场详情返回')
        self.assertIn('字符（非Token数）', returned['detail'])
        self.assertNotIn('萝卜', returned['detail'])
        reason = MarketSession.objects.get(record=record).reason
        self.assertNotIn('farm_queue', reason)
        self.assertNotIn('不可虚构', reason)
        self.assertIn('未成交', reason)
