"""Real listing queries, isolated database and fake finite decisions only."""
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from system_settings.models import Agent
from .market_models import MarketListing
from .market_plan_candidates import listing_rows, listing_star_options
from .market_plan_models import MarketPlan
from .market_planning import _decide, ensure_plan


class MarketStarPriceTests(TestCase):
    def setUp(self):
        self.buyer = Agent.objects.create(name='buyer', money=500)
        self.seller = Agent.objects.create(name='seller')
        self.now = timezone.now()
        self.low = self.listing('low', 1, '10', 2)
        self.high = self.listing('high', 5, '100', 1)
        self.enterContext(patch('system_settings.decision.routing.complete_json',
                                side_effect=AssertionError('有限决策不得回退文本模型')))

    def listing(self, key, stars, price, quantity=1, **kwargs):
        return MarketListing.objects.create(pk=key, owner_id=kwargs.get('owner', 'owner'),
            seller_id=kwargs.get('seller', self.seller.pk), seller_name='seller',
            item={'name': '炖菜', 'value': price, 'source': {'sku': 'dish.stew', 'stars': stars}},
            initial_quantity=quantity, remaining_quantity=quantity, unit_price=Decimal(price))

    def facts(self, available='500'):
        return {'available': available, 'needs': [], 'equipment': [], 'shop_skus': set(), 'signature': 'sig',
                'listings': listing_rows('owner', self.buyer.pk, agent=self.buyer)}

    def plan(self, answers=None):
        return MarketPlan.objects.create(pk='day-plan', owner_id='owner', actor_id=self.buyer.pk,
            plan_date=self.now.date(), status='planning', context={'answers': answers or {}})

    def test_five_star_quote_never_uses_one_star_price(self):
        seen = []
        def choose(owner, agent, scene, state, choices, **kwargs):
            seen.append((state, choices))
            if kwargs['question_id'].endswith('listing-stars:dish.stew'):
                self.assertEqual(choices['1'], {'min_stars': 1, 'count': 3, 'min_price': '10.00'})
                self.assertEqual(choices['5'], {'min_stars': 5, 'count': 1, 'min_price': '100.00'})
                return '5'
            self.assertEqual(state['min_stars'], 5)
            self.assertEqual(state['min_price'], '100.00')
            self.assertEqual(state['count'], 1)
            self.assertEqual(set(choices), {'0', '100.00', '110.00', '120.00'})
            return '110.00'
        with patch('system_settings.agent_world.market_planning._facts', side_effect=lambda *args: self.facts()), \
             patch('system_settings.agent_world.market_planning.choose_scene', side_effect=choose):
            plan = ensure_plan('owner', self.buyer.pk, self.now)
        plan.refresh_from_db()
        self.assertEqual(plan.status, 'active')
        goal = plan.goals.get()
        self.assertEqual((goal.min_stars, goal.quantity, goal.max_unit_price), (5, 1, Decimal('110')))
        self.assertEqual(plan.budget, Decimal('110'))
        self.assertEqual(len(seen), 2)

    def test_low_requirement_keeps_its_real_price_and_budget_filter(self):
        facts = self.facts('10')
        self.assertEqual(set(listing_star_options(facts['listings'][0], '10')), {'1'})
        def choose(owner, agent, scene, state, choices, **kwargs):
            self.assertEqual(state['min_stars'], 1)
            self.assertEqual(state['count'], 3)
            self.assertEqual(set(choices), {'0', '10.00'})
            return '10.00'
        with patch('system_settings.agent_world.market_planning.choose_scene', side_effect=choose) as call:
            goals, budget, _, _ = _decide('owner', self.buyer, self.plan(), facts)
        self.assertEqual(call.call_count, 1)  # Sole affordable quality is code-selected.
        self.assertEqual((goals[0]['min_stars'], budget), (1, Decimal('10')))

    def test_unavailable_quality_creates_no_goal_and_no_price_request(self):
        with patch('system_settings.agent_world.market_planning.choose_scene', return_value=None) as call:
            goals, budget, _, fallback = _decide('owner', self.buyer, self.plan(), self.facts())
        self.assertEqual((goals, budget, fallback), ([], Decimal('0'), 'decision_unavailable'))
        self.assertEqual(call.call_count, 1)

    def test_listing_disappearing_after_quality_does_not_lower_it(self):
        plan = self.plan()
        def choose(*args, **kwargs):
            self.high.remaining_quantity = 0
            self.high.save(update_fields=['remaining_quantity'])
            return '5'
        with patch('system_settings.agent_world.market_planning.choose_scene', side_effect=choose) as call:
            goals, budget, _, _ = _decide('owner', self.buyer, plan, self.facts())
        self.assertEqual((goals, budget, call.call_count), ([], Decimal('0'), 1))
        plan.refresh_from_db()
        self.assertEqual(plan.context['answers']['listing-stars:dish.stew'], '5')

    def test_price_refresh_after_quality_uses_latest_same_quality_quote(self):
        def choose(owner, agent, scene, state, choices, **kwargs):
            if ':listing-stars:' in kwargs['question_id']:
                self.high.unit_price = Decimal('80')
                self.high.save(update_fields=['unit_price'])
                return '5'
            self.assertEqual(state['min_price'], '80.00')
            self.assertEqual(set(choices), {'0', '80.00', '88.00', '96.00'})
            return '80.00'
        with patch('system_settings.agent_world.market_planning.choose_scene', side_effect=choose):
            goals, budget, _, _ = _decide('owner', self.buyer, self.plan(), self.facts())
        self.assertEqual((goals[0]['min_stars'], budget), (5, Decimal('80')))

    def test_failed_pricing_resumes_cached_quality_with_fewer_candidates(self):
        plan = self.plan()
        with patch('system_settings.agent_world.market_planning.choose_scene', side_effect=['5', RuntimeError('中断')]):
            with self.assertRaises(RuntimeError): _decide('owner', self.buyer, plan, self.facts())
        plan.refresh_from_db()
        self.low.remaining_quantity = 0
        self.low.save(update_fields=['remaining_quantity'])
        with patch('system_settings.agent_world.market_planning.choose_scene', return_value='100.00') as call:
            goals, budget, _, _ = _decide('owner', self.buyer, plan, self.facts())
        self.assertEqual(call.call_count, 1)
        self.assertIn('listing:dish.stew:stars:5', call.call_args.kwargs['question_id'])
        self.assertEqual((goals[0]['min_stars'], budget), (5, Decimal('100')))

    def test_cached_quality_unavailable_is_not_reselected(self):
        plan = self.plan({'listing-stars:dish.stew': '5'})
        self.high.status = 'withdrawn'
        self.high.save(update_fields=['status'])
        with patch('system_settings.agent_world.market_planning.choose_scene') as call:
            goals, budget, _, _ = _decide('owner', self.buyer, plan, self.facts())
        call.assert_not_called()
        self.assertEqual((goals, budget), ([], Decimal('0')))

    def test_single_quality_is_cached_before_pricing_failure(self):
        self.low.delete()
        plan = self.plan()
        with patch('system_settings.agent_world.market_planning.choose_scene', return_value=None) as call:
            _decide('owner', self.buyer, plan, self.facts())
        self.assertEqual(call.call_count, 1)
        plan.refresh_from_db()
        self.assertEqual(plan.context['answers']['listing-stars:dish.stew'], '5')

    def test_full_daily_sequence_leaves_equipment_to_hourly_shopping(self):
        facts = self.facts()
        facts['needs'] = [
            {'key': f'{kind}:{index}', 'kind': kind, 'sku': f'{kind}.{index}',
             'name': kind, 'missing': 1, 'owned': 0, 'unit_price': Decimal('1'), 'unit': '份', 'effect': ''}
            for kind, index in (('seed', 1), ('seed', 2), ('fertilizer', 1), ('fertilizer', 2), ('bait', 1))]
        facts['equipment'] = [{'slot': 'body', 'count': 1, 'min_price': Decimal('10')}]
        def choose(owner, agent, scene, state, choices, **kwargs):
            question = kwargs['question_id']
            if ':listing-stars:' in question: return '5'
            if ':listing:' in question: return '100.00'
            if ':bait-range:' in question: return '0-9'
            return '1'
        with patch('system_settings.agent_world.market_planning.choose_scene', side_effect=choose) as call:
            goals, budget, _, _ = _decide('owner', self.buyer, self.plan(), facts)
        self.assertEqual(call.call_count, 8)
        self.assertEqual({goal['kind'] for goal in goals}, {'shop', 'listing'})
        self.assertEqual(budget, Decimal('105'))

    def test_legacy_unqualified_price_cache_cannot_price_five_star_goal(self):
        plan = self.plan({'listing-stars:dish.stew': '5', 'listing:dish.stew': '12.00'})
        with patch('system_settings.agent_world.market_planning.choose_scene', return_value='100.00') as call:
            goals, budget, _, _ = _decide('owner', self.buyer, plan, self.facts())
        self.assertEqual(call.call_count, 1)
        self.assertEqual((goals[0]['min_stars'], budget), (5, Decimal('100')))

    def test_empty_and_invalid_quotes_never_become_quality_options(self):
        self.low.remaining_quantity = 0; self.low.save(update_fields=['remaining_quantity'])
        self.high.status = 'withdrawn'; self.high.save(update_fields=['status'])
        self.listing('bad-star', 99, '1')
        self.listing('self-owned', 5, '1', seller=self.buyer.pk)
        self.listing('foreign', 5, '1', owner='elsewhere')
        facts = self.facts()
        self.assertEqual(facts['listings'], [])
        with patch('system_settings.agent_world.market_planning.choose_scene') as call:
            self.assertEqual(_decide('owner', self.buyer, self.plan(), facts)[0], [])
        call.assert_not_called()
