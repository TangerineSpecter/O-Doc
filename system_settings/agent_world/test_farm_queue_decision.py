"""Finite whole-queue decisions with isolated model and transaction boundaries."""
import copy
import json
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch, Mock

from django.test import SimpleTestCase, TestCase, override_settings

from .farm_catalog import DEFAULT_RULES
from .farm_queue_candidates import (FarmQueueFacts, describe_basket, fertilizer_options,
                                    preview, purchase_baskets, purchase_cost, ranked_baskets,
                                    restock_options)
from .farm_clock import SHANGHAI

NOW = datetime(2026, 10, 10, 8, tzinfo=SHANGHAI)


def facts():
    rules = copy.deepcopy(DEFAULT_RULES)
    crops = []
    for kind, rule in rules['crops'].items():
        base = rule['yield'] * rule['sale_price']
        crops.append({'name': rule['name'], 'seed_sku': 'seed.' + kind, 'seed_quantity': 12,
                      'growth_seconds': rule['growth_seconds'],
                      'without_fertilizer': {'expected_revenue': base},
                      'fertilizers': {k: {'expected_revenue': base + delta,
                                          'inventory_additional_net_revenue': delta - 2}
                                     for k, delta in [('quality', 10), ('yield', 20)]}})
    return FarmQueueFacts(
        state={'plots': [{'id': i, 'crop': None} for i in range(4)], 'animals': []},
        rules=rules, seed='fixture', crops=crops,
        fertilizers={k: {'quantity': 2, 'next_inventory_cost': '2', 'quote': {'price': 10}}
                     for k in rules['fertilizers']},
        seed_prices={c['seed_sku']: Decimal(rules['crops'][c['seed_sku'][5:]]['seed_price']) for c in crops},
        spendable=Decimal('1000'), start=NOW,
        cutoff=NOW.replace(hour=0) + timedelta(days=1))


class CandidateTests(SimpleTestCase):
    def test_baskets_are_deterministic_ranked_and_within_stock(self):
        value = facts()
        before = copy.deepcopy(value)
        rows = ranked_baskets(value)
        self.assertEqual(rows, ranked_baskets(value))
        self.assertEqual(value, before)
        self.assertLessEqual(len(rows), 10)
        self.assertGreater(len(rows), 1)
        revenues = [row['summary']['eventual_expected_revenue'] for row in rows]
        self.assertEqual(revenues, sorted(revenues, reverse=True))
        keys = [tuple(sorted((entry['sku'], entry['quantity']) for entry in row['entries'])) for row in rows]
        self.assertEqual(len(keys), len(set(keys)))
        for row in rows:
            stock = {crop['seed_sku']: crop['seed_quantity'] for crop in value.crops}
            for entry in row['entries']:
                self.assertEqual(entry['fertilizer_mode'], 'none')
                stock[entry['sku']] -= entry['quantity']
                self.assertGreaterEqual(stock[entry['sku']], 0)
        text = json.dumps({str(index): describe_basket(value, row) for index, row in enumerate(rows, 1)},
                          ensure_ascii=False)
        self.assertLess(len(text), 2000)
        self.assertNotIn('without_fertilizer', text)
        self.assertNotIn('seed.', text)

    def test_three_crops_keep_the_full_basket_first_and_drop_order_duplicates(self):
        value = facts()
        keep = {'seed.corn', 'seed.radish', 'seed.cucumber'}
        for crop in value.crops:
            crop['seed_quantity'] = {'seed.radish': 3, 'seed.corn': 1, 'seed.cucumber': 1}.get(crop['seed_sku'], 0)
        rows = ranked_baskets(value)
        self.assertLessEqual(len(rows), 10)
        self.assertEqual({entry['sku'] for entry in rows[0]['entries']}, keep)
        self.assertNotIn('今日可收', describe_basket(value, rows[0]))
        self.assertGreater(rows[0]['summary']['eventual_expected_revenue'],
                           rows[-1]['summary']['eventual_expected_revenue'])

    def test_fertilizer_question_uses_stock_then_quote_then_skips(self):
        value = facts()
        for crop in value.crops:
            crop['seed_quantity'] = 1 if crop['seed_sku'] == 'seed.radish' else 0
        entries = ranked_baskets(value)[0]['entries']
        stocked = fertilizer_options(value, entries)
        self.assertEqual(set(stocked['choices']), {'no', 'yes'})
        self.assertEqual(stocked['mode'], 'optional')
        self.assertEqual(stocked['kind'], 'yield')
        self.assertIn('手头', stocked['fact'])
        for row in value.fertilizers.values():
            row['quantity'] = 0
        quoted = fertilizer_options(value, entries)
        self.assertEqual(quoted['mode'], 'required')
        self.assertIn('等买到', quoted['choices']['yes'])
        for row in value.fertilizers.values():
            row['quote'] = None
        self.assertIsNone(fertilizer_options(value, entries))
        value.spendable = Decimal(0)
        for row in value.fertilizers.values():
            row['quote'] = {'price': 10}
        self.assertIsNone(fertilizer_options(value, entries))

    def test_no_seeds_offers_real_purchase_baskets_within_budget(self):
        value = facts()
        for crop in value.crops:
            crop['seed_quantity'] = 0
        self.assertEqual(ranked_baskets(value), [])
        baskets = purchase_baskets(value)
        self.assertTrue(baskets)
        for row in baskets:
            self.assertTrue(row['purchase'])
            self.assertTrue(row['entries'])
            self.assertTrue(all(entry['sku'].startswith('seed.') for entry in row['entries']))
            self.assertLessEqual(purchase_cost(value, row['entries'], 'none', None), value.spendable)
        self.assertIn('需先买种子', describe_basket(value, baskets[0]))
        options = restock_options(value, baskets[0]['entries'])
        self.assertGreaterEqual(len(options), 2)
        for row in options.values():
            self.assertIn('采购上限', row['label'])
            self.assertTrue(row['entries'])
            self.assertLessEqual(Decimal(row['limit']), value.spendable)
        # 余额不足时篮子按实际可支配金额截断，不会给出买不起的目标。
        value.spendable = Decimal('20')
        for row in purchase_baskets(value):
            self.assertLessEqual(purchase_cost(value, row['entries'], 'none', None), value.spendable)
        value.spendable = Decimal(0)
        self.assertEqual(purchase_baskets(value), [])
        self.assertIsNone(restock_options(value, []))

    def test_no_remaining_time_or_land_gives_one_zero_purchase_plan(self):
        for mode in ('time', 'land', 'occupied'):
            value = facts()
            if mode == 'time':
                value.start = value.cutoff
            elif mode == 'land':
                value.state['plots'] = []
            else:
                for plot in value.state['plots']:
                    plot['crop'] = {'grown': 0, 'checked_at': NOW.timestamp(),
                                    'rules': {'growth_seconds': 86400}}
            with self.subTest(mode=mode):
                self.assertEqual(ranked_baskets(value), [])
                self.assertIsNone(restock_options(value, []))

    def test_late_long_crop_can_be_planted_and_harvested_tomorrow(self):
        value = facts()
        value.start = value.cutoff - timedelta(minutes=10)
        value.crops = [c for c in value.crops if c['seed_sku'] == 'seed.sunflower']
        rows = ranked_baskets(value)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['summary']['sowable'], 4)
        self.assertEqual(rows[0]['summary']['harvestable_today'], 0)
        self.assertGreater(rows[0]['summary']['eventual_expected_revenue'], 0)
        self.assertIn('今日可收0', describe_basket(value, rows[0]))

    def test_required_and_optional_share_real_fertilizer_and_fifo_cost(self):
        value = facts()
        value.fertilizers['quality'].update(quantity=3, cost_lots=[
            {'quantity': 1, 'price': '2'}, {'quantity': 2, 'price': '20'}])
        entries = [{'sku': 'seed.radish', 'quantity': 2, 'fertilizer_mode': 'optional', 'fertilizer': 'quality'},
                   {'sku': 'seed.potato', 'quantity': 2, 'fertilizer_mode': 'required', 'fertilizer': 'quality'}]
        result = preview(value, entries)
        self.assertEqual(result['sowable'], 3)
        self.assertEqual(result['missing_fertilizer'], {'quality': 1})
        self.assertTrue(result['required_fertilizer_wait'])
        self.assertEqual(result['fertilizer_inventory_net_gain'], 30 - 42)
        value.fertilizers['quality']['quantity'] = 0
        result = preview(value, entries)
        self.assertEqual(result['sowable'], 2)
        self.assertEqual(result['eventual_expected_revenue'], 36)


@override_settings(USE_TZ=True)
class FarmDecisionTests(TestCase):
    def setUp(self):
        from system_settings.models import Agent, AgentTask, AIProvider, AIModel
        from .farm_service import ensure_farms
        from .inventory_stock import add_stock
        from .life_models import LifeConfig, LifeItem
        from .life_config import DEFAULTS, ensure_profiles
        provider = AIProvider.objects.create(name='fixture', base_url='https://example.invalid')
        model = AIModel.objects.create(name='fixture', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='园丁', model=model, money=1000)
        self.task = AgentTask.objects.create(name='农场', task_kind='farm', agent=self.agent,
            agent_ids=[self.agent.pk], enabled=True, farm_config={'owner_id': 'owner'})
        self.config = LifeConfig.objects.create(pk='owner', migrated=True,
            settings={**DEFAULTS, 'agent_ids': [self.agent.pk], 'jev_enabled': True,
                      'decision_connection_id': 'jev', 'decision_connection_ids': ['jev']})
        from system_settings.decision.config import save_key
        save_key('owner', 'secret')
        ensure_profiles('owner', [self.agent.pk])
        ensure_farms(self.task)
        self.item = LifeItem.objects.create(pk='slot', owner_id='owner', actor_id=self.agent.pk,
            original_at=NOW, scheduled_at=NOW, activity='farm', task_id=self.task.pk,
            intent='想种点作物')
        add_stock(self.agent.pk, 'owner', self.agent.name, 'seed.radish', 2, '萝卜', 'seed', 10)
        self.slot = {'id': self.item.pk, 'time': NOW.isoformat()}

    def decide(self):
        from .farm_queue_decision import decide_plan
        with patch('django.utils.timezone.now', return_value=NOW):
            return decide_plan(self.agent, 'owner', self.slot, '想种点作物', task=self.task)

    def market_slots(self, slots):
        from .market_shop import current_batch
        batch = current_batch('owner', NOW)
        batch.slots = [{'id': str(i), 'remaining_quantity': 3, **row}
                       for i, row in enumerate(slots)]
        batch.save(update_fields=['slots'])

    def test_preserved_market_seed_quote_overrides_changed_catalog_price(self):
        from .farm_catalog import catalog_for
        from .farm_queue_decision import planning_facts
        self.market_slots([{'sku': 'seed.radish', 'price': '7'},
                           {'sku': 'seed.potato', 'price': '17'},
                           {'sku': 'animal.cow', 'price': '999'}])
        catalog = catalog_for('owner')
        catalog.rules['crops']['radish']['seed_price'] = 1000
        catalog.save(update_fields=['rules'])
        with patch('django.utils.timezone.now', return_value=NOW):
            value = planning_facts('owner', self.agent, self.slot)
        self.assertEqual(value.seed_prices['seed.radish'], Decimal('7'))
        self.assertEqual(value.seed_price_sources['seed.radish'], '可见报价')
        self.assertEqual(value.seed_prices['seed.corn'], Decimal('35'))
        self.assertEqual(value.seed_price_sources['seed.corn'], '目录基准价')
        baskets = ranked_baskets(value)
        self.assertEqual({entry['sku'] for entry in baskets[0]['entries']}, {'seed.radish'})
        # Two held seeds cover half of one round; the missing two cost 7 each.
        self.assertEqual(Decimal(restock_options(value, baskets[0]['entries'])['round']['limit']), Decimal('14'))

    def test_empty_queue_purchase_baskets_use_visible_seed_quotes(self):
        from .travel_models import AgentInventoryItem
        from .farm_queue_decision import planning_facts
        self.market_slots([{'sku': 'seed.radish', 'price': '7'},
                           {'sku': 'seed.potato', 'price': '17'},
                           {'sku': 'animal.cow', 'price': '999'}])
        AgentInventoryItem.objects.all().delete()
        with patch('django.utils.timezone.now', return_value=NOW):
            value = planning_facts('owner', self.agent, self.slot)
        self.assertEqual(ranked_baskets(value), [])
        baskets = purchase_baskets(value)
        self.assertTrue(baskets)
        self.assertEqual(value.seed_prices['seed.radish'], Decimal('7'))
        self.assertEqual(value.seed_price_sources['seed.radish'], '可见报价')
        self.assertEqual(value.seed_price_sources['seed.corn'], '目录基准价')
        for row in baskets:
            self.assertLessEqual(purchase_cost(value, row['entries'], 'none', None), value.spendable)

    def test_no_visible_seed_quote_falls_back_to_catalog_price(self):
        from .farm_catalog import DEFAULT_RULES
        from .farm_queue_decision import planning_facts
        self.market_slots([{'sku': 'animal.cow', 'price': '999'}])
        with patch('django.utils.timezone.now', return_value=NOW):
            value = planning_facts('owner', self.agent, self.slot)
        self.assertEqual(value.seed_prices['seed.radish'],
                         Decimal(str(DEFAULT_RULES['crops']['radish']['seed_price'])))
        self.assertEqual(value.seed_price_sources['seed.radish'], '目录基准价')

    def test_shared_decision_connection_success_skips_text_generation(self):
        with patch('system_settings.decision.jev.choose',
                   side_effect=lambda owner, state, choices, **kw: (next(iter(choices)), .8)) as model, \
             patch('system_settings.decision.routing.complete', side_effect=AssertionError('不得请求普通模型')):
            result = self.decide()
        self.assertTrue(result['entries'])
        # One held crop skips the basket. The hourly shop always quotes fertilizer,
        # so the model answers fertilizer, then restock.
        self.assertEqual(model.call_count, 2)
        asked = [(call.args[1]['context'], call.args[2]) for call in model.call_args_list]
        for context, choices in asked:
            self.assertTrue(set(context) <= {'intent', 'preferences', 'planting', 'fertilizer'})
            self.assertNotIn('plans', context)
            self.assertNotIn('stocked_crops', context)
            self.assertNotIn('stamina', context)
            self.assertLessEqual(len(choices), 10)
            self.assertTrue(all(isinstance(label, str) for label in choices.values()))
            self.assertLess(len(json.dumps({'state': context, 'choices': choices}, ensure_ascii=False)), 2000)
        self.assertIn('现在种，不买肥', asked[0][1].values())
        self.assertEqual(asked[1][0]['fertilizer'], asked[0][1]['no'])
        self.assertIn('不补种', asked[1][1].values())

    def test_no_seed_stock_still_plans_purchasable_crop_targets(self):
        from .farm_catalog import catalog_for
        from .farm_queue_decision import decide_plan
        from .travel_models import AgentInventoryItem
        AgentInventoryItem.objects.all().delete()
        with patch('django.utils.timezone.now', return_value=NOW), \
             patch('system_settings.decision.jev.choose',
                   side_effect=lambda owner, state, choices, **kw: (next(iter(choices)), .8)), \
             patch('system_settings.decision.routing.complete', side_effect=AssertionError('不得请求普通模型')):
            result = decide_plan(self.agent, 'owner', self.slot, '想种点作物', task=self.task)
        self.assertTrue(result['entries'])
        self.assertTrue(all(entry['sku'].startswith('seed.') for entry in result['entries']))
        rules = catalog_for('owner').rules
        cost = sum(Decimal(entry['quantity']) * Decimal(str(rules['crops'][entry['sku'][5:]]['seed_price']))
                   for entry in result['entries'])
        self.assertGreater(Decimal(result['procurement_limit']), 0)
        # 采购上限必须覆盖队列目标；余额不足时按余额截断，不会给出买不起的数量
        self.assertGreaterEqual(Decimal(result['procurement_limit']) - cost, Decimal(0))
        self.plan_shows_purchase_gap(result)

    def plan_shows_purchase_gap(self, specification):
        from .farm_queue_plan import install, overview
        from .farm_models import AgentFarm
        with patch('django.utils.timezone.now', return_value=NOW):
            install(self.item, self.task, specification, '想种点作物', recheck_inventory=True)
        plan = overview(AgentFarm.objects.get(pk=self.agent.pk), NOW)
        self.assertTrue(plan['entries'])
        self.assertTrue(any(entry['missing_seeds'] > 0 for entry in plan['entries']))

    def test_on_hand_intent_does_not_ask_to_buy_seeds(self):
        from .farm_queue_decision import decide_plan
        with patch('django.utils.timezone.now', return_value=NOW), \
             patch('system_settings.decision.jev.choose',
                   side_effect=lambda owner, state, choices, **kw: ('no', .8)) as model, \
             patch('system_settings.decision.routing.complete', side_effect=AssertionError('不得请求普通模型')):
            result = decide_plan(self.agent, 'owner', self.slot, '安排种植，利用现有资源')
        model.assert_called_once()
        self.assertNotIn('不补种', model.call_args.args[2].values())
        self.assertTrue(result['entries'])
        self.assertEqual(result['procurement_limit'], '0.00')
        self.assertTrue(all(entry['fertilizer_mode'] == 'none' for entry in result['entries']))

    def test_queue_questions_carry_the_farm_task(self):
        from .farm_queue_decision import decide_plan
        seen = []

        def select(agent, owner, scene, state, choices, **kwargs):
            seen.append(kwargs.get('task'))
            return next(iter(choices))

        with patch('django.utils.timezone.now', return_value=NOW), \
             patch('system_settings.agent_world.farm_queue_decision.choose', side_effect=select):
            decide_plan(self.agent, 'owner', self.slot, '安排种植，利用现有资源', task=self.task)
        self.assertTrue(seen)
        self.assertTrue(all(task is self.task for task in seen))

    def test_later_question_receives_the_previous_choice(self):
        from .inventory_stock import add_stock
        add_stock(self.agent.pk, 'owner', self.agent.name, 'seed.corn', 1, '玉米', 'seed', 35)
        add_stock(self.agent.pk, 'owner', self.agent.name, 'seed.cucumber', 1, '黄瓜', 'seed', 24)
        add_stock(self.agent.pk, 'owner', self.agent.name, 'fertilizer.yield', 2, '增产肥', 'fertilizer', 35)
        seen = []

        def fake(owner, state, choices, **kwargs):
            seen.append((state['context'], dict(choices)))
            return next(iter(choices)), .8

        with patch('django.utils.timezone.now', return_value=NOW), \
             patch('system_settings.decision.jev.choose', side_effect=fake), \
             patch('system_settings.decision.routing.complete', side_effect=AssertionError('不得请求普通模型')):
            result = self.decide()
        self.assertEqual(len(seen), 3)
        basket = seen[0][1][next(iter(seen[0][1]))]
        self.assertEqual(seen[1][0]['planting'], basket)
        self.assertIn('手头', seen[1][0]['fertilizer'])
        self.assertEqual(seen[2][0]['planting'], basket)
        self.assertEqual(seen[2][0]['fertilizer'], seen[1][1][next(iter(seen[1][1]))])
        self.assertLessEqual(max(len(choices) for _, choices in seen), 10)
        self.assertTrue(result['entries'])
        self.assertTrue(all(entry['fertilizer_mode'] == 'none' for entry in result['entries']))

    def test_disabled_excluded_and_unavailable_use_same_candidate_ids(self):
        from system_settings.decision.jev import DecisionUnavailable, choose as provider_choose
        def respond(config, prompt, **kwargs):
            data = json.loads(prompt[prompt.index('{"state"'):])
            return json.dumps({'choice': next(iter(data['choices']))})
        for mode in ('disabled', 'excluded', 'failed', 'invalid'):
            self.config.settings.update(jev_enabled=mode != 'disabled',
                                        jev_excluded_scenes=['farm_queue'] if mode == 'excluded' else [])
            self.config.save()
            effect = provider_choose if mode == 'invalid' else DecisionUnavailable('fixture')
            response = Mock(status_code=200, text='fixture')
            response.json.return_value = {'model': 'jev-fixture', 'answers': {
                'farm_queue': {'type': 'choice', 'choice': 'not-a-candidate'}}}
            with self.subTest(mode=mode), patch('system_settings.decision.jev.choose', side_effect=effect) as model, \
                 patch('system_settings.decision.jev.api_key', return_value='fixture'), \
                 patch('system_settings.decision.jev.requests.post', return_value=response), \
                 patch('system_settings.decision.routing.complete', side_effect=respond) as text:
                self.assertTrue(self.decide()['entries'])
                questions = 2
                self.assertEqual(model.call_count, questions if mode in ('failed', 'invalid') else 0)
                self.assertEqual(text.call_count, questions)

    def test_sole_empty_candidate_skips_all_models(self):
        from .travel_models import AgentInventoryItem
        AgentInventoryItem.objects.all().delete()
        self.agent.money = 0
        self.agent.save()
        with patch('system_settings.decision.jev.choose') as model, \
             patch('system_settings.decision.routing.complete') as text:
            self.assertEqual(self.decide(), {'entries': [], 'procurement_limit': '0.00'})
        model.assert_not_called()
        text.assert_not_called()

    def test_commit_rechecks_inventory_money_and_keeps_original_sources_on_retry(self):
        from .farm_queue_plan import install
        from .farm_models import AgentFarm
        from .farm_queue_sync import validate_queue
        from .inventory_stock import take_stock
        from .life_models import LifeItem
        from .life_planner import apply_plan
        def select(agent, owner, scene, state, choices, **kwargs):
            import re
            def amount(label):
                match = re.search(r'采购上限([0-9]+(?:\.[0-9]+)?)', str(label))
                return Decimal(match.group(1)) if match else Decimal(0)
            if not any(amount(label) for label in choices.values()):
                return 'no' if 'no' in choices else next(iter(choices))
            result = max(choices, key=lambda key: amount(choices[key]))
            take_stock(self.agent.pk, 'owner', 'seed.radish', 1)
            self.agent.money = 15
            self.agent.save()
            LifeItem.objects.create(pk='reserved', owner_id='owner', actor_id=self.agent.pk,
                original_at=NOW, scheduled_at=NOW, activity='investment', budget=10)
            return result
        with patch('system_settings.agent_world.farm_queue_decision.choose', side_effect=select):
            specification = self.decide()
        with patch('django.utils.timezone.now', return_value=NOW):
            apply_plan('owner', self.agent, [self.item], {'plans': [{
                'id': self.item.pk, 'activity': 'farm', 'reason': '种植方案', 'budget': '0',
                'farm_plan': specification, '_farm_queue_candidate': True}]})
            self.item.refresh_from_db()
            farm = AgentFarm.objects.get(pk=self.agent.pk)
            old = copy.deepcopy(farm.state['planting_plans'][self.item.context['farm_plan_id']])
            self.assertEqual(sum(e['quantity'] for e in old['entries']), 1)
            self.assertEqual(Decimal(old['procurement_limit']), 5)
            install(self.item, self.task, {'entries': [], 'procurement_limit': '0'}, '重复提交', recheck_inventory=True)
        farm.refresh_from_db()
        self.assertEqual(old, farm.state['planting_plans'][old['id']])
        validate_queue(farm)

    def test_target_date_window_and_runtime_do_not_change_model_facts(self):
        from .farm_queue_decision import planning_facts
        self.slot['time'] = (NOW + timedelta(days=1)).replace(hour=23).isoformat()
        with patch('django.utils.timezone.now', return_value=NOW):
            result = planning_facts('owner', self.agent, self.slot)
        self.assertEqual(result.start.date(), (NOW + timedelta(days=1)).date())
        self.assertEqual(result.cutoff.date(), (NOW + timedelta(days=2)).date())

    def test_live_planner_prepares_once_and_keeps_installed_queue(self):
        from .life_planner import plan_items
        from .farm_models import AgentFarm
        from .farm_queue_sync import validate_queue
        with patch('django.utils.timezone.now', return_value=NOW), \
             patch('system_settings.decision.jev.choose',
                   side_effect=lambda owner, state, choices, **kw: (next(iter(choices)), .8)) as model, \
             patch('system_settings.decision.routing.complete', side_effect=AssertionError('不得额外请求文本模型')):
            plan_items(self.config, self.agent, [self.item], preserve_activities=True)
            self.item.refresh_from_db()
            original = copy.deepcopy(self.item.context)
            plan_items(self.config, self.agent, [self.item], preserve_activities=True)
        model.assert_called()
        self.assertEqual(model.call_count, 2)
        self.item.refresh_from_db()
        self.assertEqual(original, self.item.context)
        validate_queue(AgentFarm.objects.get(pk=self.agent.pk))

    def test_user_edit_during_choice_is_preserved_without_queue_installation(self):
        from .life_models import LifeItem
        from .life_planner import plan_items
        from .farm_models import AgentFarm
        def selected(*args, **kwargs):
            LifeItem.objects.filter(pk=self.item.pk).update(intent='人工修改', updated_at=NOW + timedelta(days=10))
            return next(iter(args[4]))
        with patch('django.utils.timezone.now', return_value=NOW), \
             patch('system_settings.agent_world.farm_queue_decision.choose', side_effect=selected), \
             self.assertRaisesRegex(ValueError, '日程在决策期间发生变化'):
            plan_items(self.config, self.agent, [self.item], preserve_activities=True)
        self.item.refresh_from_db()
        self.assertEqual(self.item.intent, '人工修改')
        self.assertFalse(AgentFarm.objects.get(pk=self.agent.pk).state.get('planting_plans'))

    def test_farm_scene_can_be_saved_excluded_and_restored_via_config_api(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient
        from user.models import UserProfile
        from system_settings.decision.routing import jev_enabled
        user = get_user_model().objects.create_user(username='fixture', password='fixture')
        UserProfile.objects.update_or_create(user=user, defaults={'userid': 'owner'})
        client = APIClient()
        client.force_authenticate(user)
        for excluded in (['farm_queue'], []):
            settings = {**self.config.settings, 'jev_excluded_scenes': excluded}
            response = client.post('/api/settings/agent-world/life/config/', {'settings': settings}, format='json')
            self.assertEqual(response.status_code, 200)
            saved = client.get('/api/settings/agent-world/life/config/').json()['data']['settings']
            self.assertEqual(saved['jevExcludedScenes'], excluded)
            self.assertEqual(jev_enabled('owner', 'farm_queue'), not bool(excluded))

    def test_naive_datetimes_use_shanghai_target_day(self):
        from .farm_queue_decision import planning_facts
        tomorrow = (NOW + timedelta(days=1)).replace(tzinfo=None)
        self.slot['time'] = tomorrow.isoformat()
        with override_settings(USE_TZ=False), patch('django.utils.timezone.now', return_value=NOW.replace(tzinfo=None)):
            result = planning_facts('owner', self.agent, self.slot)
        self.assertEqual(result.start, tomorrow.replace(tzinfo=SHANGHAI))
        self.assertEqual(result.cutoff.date(), (NOW + timedelta(days=2)).date())
