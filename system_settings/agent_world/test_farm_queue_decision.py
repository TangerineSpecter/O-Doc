"""Finite whole-queue decisions with isolated model and transaction boundaries."""
import copy
import json
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch, Mock

from django.test import SimpleTestCase, TestCase, override_settings

from .farm_catalog import DEFAULT_RULES
from .farm_queue_candidates import FarmQueueFacts, build_candidates, preview
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
        price_source='fixture', spendable=Decimal('1000'), start=NOW,
        cutoff=NOW.replace(hour=0) + timedelta(days=1))


class CandidateTests(SimpleTestCase):
    def test_text_fallback_keeps_choice_identity_and_drops_estimate_bulk(self):
        import json as json_lib
        from .farm_queue_candidates import identity
        from .farm_queue_decision import text_fallback
        value = facts()
        candidates = build_candidates(value)
        templates, choices = {}, {}
        for key, row in candidates.items():
            plan_id = identity(row['farm_plan']['entries'])
            templates.setdefault(plan_id, {'entries': row['farm_plan']['entries'], **row['summary']})
            choices[key] = {'plan_id': plan_id, 'procurement_limit': row['farm_plan']['procurement_limit'],
                            'procurement_tier': row['summary'].get('procurement_tier', 'none')}
        state = {'plans': templates, 'stocked_crops': value.crops, 'slot': {'id': 'slot'}, 'intent': '种植'}
        full = json_lib.dumps({'state': state, 'choices': choices}, ensure_ascii=False, default=str)
        brief, prompt_choices, labels = text_fallback(state, choices)
        compact = json_lib.dumps({'state': brief, 'choices': prompt_choices}, ensure_ascii=False, default=str)
        self.assertLess(len(compact), 16000)
        self.assertLess(len(compact), len(full) / 2)
        self.assertNotIn('without_fertilizer', compact)
        self.assertEqual(set(labels.values()), set(choices))
        self.assertEqual(labels[next(iter(prompt_choices))], next(iter(choices)))

    def test_short_choice_maps_back_without_sending_estimate_tables(self):
        from types import SimpleNamespace
        from .farm_queue_candidates import identity
        from .farm_queue_decision import text_fallback
        from .life_choices import choose
        value = facts()
        candidates = build_candidates(value)
        templates, choices = {}, {}
        for key, row in candidates.items():
            plan_id = identity(row['farm_plan']['entries'])
            templates.setdefault(plan_id, {'entries': row['farm_plan']['entries'], **row['summary']})
            choices[key] = {'plan_id': plan_id, 'procurement_limit': row['farm_plan']['procurement_limit'],
                            'procurement_tier': row['summary'].get('procurement_tier', 'none')}
        state = {'plans': templates, 'stocked_crops': value.crops}
        brief, prompt_choices, labels = text_fallback(state, choices)
        agent = SimpleNamespace(pk='agent', name='园丁', role_profile={}, prompt='')
        captured = {}

        def fake_complete(model, prompt, validate, **kwargs):
            captured['prompt'] = prompt
            return validate({'choice': next(iter(prompt_choices))})

        with patch('system_settings.agent_world.life_choices.choose_scene', return_value=None), \
             patch('system_settings.agent_world.life_choices.complete_json', side_effect=fake_complete):
            picked = choose(agent, 'owner', 'farm_queue', state, choices,
                            prompt_state=brief, prompt_choices=prompt_choices, choice_labels=labels)
        self.assertEqual(picked, next(iter(choices)))
        self.assertNotIn('without_fertilizer', captured['prompt'])
        self.assertNotIn('上次输出未通过校验', captured['prompt'])

    def test_bounded_deterministic_diverse_and_no_resource_mutation(self):
        value = facts()
        before = copy.deepcopy(value)
        options = build_candidates(value)
        self.assertEqual(options, build_candidates(value))
        self.assertEqual(value, before)
        self.assertLessEqual(len(options), 240)
        specifications = [o['farm_plan'] for o in options.values()]
        self.assertEqual(len(specifications), len({json.dumps(s, sort_keys=True) for s in specifications}))
        crop_sets = [{e['sku'] for e in s['entries']} for s in specifications]
        self.assertTrue(any(len(s) > 1 for s in crop_sets))
        self.assertEqual(set.union(*crop_sets), {c['seed_sku'] for c in value.crops})
        strategies = {(e['fertilizer_mode'], e['fertilizer']) for s in specifications for e in s['entries']}
        self.assertTrue({('none', None), ('optional', 'quality'), ('optional', 'yield'),
                         ('required', 'quality'), ('required', 'yield')} <= strategies)
        totals = [sum(e['quantity'] for e in s['entries']) for s in specifications]
        self.assertTrue(any(0 < n <= 4 for n in totals))
        self.assertTrue(any(n > 4 for n in totals))
        for specification in specifications:
            stock = {c['seed_sku']: c['seed_quantity'] for c in value.crops}
            for entry in specification['entries']:
                stock[entry['sku']] -= entry['quantity']
                self.assertGreaterEqual(stock[entry['sku']], 0)
            self.assertLessEqual(Decimal(specification['procurement_limit']), value.spendable)

    def test_no_seeds_keeps_only_empty_entries_and_replenishment_choices(self):
        value = facts()
        for crop in value.crops:
            crop['seed_quantity'] = 0
        value.reference_seed_price = Decimal('7')
        value.spendable = Decimal('50')
        options = list(build_candidates(value).values())
        self.assertTrue(all(o['farm_plan']['entries'] == [] for o in options))
        limits = {Decimal(o['farm_plan']['procurement_limit']) for o in options}
        self.assertEqual(limits, {Decimal(0), Decimal(28), Decimal(50)})
        value.spendable = Decimal(0)
        self.assertEqual(len(build_candidates(value)), 1)

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
                options = list(build_candidates(value).values())
                self.assertEqual(len(options), 1)
                self.assertEqual(options[0]['farm_plan'], {'entries': [], 'procurement_limit': '0.00'})

    def test_late_long_crop_can_be_planted_and_harvested_tomorrow(self):
        value = facts()
        value.start = value.cutoff - timedelta(minutes=10)
        value.crops = [c for c in value.crops if c['seed_sku'] == 'seed.sunflower']
        options = list(build_candidates(value).values())
        plain = next(o for o in options if o['farm_plan']['entries'][0]['fertilizer_mode'] == 'none')
        self.assertEqual(plain['summary']['sowable'], 4)
        self.assertEqual(plain['summary']['harvestable_today'], 0)
        self.assertGreater(plain['summary']['eventual_expected_revenue'], 0)

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
            settings={**DEFAULTS, 'agent_ids': [self.agent.pk], 'jev_enabled': True})
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
            return decide_plan(self.agent, 'owner', self.slot, '想种点作物')

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
        self.assertEqual(value.reference_seed_price, Decimal('12'))
        options = build_candidates(value).values()
        plain = [o['farm_plan'] for o in options if o['farm_plan']['entries']
                 and all(e['fertilizer_mode'] == 'none' for e in o['farm_plan']['entries'])]
        # Two held seeds cover half of one round; the missing two cost 7 each.
        self.assertIn(Decimal('14'), {Decimal(s['procurement_limit']) for s in plain})

    def test_empty_queue_uses_visible_seed_quote_median_for_replenishment(self):
        from .travel_models import AgentInventoryItem
        from .farm_queue_decision import planning_facts
        self.market_slots([{'sku': 'seed.radish', 'price': '7'},
                           {'sku': 'seed.potato', 'price': '17'},
                           {'sku': 'animal.cow', 'price': '999'}])
        AgentInventoryItem.objects.all().delete()
        with patch('django.utils.timezone.now', return_value=NOW):
            value = planning_facts('owner', self.agent, self.slot)
        options = list(build_candidates(value).values())
        self.assertTrue(all(o['farm_plan']['entries'] == [] for o in options))
        self.assertIn(Decimal('48'), {Decimal(o['farm_plan']['procurement_limit']) for o in options})
        self.assertIn('可见种子报价中位数', value.price_source)

    def test_no_visible_seed_quote_falls_back_to_catalog_median(self):
        from statistics import median
        from .farm_catalog import DEFAULT_RULES
        from .farm_queue_decision import planning_facts
        self.market_slots([{'sku': 'animal.cow', 'price': '999'}])
        with patch('django.utils.timezone.now', return_value=NOW):
            value = planning_facts('owner', self.agent, self.slot)
        self.assertEqual(value.reference_seed_price, median([
            Decimal(row['seed_price']) for row in DEFAULT_RULES['crops'].values()]))
        self.assertEqual(value.seed_price_sources['seed.radish'], '目录基准价')
        self.assertIn('缺少种子报价', value.price_source)

    def test_shared_decision_connection_success_skips_text_generation(self):
        with patch('system_settings.decision.jev.choose',
                   side_effect=lambda owner, state, choices, **kw: (next(iter(choices)), .8)) as model, \
             patch('system_settings.decision.routing.complete', side_effect=AssertionError('不得请求普通模型')):
            result = self.decide()
        self.assertTrue(result['entries'])
        model.assert_called_once()
        context = model.call_args.args[1]['context']
        self.assertNotIn('recent_experiences', context)
        self.assertEqual(context['cutoff'][:10], (NOW + timedelta(days=1)).date().isoformat())
        self.assertEqual(len(context['stocked_crops']), 1)
        self.assertIn('plans', context)
        self.assertTrue(all('entries' not in c for c in model.call_args.args[2].values()))

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
                self.assertEqual(model.call_count, int(mode in ('failed', 'invalid')))
                text.assert_called_once()

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
            result = max(choices, key=lambda k: Decimal(choices[k]['procurement_limit']))
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
        model.assert_called_once()
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
