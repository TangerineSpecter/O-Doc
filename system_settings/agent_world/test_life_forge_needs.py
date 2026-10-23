from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from . import test_blacksmith_runtime as fixtures
from .blacksmith_goals import eligible, register
from .blacksmith_models import BlacksmithGoal
from .inventory_stock import add_stock, take_stock
from .life_interleaving_summaries import forging_needs


class ForgeDecisionNeedsTests(TestCase):
    def setUp(self):
        fixtures.BlacksmithEntryTests.setUp(self)
        option = eligible('owner', self.agent.pk)['1-10:weapon']
        for index in range(3):
            register('owner', self.agent.pk, '1-10:weapon', option['types'][0]['template_id'], str(index))

    def consume_materials(self, copies):
        for part in self.rule['ingredients']:
            take_stock(self.agent.pk, 'owner', part['sku'], part['quantity'] * copies)

    def test_full_unready_forge_keeps_independent_needs_in_selection_input(self):
        from .combat.schedule import ensure_task
        from .life_interleaving_candidates import build, selection_input
        self.consume_materials(3)
        ensure_task('owner')
        with patch('system_settings.agent_world.life_interleaving_candidates.capacity',
                   return_value={'energy': 100, 'projection': {'safe': True}}):
            candidates, resource, gap = build(self.config, self.agent, item=self.item)
        self.assertNotIn('blacksmith', candidates)
        self.assertIn('exploration', candidates)
        state = selection_input(self.config, self.agent, candidates, resource, gap, timezone.now())
        need = next(row for row in state['needs'] if row.get('kind') == 'blacksmith_materials')
        self.assertEqual(len(need['goals']), 3)
        self.assertTrue(need['can_gather_by_exploration_now'])
        for material in need['materials']:
            required = next(row['quantity'] for row in self.rule['ingredients'] if row['sku'] == material['sku']) * 3
            self.assertEqual(material['required_quantity'], required)
            self.assertEqual(material['missing_quantity'], required)
            self.assertEqual(material['available_quantity'], 0)

    def test_shared_stock_is_deducted_once_and_replenishment_updates_demand(self):
        self.consume_materials(2)
        need = forging_needs('owner', self.agent.pk, can_explore=True)[0]
        for part in self.rule['ingredients']:
            row = next(row for row in need['materials'] if row['sku'] == part['sku'])
            self.assertEqual(row['available_quantity'], part['quantity'])
            self.assertEqual(row['missing_quantity'], part['quantity'] * 2)
            add_stock(self.agent.pk, 'owner', self.agent.name, part['sku'], part['quantity'] * 2,
                      part['name'], 'combat_material', part['price'])
        after = forging_needs('owner', self.agent.pk, can_explore=True)[0]
        self.assertTrue(all(row['missing_quantity'] == 0 for row in after['materials']))
        self.assertFalse(after['can_gather_by_exploration_now'])
        BlacksmithGoal.objects.filter(actor_id=self.agent.pk).update(status='completed')
        self.assertEqual(forging_needs('owner', self.agent.pk, can_explore=True), [])

    def test_no_exploration_or_unreachable_sources_do_not_claim_gatherable(self):
        self.consume_materials(3)
        self.assertFalse(forging_needs('owner', self.agent.pk, can_explore=False)[0]['can_gather_by_exploration_now'])
        definitions = {part['sku']: {'sources': [{'dungeon_id': 'future', 'dungeon_name': '未来迷宫',
                       'dungeon_level_min': 20}]} for part in self.rule['ingredients']}
        with patch('system_settings.agent_world.blacksmith_catalog.material_definitions', return_value=definitions):
            need = forging_needs('owner', self.agent.pk, can_explore=True)[0]
        self.assertFalse(need['can_gather_by_exploration_now'])
        self.assertFalse(need['materials'][0]['source_dungeons'][0]['currently_reachable'])

    def test_invalid_or_other_owner_goals_do_not_enter_input(self):
        self.assertEqual(forging_needs('other-owner', self.agent.pk, can_explore=True), [])
        BlacksmithGoal.objects.filter(actor_id=self.agent.pk).update(status='invalid')
        self.assertEqual(forging_needs('owner', self.agent.pk, can_explore=True), [])
