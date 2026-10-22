from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from .market_plan_candidates import craftable_after_purchase, crafting_demand_facts, listing_rows


class MarketCraftabilityTests(SimpleTestCase):
    def test_purchase_increases_output_in_both_crafting_domains(self):
        agent = SimpleNamespace(pk='buyer')
        for domain, sku, other in (
            ('cooking', 'crop.sunflower', 'crop.wheat'),
            ('alchemy', 'combat.material.moss_cave.1', 'combat.material.sprout_meadow.rabbit'),
        ):
            rules = {'recipe': {
                'name': '配方', 'required_level': 1, 'energy_cost': 1,
                'ingredients': [{'sku': sku, 'quantity': 1}, {'sku': other, 'quantity': 1}],
            }}
            # 保留真实 recipe_options，覆盖解锁新产出、增加已有产出和没有增产的情况。
            for target_stock, other_stock, level, expected in (
                (0, 2, 1, True),
                (1, 2, 1, True),
                (2, 2, 1, False),
                (0, 0, 1, False),
                (0, 2, 0, False),
            ):
                facts = {'rules': rules, 'level': level, 'pool': [
                    {'sku': sku, 'quantity': target_stock},
                    {'sku': other, 'quantity': other_stock},
                ]}
                with self.subTest(domain=domain, target_stock=target_stock,
                                  other_stock=other_stock, level=level):
                    with patch('system_settings.agent_world.market_plan_candidates._crafting_facts',
                               return_value=facts), patch(
                            'system_settings.agent_world.market_plan_candidates.blacksmith_purchase_skus', return_value=set()):
                        self.assertEqual(craftable_after_purchase('owner', agent, sku), expected)

    def test_forge_use_keeps_material_when_alchemy_is_not_craftable(self):
        agent = SimpleNamespace(pk='buyer')
        sku = 'combat.material.moss_cave.1'
        with patch('system_settings.agent_world.market_plan_candidates._crafting_facts',
                   return_value={'rules': {}, 'level': 1, 'pool': []}), patch(
                'system_settings.agent_world.market_plan_candidates.blacksmith_purchase_skus', return_value={sku}):
            self.assertTrue(craftable_after_purchase('owner', agent, sku))


class MarketCraftingIntegrationTests(TestCase):
    def setUp(self):
        from system_settings.models import Agent
        from .life_models import LifeProfile
        self.seller = Agent.objects.create(name='卖家')
        self.buyer = Agent.objects.create(name='买家')
        self.idle = Agent.objects.create(name='暂无原料')
        self.archived = Agent.objects.create(name='已归档', archived_at=timezone.now())
        self.foreign = Agent.objects.create(name='其他账号')
        for actor in (self.seller, self.buyer, self.idle, self.archived):
            LifeProfile.objects.create(pk=actor.pk, owner_id='owner')
        LifeProfile.objects.create(pk=self.foreign.pk, owner_id='foreign')

    def stock(self, actor, sku, quantity=1):
        from .inventory_stock import add_stock
        add_stock(actor.pk, 'owner', actor.name, sku, quantity, sku, 'material',
                  '1', f'{actor.pk}:{sku}', stars=1)

    def test_demand_uses_real_account_residents_and_never_replays_stamina(self):
        self.stock(self.buyer, 'crop.potato')
        self.stock(self.buyer, 'combat.material.moss_cave.1')
        self.stock(self.buyer, 'combat.material.sprout_meadow.rabbit')
        with patch('system_settings.agent_world.execution.stamina', side_effect=AssertionError('体力不应被计算')):
            for sku in ('crop.potato', 'combat.material.moss_cave.1'):
                with self.subTest(sku=sku):
                    facts = crafting_demand_facts('owner', self.seller.pk, sku)
                    self.assertEqual(facts['status'], 'complete')
                    self.assertEqual(facts['resident_count_excluding_self'], 2)
                    self.assertEqual(facts['demand_resident_count'], 1)

    def test_failed_resident_check_is_unknown_instead_of_zero_demand(self):
        with patch('system_settings.agent_world.market_plan_candidates._crafting_facts',
                   side_effect=ValueError('原料预留无法解析')):
            with self.assertLogs('system_settings.agent_world.market_plan_candidates', level='ERROR'):
                facts = crafting_demand_facts('owner', self.seller.pk, 'crop.potato')
        self.assertEqual(facts['status'], 'partial')
        self.assertEqual(facts['unknown_resident_count'], 2)
        self.assertIsNone(facts['demand_resident_count'])

    def test_optional_demand_failure_keeps_model_listing_choice(self):
        from .market_disposition import enqueue
        from .market_disposition_worker import run
        from .market_plan_models import MarketDisposition, MarketDispositionTask
        self.stock(self.seller, 'crop.potato', 10)
        enqueue('owner', self.seller.pk, 'crop.potato', 10, operation='test-demand')

        def choose(owner, agent, scene, state, choices, **kwargs):
            self.assertEqual(state['crafting_demand']['status'], 'unavailable')
            self.assertIsNone(state['crafting_demand']['demand_resident_count'])
            question = kwargs['question_id'].rsplit(':', 1)[-1]
            return {'hold': '0', 'channel': 'list', 'price': '1.20'}.get(question, next(iter(choices)))

        with patch('system_settings.agent_world.market_plan_candidates.crafting_demand_facts',
                   side_effect=RuntimeError('统计不可用')):
            with patch('system_settings.agent_world.market_disposition_worker.choose_scene', side_effect=choose):
                with self.assertLogs('system_settings.agent_world.market_disposition_worker', level='ERROR'):
                    run(owner='owner')
        self.assertEqual(MarketDispositionTask.objects.get().status, 'done')
        self.assertEqual(MarketDisposition.objects.get().list_ratio, 100)

    def test_zero_demand_keeps_listing_as_a_model_choice(self):
        from .market_disposition import enqueue
        from .market_disposition_worker import run
        from .market_plan_models import MarketDisposition
        self.stock(self.seller, 'crop.potato', 10)
        enqueue('owner', self.seller.pk, 'crop.potato', 10, operation='zero-demand')

        def choose(owner, agent, scene, state, choices, **kwargs):
            self.assertEqual(state['crafting_demand']['status'], 'complete')
            self.assertEqual(state['crafting_demand']['demand_resident_count'], 0)
            question = kwargs['question_id'].rsplit(':', 1)[-1]
            return {'hold': '0', 'channel': 'list', 'price': '1.20'}.get(question, next(iter(choices)))

        with patch('system_settings.agent_world.market_disposition_worker.choose_scene', side_effect=choose):
            run(owner='owner')
        self.assertEqual(MarketDisposition.objects.get().list_ratio, 100)

    def test_listing_precheck_without_agent_reuses_one_material_snapshot(self):
        from .market_batch import _goal_buy
        from .market_models import MarketListing
        from .market_plan_models import MarketPlan, MarketGoal
        from .market_plan_candidates import _crafting_facts
        # 第一条只有一件，不能解锁两件土豆的食谱；第二条可补齐，仍使用同一库存快照。
        for index, quantity in enumerate((1, 2)):
            MarketListing.objects.create(pk=f'listing-{index}', owner_id='owner',
                seller_id=self.seller.pk, seller_name=self.seller.name,
                item={'source': {'sku': 'crop.potato', 'stars': 1}},
                initial_quantity=quantity, remaining_quantity=quantity, unit_price=index + 1)
        plan = MarketPlan.objects.create(pk='plan', owner_id='owner', actor_id=self.buyer.pk,
                                        actor_name=self.buyer.name, plan_date=timezone.now().date())
        goal = MarketGoal.objects.create(pk='goal', plan=plan, kind='listing', sku='crop.potato',
                                         quantity=2, max_unit_price=10)
        with patch('system_settings.agent_world.market_plan_candidates._crafting_facts', wraps=_crafting_facts) as load:
            operation = _goal_buy('owner', self.buyer.pk, plan, goal, timezone.now())
            self.assertEqual(load.call_count, 1)
        self.assertEqual(operation['listing_id'], 'listing-1')
        self.assertEqual(operation['quantity'], 2)
        self.stock(self.buyer, 'crop.potato')
        self.assertTrue(listing_rows('owner', self.buyer.pk))
        self.assertFalse(listing_rows('foreign', self.buyer.pk))
