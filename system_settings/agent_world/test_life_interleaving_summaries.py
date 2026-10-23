from datetime import datetime
from unittest.mock import patch

from django.test import SimpleTestCase

from .life_interleaving_summaries import crafting, forging, fishing
from .life_schedule import SHANGHAI


class LiveOpportunityTests(SimpleTestCase):
    def test_crafting_reflects_material_consumption_and_energy(self):
        from .cooking_schedule_plan import recipe_options
        from .alchemy_schedule_plan import recipe_options as alchemy_options
        rules = {'one': {'name': '样例', 'required_level': 1, 'energy_cost': 2,
                         'ingredients': [{'sku': 'material', 'quantity': 1}]}}
        for kind, select in [('cooking', recipe_options), ('alchemy', alchemy_options)]:
            with self.subTest(kind=kind):
                pool = [{'sku': 'material', 'quantity': 4}]
                before = crafting(select(rules, 1, pool, 100), kind)
                pool[0]['quantity'] = 1
                after = crafting(select(rules, 1, pool, 100), kind)
                self.assertEqual(before['available_recipes'][0]['max_quantity'], 4)
                self.assertEqual(after['available_recipes'][0]['max_quantity'], 1)
                self.assertNotEqual(before['opportunity'], after['opportunity'])
                pool[0]['quantity'] = 4
                limited = crafting(select(rules, 1, pool, 2), kind)
                self.assertEqual(limited['available_recipes'][0]['max_quantity'], 1)
                self.assertIn('不可相加', limited['quantity_basis'])

    def test_registering_requires_eligibility_not_only_free_slots(self):
        state = {'goals': [], 'free_slots': 3, 'can_register': False}
        self.assertEqual(forging(state, 100)['registerable_goals'], 0)
        state['can_register'] = True
        self.assertEqual(forging(state, 100)['registerable_goals'], 3)

    def test_forging_shared_materials_and_energy_are_not_counted_twice(self):
        goal = {'ready': True, 'ingredients': [{'sku': 'ore', 'required': 2, 'available': 2}]}
        state = {'goals': [goal, goal], 'free_slots': 1, 'can_register': True}
        self.assertEqual(forging(state, 100)['craftable_equipment_now'], 1)
        goal['ingredients'][0]['available'] = 4
        self.assertEqual(forging(state, 100)['craftable_equipment_now'], 2)
        self.assertEqual(forging(state, 2)['craftable_equipment_now'], 1)

    def test_fishing_counts_usable_casts_and_changes_after_consumption(self):
        from .fishing.catalog import builtin
        rules = builtin()
        now = datetime(2026, 10, 23, 14, tzinfo=SHANGHAI)
        stock = {'worm': 12, 'unknown_bait': 999}
        with patch('system_settings.agent_world.fishing.service.inventory', return_value=stock), \
             patch('system_settings.agent_world.fishing.service.spots', return_value={'pond': rules['spots']['pond']}):
            self.assertEqual(fishing('owner', 'actor', now, rules, [30], 100)['fishing_opportunities'], 12)
            stock['worm'] = 1
            self.assertEqual(fishing('owner', 'actor', now, rules, [30], 100)['fishing_opportunities'], 1)
            stock['worm'] = 100
            self.assertEqual(fishing('owner', 'actor', now, rules, [30], 100)['fishing_opportunities'], 30)
            self.assertEqual(fishing('owner', 'actor', now, rules, [30], 4)['fishing_opportunities'], 2)

    def test_fishing_cannot_combine_baits_from_different_spots(self):
        from .fishing.catalog import builtin
        rules = builtin()
        with patch('system_settings.agent_world.fishing.service.inventory', return_value={'worm': 7, 'corn': 8}), \
             patch('system_settings.agent_world.fishing.service.spots', return_value=rules['spots']), \
             patch('system_settings.agent_world.fishing.rules.bait_facts', side_effect=lambda rules, stock, spot, at, minutes:
                   {'bait': {'quantity': 7 if spot == 'pond' else 8}}):
            result = fishing('owner', 'actor', datetime(2026, 10, 23, 14, tzinfo=SHANGHAI), rules, [30], 100)
            self.assertEqual(result['fishing_opportunities'], 8)
