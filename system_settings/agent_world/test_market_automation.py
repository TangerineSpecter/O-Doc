import json
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from system_settings.models import Agent, AgentTask, SystemSetting, WorldActionRuntime

from . import market_batch
from .combat.models import EquipmentInstance
from .inventory_stock import add_stock, inventory_items
from .life_time import local_time, storage_time
from .market_disposition import (aggregate, enqueue, select_rows, surplus_plan)
from .market_disposition_worker import run as run_worker
from .market_models import MarketIntegrity, MarketListing
from .market_no_buy import clear_equipment, filter_candidates, record
from .market_plan_models import (MarketDisposition, MarketDispositionTask, MarketGoal,
                                 MarketNoBuy, MarketPlan, MarketTick)
from . import market_planning
from .market_plan_candidates import (bait_exact_quantities, bait_quantity_ranges,
                                     price_options, quantity_options)
from .market_planning import ensure_plan, validate_plan
from .market_sync import CORE_ASSET_MODELS, fingerprints, normalize_legacy_dates
from .market_tick import run as run_ticks
from .market_tick import stable_minute
from .life_models import LifeItem
from .market_models import MarketTransaction
from .market_shop import current_batch
from .market_disposition_worker import recover_stale_tasks


class MarketAutomationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser('admin', 'market@example.invalid', 'market-test')
        self.a = Agent.objects.create(name='A', money=10000)
        self.b = Agent.objects.create(name='B', money=10000)
        self.task = AgentTask.objects.create(
            id='builtin-market', name='市场交易', task_kind='market', agent=self.a,
            agent_ids=[self.a.pk, self.b.pk], enabled=True,
            market_config={'owner_id': 'admin'})
        SystemSetting.objects.create(key='system_mcp_config', value={'enabled': True})
        WorldActionRuntime.objects.create(pk='world', enabled=True)
        self.now = timezone.now()

    def stock(self, sku='dish.stew', quantity=10, stars=5, price='10', key='op'):
        add_stock(self.a.pk, 'admin', 'A', sku, quantity, '炖菜', 'dish',
                  price, key, stars=stars)

    def test_tradable_includes_elixir_and_material(self):
        from .market_service import tradable
        class Item:
            kind = 'elixir'
            source = {'sku': 'elixir.heal'}
        self.assertTrue(tradable(Item()))
        Item.source = {'sku': 'combat.material.slime'}
        self.assertTrue(tradable(Item()))

    def test_enqueue_is_idempotent_and_aggregates(self):
        self.stock(quantity=4)
        first = enqueue('admin', self.a.pk, 'dish.stew', 4, source='cooking', operation='cook-1')
        second = enqueue('admin', self.a.pk, 'dish.stew', 3, source='cooking', operation='cook-1')
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(MarketDispositionTask.objects.count(), 1)
        self.assertEqual(MarketDispositionTask.objects.get().quantity, 7)

    def test_surplus_and_star_order(self):
        self.stock(quantity=6, stars=1, key='low')
        self.stock(quantity=4, stars=5, key='high')
        MarketDisposition.objects.create(
            owner_id='admin', actor_id=self.a.pk, sku='dish.stew',
            target_hold=2, sell_ratio=50, list_ratio=50, star_order='high')
        plan = surplus_plan('admin', self.a.pk, 'dish.stew')
        self.assertEqual((plan['total'], plan['surplus'], plan['sell'], plan['list']), (10, 8, 4, 4))
        selected = select_rows('admin', self.a.pk, 'dish.stew', 5, 'high')
        self.assertEqual(sum(take for _, take in selected), 5)
        self.assertEqual(selected[0][0].source['stars'], 5)

    def test_worker_uses_split_questions(self):
        self.stock(quantity=10, stars=5, key='cook-1')
        enqueue('admin', self.a.pk, 'dish.stew', 10, source='cooking', operation='cook-1')

        def fake(owner, agent, scene, state, choices, **kwargs):
            key = kwargs['question_id'].rsplit(':', 1)[-1]
            if key == 'hold':
                return '0'
            if key == 'channel':
                return 'sell'
            if key == 'price':
                return '1.00'
            return next(iter(choices))

        with patch('system_settings.agent_world.market_disposition_worker.choose_scene', side_effect=fake):
            run_worker(limit=20, seconds=30)
        policy = MarketDisposition.objects.get(owner_id='admin', actor_id=self.a.pk, sku='dish.stew')
        self.assertEqual(policy.target_hold, 0)
        self.assertEqual((policy.sell_ratio, policy.list_ratio), (100, 0))
        self.assertEqual(policy.status, 'active')
        self.assertEqual(MarketDispositionTask.objects.get().status, 'done')

    def test_worker_defaults_to_review_when_model_unavailable(self):
        self.stock(quantity=6, key='cook-2')
        enqueue('admin', self.a.pk, 'dish.stew', 6, source='cooking', operation='cook-2')
        with patch('system_settings.agent_world.market_disposition_worker.choose_scene', return_value=None):
            run_worker(limit=20, seconds=30)
        policy = MarketDisposition.objects.get(owner_id='admin', actor_id=self.a.pk, sku='dish.stew')
        self.assertEqual(policy.status, 'review')
        self.assertEqual(policy.target_hold, 6)
        self.assertEqual(MarketDispositionTask.objects.get().status, 'done')

    def test_equipment_no_buy_filter_and_cleanup(self):
        gear = EquipmentInstance.objects.create(
            pk='gear-1', owner_id='admin', actor_id=self.a.pk, catalog_id='v1',
            template_id='sword', snapshot={'name': '长剑', 'slot': 'weapon', 'level': 1,
                                          'job_levels': {'job.warrior': 1}}, value=Decimal('100'),
            rules={'slot': 'weapon', 'job_levels': {'job.warrior': 1}})
        record('admin', self.a.pk, gear.pk, snapshot=gear.snapshot, price=100)
        self.assertTrue(MarketNoBuy.objects.filter(owner_id='admin', actor_id=self.a.pk, equipment_id=gear.pk).exists())
        rows = [{'equipment_id': gear.pk, 'snapshot': gear.snapshot}]
        self.assertEqual(filter_candidates('admin', self.a.pk, rows, 'job.warrior', 1), [])
        clear_equipment(gear.pk)
        self.assertFalse(MarketNoBuy.objects.filter(owner_id='admin', actor_id=self.a.pk, equipment_id=gear.pk).exists())

    def test_candidate_filter_uses_wear_rules_and_improvement(self):
        rules = {'version': 1, 'slot': 'weapon', 'equipment_type': 'sword', 'grip': 'one_handed',
                 'job_levels': {'job.warrior': 5}}
        snapshot = {'name': '长剑', 'slot': 'weapon', 'level': 1,
                    'stats': {'physical_attack': 10}}
        rows = [{'equipment_id': 'gear-rule', 'snapshot': snapshot, 'rules': rules}]
        self.assertEqual(filter_candidates('admin', self.a.pk, rows, 'job.mage', 10), [])
        self.assertEqual(filter_candidates('admin', self.a.pk, rows, 'job.warrior', 4), [])
        self.assertEqual(len(filter_candidates('admin', self.a.pk, rows, 'job.warrior', 5)), 1)
        current = {'stats': {'physical_attack': 20}}
        self.assertEqual(filter_candidates('admin', self.a.pk, rows, 'job.warrior', 5,
                                           slot='weapon', current=current), [])

    def test_plan_validation_clamps_budget_and_rejects_unknown_sku(self):
        context = {'available_budget': '100.00', 'tradable_skus': ['dish.stew'],
                   'equipment': {'slots': ['weapon']}}
        result = validate_plan({'budget': '200', 'summary': '测试', 'goals': [
            {'kind': 'shop', 'sku': 'seed.radish', 'quantity': 2, 'max_unit_price': '3'},
            {'kind': 'equipment', 'slot': 'weapon', 'quantity': 1, 'max_unit_price': '50'},
        ]}, context, {'seed.radish'})
        self.assertEqual(result['budget'], '100.00')
        self.assertEqual(len(result['goals']), 2)
        with self.assertRaises(ValueError):
            validate_plan({'budget': '1', 'goals': [
                {'kind': 'listing', 'sku': 'dish.unknown', 'quantity': 1, 'max_unit_price': '1'}]},
                context, {'seed.radish'})

    def test_stable_minute_is_deterministic_and_before_boundary(self):
        hour = timezone.now().replace(minute=0, second=0, microsecond=0)
        first = stable_minute('admin', self.a.pk, hour)
        self.assertEqual(first, stable_minute('admin', self.a.pk, hour))
        self.assertGreaterEqual(first, 1)
        self.assertLessEqual(first, 54)

    def test_legacy_market_checkpoint_is_rebuilt_once(self):
        legacy = fingerprints('admin', legacy=True, models=CORE_ASSET_MODELS)
        MarketIntegrity.objects.create(pk='admin', hashes=legacy)
        normalize_legacy_dates()
        row = MarketIntegrity.objects.get(pk='admin')
        self.assertEqual(set(row.hashes), set(fingerprints('admin')))
        self.assertIn('MarketPlan', ' '.join(row.hashes))

    def test_aggregate_groups_by_sku(self):
        self.stock(quantity=3, key='a')
        self.stock(quantity=4, key='b')
        entry = next(row for row in aggregate('admin', self.a.pk) if row['sku'] == 'dish.stew')
        self.assertEqual(entry['quantity'], 7)
        self.assertEqual(sum(entry['stars'].values()), 7)
        self.assertTrue(inventory_items(self.a.pk, 'admin').exists())

    def test_combat_material_sale_uses_catalog_id(self):
        add_stock(self.a.pk, 'admin', 'A', 'combat.material.moss_cave.1', 3, '黏液',
                  'combat_material', '1.04', 'loot', stars=1)
        operations = market_batch._sell_operation(
            'admin', self.a.pk, 'combat.material.moss_cave.1', 2, 'low')
        self.assertEqual(operations, [{'kind': 'sell_combat_material',
                                       'material_id': 'material.moss_cave.1',
                                       'quantity': 2}])

    def test_goal_listing_filter_matches_stars_in_json(self):
        MarketListing.objects.create(
            pk='listing-star', owner_id='admin', seller_id=self.b.pk, seller_name='B',
            item={'name': '炖菜', 'value': '10', 'source': {'sku': 'dish.stew', 'stars': 3}},
            initial_quantity=2, remaining_quantity=2, unit_price=Decimal('12'), status='active')
        rows = MarketListing.objects.filter(item__source__sku='dish.stew',
                                            item__source__stars__gte=3)
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.filter(item__source__stars__gte=4).count(), 0)

    def test_reprice_stops_at_recovery_price_and_runs_once_a_day(self):
        old = timezone.now() - timedelta(days=3)
        listing = MarketListing.objects.create(
            pk='listing-stale', owner_id='admin', seller_id=self.a.pk, seller_name='A',
            item={'name': '炖菜', 'value': '10', 'source': {'sku': 'dish.stew'}},
            initial_quantity=2, remaining_quantity=2, unit_price=Decimal('12'),
            status='active', created_at=old)
        plan = self.plan()
        actions = market_batch.build_actions('admin', self.a.pk, plan, timezone.now())
        self.assertEqual([row['unit_price'] for row in actions['reprices']], ['10.80'])
        listing.repriced_at = timezone.now()
        listing.save(update_fields=['repriced_at'])
        self.assertEqual(market_batch.build_actions('admin', self.a.pk, plan, timezone.now())['reprices'], [])
        listing.unit_price = Decimal('10')
        listing.repriced_at = old
        listing.save(update_fields=['unit_price', 'repriced_at'])
        self.assertEqual(market_batch.build_actions('admin', self.a.pk, plan, timezone.now())['reprices'], [])

    def plan_facts(self):
        MarketListing.objects.get_or_create(pk='plan-facts-stew', defaults={
            'owner_id': 'admin', 'seller_id': self.b.pk, 'seller_name': 'B',
            'item': {'name': '家常炖菜', 'source': {'sku': 'dish.stew', 'stars': 4}},
            'initial_quantity': 2, 'remaining_quantity': 2, 'unit_price': Decimal('5.20')})
        return {
            'available': '100.00',
            'needs': [
                {'key': 'seed:seed.carrot', 'kind': 'seed', 'sku': 'seed.carrot',
                 'name': '胡萝卜种子', 'missing': 4, 'owned': 0,
                 'unit_price': Decimal('3.00'), 'unit': '份'},
                {'key': 'fertilizer:fertilizer.yield', 'kind': 'fertilizer',
                 'sku': 'fertilizer.yield', 'name': '增产肥', 'missing': 2, 'owned': 1,
                 'unit_price': Decimal('35.00'), 'unit': '袋', 'effect': '每袋约 +25% 产量'},
            ],
            'listings': [{'sku': 'dish.stew', 'name': '家常炖菜', 'count': 2,
                          'min_price': Decimal('5.20'), 'max_stars': 4,
                          'value': Decimal('4.50'),
                          'star_quotes': {4: {'count': 2, 'min_price': Decimal('5.20')}}}],
            'equipment': [{'slot': 'body', 'count': 1, 'min_price': Decimal('18.00')}],
            'shop_skus': {'seed.carrot', 'fertilizer.yield', 'feed'},
            'signature': 'sig-1',
        }

    def test_quantity_and_price_options_stay_small(self):
        choices, meta = quantity_options(4, '1.50', '60.00', unit='袋', owned=1)
        self.assertEqual(sorted(int(key) for key in choices), [0, 2, 4, 5, 6])
        self.assertEqual(meta['4']['cost'], '6.00')
        self.assertTrue(all(len(label) < 40 for label in choices.values()))
        choices, _ = quantity_options(10, '10.00', '25.00', unit='袋')
        self.assertEqual(list(choices), ['0'])
        choices, meta = price_options('5.20')
        self.assertEqual(set(meta), {'0', '5.20', '5.72', '6.24'})
        self.assertEqual(choices['0'], '不追，等更合适的')

    def test_bait_two_rounds_cover_partial_last_range_and_budget(self):
        ranges, bounds = bait_quantity_ranges(15, '1.00', '1000.00')
        self.assertEqual(len(ranges), 9)
        self.assertEqual(bounds['80-84'], (80, 84))
        self.assertNotIn('90-99', ranges)
        self.assertEqual(list(bait_exact_quantities(*bounds['80-84'], '1.00', 7)),
                         ['80', '81', '82', '83', '84'])
        ranges, bounds = bait_quantity_ranges(0, '2.00', '33.00')
        self.assertEqual(bounds['10-16'], (10, 16))
        self.assertEqual(len(bait_exact_quantities(*bounds['0-9'], '2.00', 12)), 10)

    def test_daily_plan_bait_uses_two_cached_decisions(self):
        facts = {**self.plan_facts(), 'available': '1000.00',
                 'needs': [{'key': 'bait:bait.worm', 'kind': 'bait', 'sku': 'bait.worm',
                            'name': '蚯蚓', 'missing': 7, 'owned': 15,
                            'unit_price': Decimal('1.00'), 'unit': '份', 'effect': '可钓：鲫鱼'}],
                 'listings': [], 'equipment': [], 'shop_skus': {'bait.worm'}}
        seen = []

        def choose(owner, agent, scene, state, choices, **kwargs):
            seen.append((kwargs['question_id'], list(choices)))
            return '80-84' if 'bait-range:' in kwargs['question_id'] else '84'

        with patch.object(market_planning, '_facts', return_value=facts), \
             patch.object(market_planning, 'choose_scene', side_effect=choose):
            plan = ensure_plan('admin', self.a.pk, self.now)
        self.assertEqual(len(seen), 2)
        self.assertTrue(all(len(choices) <= 10 for _, choices in seen))
        self.assertEqual(list(plan.goals.values_list('sku', 'quantity')), [('bait.worm', 84)])
        self.assertEqual(plan.context['answers']['bait-range:bait.worm'], '80-84')
        self.assertEqual(plan.context['answers']['bait-quantity:bait.worm:80-84'], '84')

    def test_hourly_queue_refresh_does_not_bypass_bait_decision(self):
        plan = self.plan()
        bait = {'kind': 'bait', 'sku': 'bait.worm', 'missing': 12,
                'owned': 0, 'unit_price': Decimal('1.00'), 'unit': '份', 'name': '蚯蚓'}
        with patch.object(market_planning, 'need_rows', return_value=[bait]), \
             patch.object(market_planning, 'queue_purchase_room', return_value=Decimal('100')):
            self.assertEqual(market_planning.refresh_queue_needs('admin', self.a.pk, self.now), 0)
        self.assertFalse(plan.goals.exists())

    def test_need_rows_aggregates_duplicates_and_uses_quotes(self):
        from . import market_plan_candidates as candidates
        queue = {'entries': [
            {'sku': 'seed.radish', 'missing_seeds': 2, 'fertilizer': 'yield', 'missing_fertilizer': 1},
            {'sku': 'seed.radish', 'missing_seeds': 3, 'fertilizer': 'yield', 'missing_fertilizer': 2}]}
        shop = {'slots': [{'sku': 'seed.radish', 'price': '10.00'}],
                'supplies': [{'sku': 'fertilizer.yield', 'price': '35.00'}],
                'feed': {'price': '1.00'}}
        with patch('system_settings.agent_world.farm_queue_plan.overview', return_value=queue), \
             patch.object(candidates, 'shop_payload', return_value=shop), \
             patch.object(candidates, 'stock_quantity', return_value=1):
            rows = candidates.need_rows('admin', self.a, self.now)
        seed = next(row for row in rows if row['kind'] == 'seed')
        fertilizer = next(row for row in rows if row['kind'] == 'fertilizer')
        self.assertEqual((seed['missing'], seed['owned'], seed['unit_price']),
                         (5, 1, Decimal('10.00')))
        self.assertEqual(fertilizer['missing'], 3)
        self.assertIn('+25%', fertilizer['effect'])

    def test_daily_plan_uses_decision_options_without_text_model(self):
        sizes = []

        def fake(owner, agent, scene, state, choices, **kwargs):
            sizes.append(len(json.dumps(state, ensure_ascii=False))
                         + len(json.dumps(choices, ensure_ascii=False)))
            question = kwargs['question_id']
            if ':seed:' in question:
                return '4'
            if ':fertilizer:' in question:
                return '2'
            if ':listing:' in question:
                return '5.72'
            return '0'

        with patch.object(market_planning, '_facts', return_value=self.plan_facts()), \
             patch.object(market_planning, 'choose_scene', side_effect=fake) as decision, \
             patch('system_settings.decision.routing.complete_json') as text:
            plan = ensure_plan('admin', self.a.pk, self.now)
        text.assert_not_called()
        self.assertEqual(decision.call_count, 4)
        self.assertTrue(all(size <= 1200 for size in sizes))
        plan.refresh_from_db()
        self.assertEqual(plan.status, 'active', plan.summary)
        self.assertEqual(plan.budget, Decimal('87.72'))
        goals = {goal.kind + ':' + (goal.sku or goal.slot): goal for goal in plan.goals.all()}
        self.assertEqual(goals['shop:seed.carrot'].quantity, 4)
        self.assertEqual(goals['shop:fertilizer.yield'].quantity, 2)
        self.assertEqual(goals['listing:dish.stew'].max_unit_price, Decimal('5.72'))
        self.assertEqual(goals['listing:dish.stew'].min_stars, 4)
        self.assertNotIn('equipment:body', goals)
        self.assertIn('胡萝卜种子', plan.summary)

    def test_daily_plan_falls_back_without_paid_model(self):
        with patch.object(market_planning, '_facts', return_value=self.plan_facts()), \
             patch.object(market_planning, 'choose_scene', return_value=None), \
             patch('system_settings.decision.routing.complete_json') as text:
            plan = ensure_plan('admin', self.a.pk, self.now)
        text.assert_not_called()
        plan.refresh_from_db()
        self.assertEqual(plan.status, 'active')
        self.assertEqual(plan.goals.count(), 0)
        self.assertEqual(plan.budget, Decimal('0'))
        self.assertEqual(plan.context['fallback'], 'decision_unavailable')
        self.assertIn('决策模型不可用', plan.summary)

    def test_daily_plan_reuses_cached_answers_after_retry(self):
        def fake(owner, agent, scene, state, choices, **kwargs):
            question = kwargs['question_id']
            if ':seed:' in question:
                return '4'
            if ':fertilizer:' in question:
                return '2'
            if ':listing:' in question:
                return '5.72'
            return '0'

        with patch.object(market_planning, '_facts', return_value=self.plan_facts()), \
             patch.object(market_planning, 'choose_scene', side_effect=fake):
            plan = ensure_plan('admin', self.a.pk, self.now)
        plan.refresh_from_db()
        plan.status = 'planning'
        plan.save(update_fields=['status'])
        # auto_now 会覆盖显式赋值，这里用 queryset 更新模拟“规划超时”。
        MarketPlan.objects.filter(pk=plan.pk).update(
            updated_at=timezone.now() - timedelta(minutes=11))
        with patch.object(market_planning, '_facts', return_value=self.plan_facts()), \
             patch.object(market_planning, 'choose_scene', side_effect=fake) as decision:
            ensure_plan('admin', self.a.pk, self.now)
        decision.assert_not_called()
        plan.refresh_from_db()
        self.assertEqual(plan.status, 'active')

    def yesterday_equipment_plan(self, price='20.00') -> MarketPlan:
        yesterday = MarketPlan.objects.create(
            pk='plan-yesterday', owner_id='admin', actor_id=self.a.pk, actor_name='A',
            plan_date=local_time(self.now).date() - timedelta(days=1),
            status='active', budget=Decimal(price), equipment_signature='sig-1')
        MarketGoal.objects.create(
            pk='goal-carry', owner_id='admin', actor_id=self.a.pk, plan=yesterday,
            kind='equipment', slot='body', min_stars=1, quantity=1,
            max_unit_price=Decimal(price), deadline=timezone.now() + timedelta(days=1),
            status='open')
        return yesterday

    def test_carried_equipment_goal_extends_budget(self):
        self.yesterday_equipment_plan('20.00')
        facts = {'available': '100.00', 'needs': [], 'listings': [], 'equipment': [],
                 'shop_skus': set(), 'signature': 'sig-1'}
        with patch.object(market_planning, '_facts', return_value=facts), \
             patch.object(market_planning, 'choose_scene') as decision:
            plan = ensure_plan('admin', self.a.pk, self.now)
        decision.assert_not_called()
        plan.refresh_from_db()
        self.assertEqual(plan.budget, Decimal('20.00'))
        self.assertEqual(plan.goals.filter(kind='equipment', slot='body').count(), 1)
        self.assertIn('沿用昨日装备目标', plan.summary)

    def test_carried_equipment_goal_skipped_without_room(self):
        self.yesterday_equipment_plan('20.00')
        facts = {'available': '10.00', 'needs': [], 'listings': [], 'equipment': [],
                 'shop_skus': set(), 'signature': 'sig-1'}
        with patch.object(market_planning, '_facts', return_value=facts), \
             patch.object(market_planning, 'choose_scene'):
            plan = ensure_plan('admin', self.a.pk, self.now)
        plan.refresh_from_db()
        self.assertEqual(plan.budget, Decimal('0'))
        self.assertEqual(plan.goals.count(), 0)
        self.assertNotIn('沿用昨日装备目标', plan.summary)

    def test_validate_plan_rejects_goals_over_budget(self):
        context = {'available_budget': '100.00', 'tradable_skus': [],
                   'equipment': {'slots': ['body']}}
        with self.assertRaises(ValueError):
            validate_plan({'budget': '5.00', 'summary': '', 'goals': [
                {'kind': 'shop', 'sku': 'seed.carrot', 'quantity': 2,
                 'max_unit_price': '3.00'}]}, context, {'seed.carrot'})

    def plan(self, budget='100') -> MarketPlan:
        return MarketPlan.objects.create(
            pk='plan-test', owner_id='admin', actor_id=self.a.pk, actor_name='A',
            plan_date=local_time(self.now).date(), status='active', budget=Decimal(budget))

    def tick(self, plan: MarketPlan) -> MarketTick:
        now = timezone.now()
        hour = storage_time(local_time(now).replace(minute=0, second=0, microsecond=0))
        return MarketTick.objects.create(pk='tick-test', owner_id='admin', actor_id=self.a.pk,
                                         hour=hour, scheduled_at=now)

    def purchase_actions(self, plan, *, quote='100'):
        batch = current_batch('admin', self.now)
        batch.feed_price = Decimal('100')
        batch.save(update_fields=['feed_price'])
        goal = MarketGoal.objects.create(
            pk='feed-goal', owner_id='admin', actor_id=self.a.pk, plan=plan,
            kind='shop', sku='feed', quantity=1, max_unit_price=Decimal(quote))
        return {'goals': [{'kind': 'buy_shop', 'batch_id': batch.pk, 'slot_id': 'feed',
                           'quantity': 1, 'unit_price': quote, '_goal': goal.pk}]}, goal

    def test_purchase_preserves_new_life_reservations(self):
        plan = self.plan()
        actions, goal = self.purchase_actions(plan)
        # Keep the trip's energy commitment valid so this test reaches the money reservation check.
        AgentTask.objects.create(name='旅行', task_kind='travel', enabled=True, agent=self.a,
            agent_ids=[self.a.pk], travel_config={'owner_id': 'admin', 'energy_cost': 20})
        LifeItem.objects.create(pk='future-trip', owner_id='admin', actor_id=self.a.pk,
                                original_at=self.now, scheduled_at=self.now,
                                activity='travel', budget=Decimal('9950'))
        result = market_batch.execute('admin', self.a, plan, self.tick(plan), actions, self.now)
        self.assertEqual(len(result['failed']), 1)
        self.assertIn('预留', result['failed'][0]['reason'])
        self.a.refresh_from_db(); plan.refresh_from_db(); goal.refresh_from_db()
        self.assertEqual((self.a.money, plan.spent, goal.filled_quantity), (10000, 0, 0))
        self.assertFalse(MarketTransaction.objects.exists())
        self.assertFalse(inventory_items(self.a.pk, 'admin').filter(source__sku='feed').exists())

    def test_purchase_replay_updates_plan_and_goal_only_once(self):
        plan = self.plan()
        actions, goal = self.purchase_actions(plan)
        tick = self.tick(plan)
        for _ in range(2):
            result = market_batch.execute('admin', self.a, plan, tick, actions, self.now)
            self.assertEqual(result['failed'], [])
        self.a.refresh_from_db(); plan.refresh_from_db(); goal.refresh_from_db()
        self.assertEqual((self.a.money, plan.spent, goal.filled_quantity), (9900, 100, 1))
        self.assertEqual(MarketTransaction.objects.count(), 1)
        self.assertEqual(inventory_items(self.a.pk, 'admin').get(source__sku='feed').quantity, 1)
        self.assertEqual(actions['goals'][0]['_goal'], goal.pk)

    def test_actual_price_above_budget_rolls_back_purchase(self):
        plan = self.plan(budget='50')
        actions, goal = self.purchase_actions(plan, quote='10')
        result = market_batch.execute('admin', self.a, plan, self.tick(plan), actions, self.now)
        self.assertEqual(len(result['failed']), 1)
        self.assertIn('实际成交金额', result['failed'][0]['reason'])
        self.a.refresh_from_db(); plan.refresh_from_db(); goal.refresh_from_db()
        self.assertEqual((self.a.money, plan.spent, goal.filled_quantity), (10000, 0, 0))
        self.assertFalse(MarketTransaction.objects.exists())
        self.assertFalse(inventory_items(self.a.pk, 'admin').filter(source__sku='feed').exists())

    def test_fertilizer_goal_buys_constant_supply_without_stock_field(self):
        plan = self.plan(budget='1000')
        batch = current_batch('admin', self.now)
        supply = batch.supplies[0]
        self.assertNotIn('remaining_quantity', supply)
        goal = MarketGoal.objects.create(
            pk='fertilizer-goal', owner_id='admin', actor_id=self.a.pk, plan=plan,
            kind='shop', sku=supply['sku'], quantity=2, max_unit_price=Decimal(supply['price']))
        actions = market_batch.build_actions('admin', self.a.pk, plan, self.now)
        result = market_batch.execute('admin', self.a, plan, self.tick(plan), actions, self.now)
        self.assertEqual(result['failed'], [])
        goal.refresh_from_db(); plan.refresh_from_db()
        self.assertEqual(goal.filled_quantity, 2)
        self.assertEqual(plan.spent, Decimal(supply['price']) * 2)
        self.assertEqual(inventory_items(self.a.pk, 'admin').get(source__sku=supply['sku']).quantity, 2)

    def test_sold_out_seed_does_not_generate_purchase(self):
        plan = self.plan()
        batch = current_batch('admin', self.now)
        batch.slots = [{'id': '0', 'sku': 'seed.radish', 'price': '1', 'remaining_quantity': 0}]
        batch.save(update_fields=['slots'])
        goal = MarketGoal(kind='shop', sku='seed.radish', quantity=2,
                          filled_quantity=0, max_unit_price=Decimal('10'))
        self.assertIsNone(market_batch._goal_buy('admin', self.a.pk, plan, goal, self.now))

    def test_split_disposition_preserves_order_without_reusing_sold_stock(self):
        for order in ('high', 'low'):
            with self.subTest(order=order):
                inventory_items(self.a.pk, 'admin').delete()
                MarketDisposition.objects.all().delete()
                MarketListing.objects.all().delete()
                self.stock(quantity=4, stars=5, key='high')
                self.stock(quantity=6, stars=1, key='low')
                policy = MarketDisposition.objects.create(
                    pk='split-policy', owner_id='admin', actor_id=self.a.pk, sku='dish.stew',
                    target_hold=2, sell_ratio=50, list_ratio=50, star_order=order)
                plan = self.plan() if order == 'high' else MarketPlan.objects.get(pk='plan-test')
                tick = self.tick(plan) if order == 'high' else MarketTick.objects.get(pk='tick-test')
                tick.pk = 'split-' + order
                actions = market_batch.build_actions('admin', self.a.pk, plan, self.now)
                result = market_batch.execute('admin', self.a, plan, tick, actions, self.now)
                self.assertEqual(result['failed'], [])
                self.assertEqual([row['quantity'] for row in result['done'] if row['kind'] == 'sell'], [4])
                self.assertEqual(sum(row.remaining_quantity for row in MarketListing.objects.all()), 4)
                self.assertEqual(sum(row.quantity for row in inventory_items(self.a.pk, 'admin')), 2)
                first = result['done'][0]
                sold = MarketTransaction.objects.get(operation__item_id=first['item_id'], operation__kind='sell')
                self.assertEqual(sold.result['stars'], 5 if policy.star_order == 'high' else 1)

    def test_stale_running_disposition_resumes_cached_answers(self):
        self.stock(quantity=6)
        task = enqueue('admin', self.a.pk, 'dish.stew', 6, operation='restart')
        MarketDispositionTask.objects.filter(pk=task.pk).update(
            status='running', attempts=3, answers={'hold': '0', 'channel': 'sell'},
            updated_at=timezone.now() - timedelta(minutes=6))
        with patch('system_settings.agent_world.market_disposition_worker.choose_scene') as decide:
            run_worker(owner='admin')
            decide.assert_not_called()
        task.refresh_from_db()
        self.assertEqual(task.status, 'done')
        self.assertEqual(task.answers, {'hold': '0', 'channel': 'sell'})
        self.assertEqual(MarketDisposition.objects.get().sell_ratio, 100)

    def test_recovery_leaves_fresh_running_and_other_owner_tasks_alone(self):
        for key, owner, at in (('fresh', 'admin', timezone.now()),
                               ('other', 'elsewhere', timezone.now() - timedelta(minutes=6))):
            MarketDispositionTask.objects.create(pk=key, owner_id=owner, actor_id=self.a.pk,
                                                 sku='dish.stew', status='running')
            MarketDispositionTask.objects.filter(pk=key).update(updated_at=at)
        self.assertEqual(recover_stale_tasks('admin'), 0)
        self.assertEqual(MarketDispositionTask.objects.filter(status='running').count(), 2)

    def test_local_execution_models_are_excluded_from_sync(self):
        from utils.sync_models import SnapshotModels
        from system_settings.sync_state import should_track
        models = set(SnapshotModels(['system_settings']).iter_target_models())
        for model in (MarketTick, MarketDispositionTask):
            self.assertNotIn(model, models)
            self.assertFalse(should_track(model))
        for model in (MarketPlan, MarketGoal, MarketDisposition, MarketNoBuy):
            self.assertIn(model, models)
            self.assertTrue(should_track(model))

    def test_tick_skips_without_actions_and_does_not_enter(self):
        from .life_models import LifeConfig
        LifeConfig.objects.create(pk='admin', migrated=True, settings={'market_automation_v2': True})
        plan = self.plan()
        tick = self.tick(plan)
        with patch.object(market_batch, 'enter') as enter:
            result = run_ticks(now=timezone.now(), limit=5)
        self.assertEqual((result['checked'], result['entered'], result['skipped']), (1, 0, 1))
        enter.assert_not_called()
        tick.refresh_from_db()
        self.assertEqual(tick.status, 'skipped')
        self.assertIn('没有可执行', tick.reason)

    def test_batch_executor_orders_actions_and_keeps_partial_failures(self):
        plan = self.plan()
        tick = self.tick(plan)
        actions = {
            'withdraws': [{'kind': 'withdraw', 'listing_id': 'l1', 'version': 1}],
            'reprices': [{'kind': 'reprice', 'listing_id': 'l2', 'version': 1, 'unit_price': '2'}],
            'dispositions': [{'sku': 'dish.stew',
                              'operations': [{'kind': 'sell', 'item_id': 'i1', 'quantity': 1}]}],
            'goals': [{'kind': 'buy_shop', 'batch_id': 'b1', 'slot_id': 'feed',
                       'quantity': 2, 'unit_price': '5', '_goal': ''}],
        }
        calls = []

        def fake_trade(session, agent, key, operation, now=None):
            calls.append((operation['kind'], key))
            if operation['kind'] == 'sell':
                raise RuntimeError('回收失败')
            return {'total': '10', 'quantity': 2}

        with patch.object(market_batch, 'enter', return_value=SimpleNamespace(pk='session', owner_id='admin')), \
             patch.object(market_batch, 'close_session'), \
             patch.object(market_batch, 'trade', side_effect=fake_trade), \
             patch('system_settings.agent_world.life_config.task_for',
                   return_value=SimpleNamespace(pk='builtin-market')):
            first = market_batch.execute('admin', self.a, plan, tick, actions)
            first_keys = [key for _, key in calls]
            plan.refresh_from_db()
            spent_after_first = plan.spent
            calls.clear()
            market_batch.execute('admin', self.a, plan, tick, actions)
            second_keys = [key for _, key in calls]
        order = ['withdraw', 'reprice', 'sell', 'buy_shop']
        self.assertEqual([kind for kind, _ in calls], order)
        self.assertEqual(first_keys, second_keys)  # 同一 tick 重试复用稳定请求键
        self.assertEqual(len(first['failed']), 1)
        self.assertEqual(first['failed'][0]['reason'], '回收失败')
        self.assertEqual(spent_after_first, Decimal('10'))
