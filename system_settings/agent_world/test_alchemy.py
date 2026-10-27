from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient
from system_settings.models import Agent, AgentTask, AIModel, AIProvider

from .alchemy_catalog import DEFAULT_RULES, MATERIALS, ingredient_value, rules_for, validate_rule
from .alchemy_models import AlchemyCatalog
from .alchemy_quality import RULES, experience_for, material_stars, outcome, probabilities, skill_progress, unit_value
from .cooking_quality import skill_progress as cooking_progress
from .elixir_effects import VERSION, effects_for, validate_carried
from .alchemy_limits import CARRY_CAP


class AlchemyRulesTests(TestCase):
    def test_current_recipe_value_tracks_material_prices_and_existing_custom_ingredients(self):
        import copy
        from .combat.catalog import bundled
        catalog = bundled()[0]
        for sku, (_, _, value) in MATERIALS.items():
            self.assertEqual(value, catalog.row('materials', sku.removeprefix('combat.'))['sale_price'])
        for rule in DEFAULT_RULES.values():
            self.assertEqual(rule['sale_price'], ingredient_value(rule['ingredients']))
        stored = copy.deepcopy(DEFAULT_RULES)
        stored['healing']['ingredients'][0]['quantity'] = 4
        stored['healing']['sale_price'] = '999.00'
        AlchemyCatalog.objects.create(pk='admin', rules=stored)
        current = rules_for('admin')['healing']
        self.assertEqual(current['sale_price'], '22.50')
        self.assertEqual(AlchemyCatalog.objects.get(pk='admin').rules['healing']['sale_price'], '999.00')

    def test_ten_recipes_unlock_between_levels_one_and_ten(self):
        self.assertEqual(len(DEFAULT_RULES), 10)
        self.assertEqual([row['required_level'] for row in DEFAULT_RULES.values()], list(range(1, 11)))
        for rule in DEFAULT_RULES.values():
            self.assertTrue(set(row['sku'] for row in rule['ingredients']) <= set(MATERIALS))

    def test_level_curve_matches_cooking(self):
        for experience in (0, 99, 100, 200, 1900, 2500, 20000, 400000):
            self.assertEqual(skill_progress(experience)['level'], cooking_progress(experience)['level'])
        self.assertEqual(skill_progress(0)['level'], 1)

    def test_quality_uses_material_tier_and_is_deterministic(self):
        materials = [{'inventory_id': 'a', 'sku': 'combat.material.moss_cave.1', 'quantity': 2, 'price': '1.04'}]
        snapshot = {'quality_rules': RULES, 'base_values': {'combat.material.moss_cave.1': '1.04'},
                    'material_tiers': {'combat.material.moss_cave.1': 1},
                    'sale_price': '12.00', 'experience': 12}
        self.assertEqual(material_stars(materials, snapshot['base_values'], snapshot['material_tiers']), Decimal(1))
        first = outcome('op:0', 50, materials, snapshot)
        self.assertEqual(first, outcome('op:0', 50, materials, snapshot))
        self.assertIn(first['stars'], range(1, 6))
        self.assertEqual(Decimal(first['unit_price']), unit_value('12.00', first['stars']))
        self.assertEqual(first['experience_gained'], experience_for(12, first['stars']))

    def test_star_probabilities_sum_to_one_and_scale_with_level(self):
        low, high = probabilities(1, 1), probabilities(99, 5)
        self.assertAlmostEqual(sum(low), 1, places=9)
        self.assertAlmostEqual(sum(high), 1, places=9)
        self.assertGreater(low[0], high[0])

    def test_effect_versions_and_star_scaling(self):
        base, top = effects_for('aegis', 1), effects_for('aegis', 5)
        self.assertEqual(base['shield'], .28)
        self.assertEqual(top['shield'], .49)
        self.assertEqual(effects_for('purify', 5)['immune_duration'], 3)
        with self.assertRaises(ValueError):
            effects_for('aegis', 6)
        with self.assertRaises(ValueError):
            effects_for('aegis', 1, VERSION + 1)

    def test_carry_cap_and_duplicate_validation(self):
        self.assertEqual(validate_carried([{'recipe_id': 'healing', 'stars': 1, 'count': 5}], CARRY_CAP)[0]['count'], 5)
        for rows in ([{'recipe_id': 'healing', 'stars': 1, 'count': 6}],
                     [{'recipe_id': 'healing', 'stars': 1, 'count': 3}, {'recipe_id': 'healing', 'stars': 1, 'count': 3}],
                     [{'recipe_id': 'healing', 'stars': 1, 'count': 3}, {'recipe_id': 'focus', 'stars': 1, 'count': 3}],
                     [{'recipe_id': 'unknown', 'stars': 1, 'count': 1}]):
            with self.assertRaises(ValueError):
                validate_carried(rows, CARRY_CAP)

    def test_rule_level_is_capped_at_ten(self):
        rule = {key: value for key, value in DEFAULT_RULES['healing'].items() if key != 'name'}
        self.assertEqual(validate_rule({**rule, 'required_level': 10})['required_level'], 10)
        with self.assertRaises(ValidationError):
            validate_rule({**rule, 'required_level': 11})


class AlchemyApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_superuser('admin', 'alchemy@example.invalid', 'test'))

    def test_catalog_lists_recipes_and_carry_cap(self):
        response = self.client.get('/api/settings/agent-world/alchemy/recipes/')
        self.assertEqual(response.status_code, 200)
        data = response.data['data']
        self.assertEqual(len(data['recipes']), 10)
        self.assertEqual(data['carry_cap'], 5)
        self.assertEqual(len(data['materials']), 28)
        first = data['recipes'][0]
        self.assertEqual(first['sku'], 'elixir.healing')
        self.assertEqual(len(first['effects']), 5)
        self.assertIn('summary', first['effects'][0])

    def test_requires_authentication(self):
        self.assertEqual(APIClient().get('/api/settings/agent-world/alchemy/recipes/').status_code, 401)

    def test_edit_derives_value_from_materials_not_submitted_price(self):
        rule = {key: value for key, value in DEFAULT_RULES['healing'].items() if key != 'name'}
        rule['ingredients'] = [{'sku': 'combat.material.moss_cave.1', 'quantity': 3}]
        rule['sale_price'] = '1.00'
        response = self.client.patch('/api/settings/agent-world/alchemy/recipes/healing/', rule, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['sale_price'], '13.50')
        self.assertEqual(rules_for('admin')['healing']['sale_price'], '13.50')


class AlchemyTaskWiringTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_superuser('admin', 'alchemy@example.invalid', 'test'))
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        self.agent = Agent.objects.create(name='炼金师', model=AIModel.objects.create(name='test', type='chat', provider=provider))

    def payload(self):
        return {'task_kind': 'alchemy', 'name': '炼金制作', 'agent': self.agent.pk,
                'agents': [self.agent.pk], 'trigger': '定时任务'}

    def test_task_creation_records_owner_and_reuses_entry(self):
        first = self.client.post('/api/settings/agent-tasks/', self.payload(), format='json')
        self.assertEqual(first.status_code, 200, first.data)
        task = AgentTask.objects.get(task_kind='alchemy')
        self.assertEqual(task.alchemy_config, {'owner_id': 'admin'})
        self.assertEqual(task.name, '炼金制作')
        self.assertFalse(task.enabled)
        again = self.client.post('/api/settings/agent-tasks/', self.payload(), format='json')
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(AgentTask.objects.filter(task_kind='alchemy').count(), 1)
        self.assertEqual(again.data['data']['id'], task.pk)

    def test_foreign_alchemy_task_rejects_other_owner(self):
        AgentTask.objects.create(id='alchemy-owner', task_kind='alchemy', name='炼金制作',
            agent=self.agent, agent_ids=[self.agent.pk], alchemy_config={'owner_id': 'admin'})
        from .investment_service import validate_agents
        with self.assertRaisesRegex(ValueError, '炼金'):
            validate_agents('other', [self.agent.pk])


class AlchemyIconTests(TestCase):
    def test_elixir_icon_is_stored_in_alchemy_catalog(self):
        from .item_catalog_icons import catalog_icon_usage_counts, set_catalog_item_icon
        AlchemyCatalog.objects.create(pk='admin', item_icons={'elixir.healing': 'asset-1'})
        self.assertEqual(catalog_icon_usage_counts(['asset-1']), {'asset-1': 1})
        set_catalog_item_icon('admin', 'elixir.healing', None)
        self.assertEqual(AlchemyCatalog.objects.get(pk='admin').item_icons, {})
        with self.assertRaises(LookupError):
            set_catalog_item_icon('admin', 'elixir.unknown', None)


class AlchemyScheduleEnergyTests(TestCase):
    def setUp(self):
        temp = TemporaryDirectory(prefix='odoc-alchemy-energy-tests-')
        self.addCleanup(temp.cleanup)
        isolation = self.settings(MEDIA_ROOT=temp.name, ODOC_WORLD_LOCK_PATH=str(Path(temp.name) / 'world.lock'))
        isolation.enable()
        self.addCleanup(isolation.disable)
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='炼金师', model=model)
        self.task = AgentTask.objects.create(name='炼金', task_kind='alchemy', enabled=True,
            agent=self.agent, agent_ids=[self.agent.pk], alchemy_config={'owner_id': 'admin'})
        from .inventory_stock import add_stock
        for ingredient in DEFAULT_RULES['healing']['ingredients']:
            add_stock(self.agent.pk, 'admin', self.agent.name, ingredient['sku'], ingredient['quantity'],
                      '素材', 'combat_material', '1', 'fixture')

    def execute(self, energy):
        from .life_models import LifeItem
        from .life_time import local_time
        from .life_runner import execute_item
        item = LifeItem.objects.create(pk='alchemy-slot', owner_id='admin', actor_id=self.agent.pk,
            activity='alchemy', task_id=self.task.pk, original_at=local_time(), scheduled_at=local_time())
        with patch('system_settings.agent_world.life_runner.stamina', return_value=Decimal(energy)), \
                patch('system_settings.agent_world.alchemy_queries.recipes', side_effect=AssertionError('体力预检不生成图鉴')), \
                patch('system_settings.agent_world.life_runner.check_goals'), \
                patch('system_settings.agent_world.alchemy_runner.run_alchemy_opportunity',
                      return_value=SimpleNamespace(pk='record', status='success', summary='已制作')) as run:
            execute_item(item, None)
        item.refresh_from_db()
        return item, run

    def test_one_energy_can_start_default_one_energy_recipe(self):
        item, run = self.execute('1')
        run.assert_called_once()
        self.assertEqual(item.status, 'completed')

    def test_insufficient_energy_still_defers(self):
        item, run = self.execute('0')
        run.assert_not_called()
        self.assertEqual((item.status, item.attempts), ('deferred', 1))

    def test_edited_recipe_cost_is_used_instead_of_fixed_threshold(self):
        from .alchemy_catalog import catalog_for
        catalog = catalog_for('admin')
        catalog.rules['healing']['energy_cost'] = 3
        catalog.save()
        item, run = self.execute('2')
        run.assert_not_called()
        self.assertEqual(item.status, 'deferred')

    def test_start_energy_ignores_locked_and_material_short_recipes(self):
        from .alchemy_catalog import catalog_for
        from .alchemy_queries import minimum_start_energy
        from .inventory_stock import add_stock, stock_rows
        catalog = catalog_for('admin')
        catalog.rules['healing']['energy_cost'] = 3
        catalog.save()
        for ingredient in DEFAULT_RULES['focus']['ingredients']:
            add_stock(self.agent.pk, 'admin', self.agent.name, ingredient['sku'], ingredient['quantity'],
                      '素材', 'combat_material', '1', 'fixture')
        # 更省体力但等级未解锁，不能降低旧日程的启动门槛。
        self.assertEqual(minimum_start_energy('admin', self.agent), 3)
        catalog.rules['focus']['required_level'] = 1
        catalog.save()
        self.assertEqual(minimum_start_energy('admin', self.agent), 1)
        stock_rows(self.agent.pk, 'admin', DEFAULT_RULES['focus']['ingredients'][0]['sku']).delete()
        self.assertEqual(minimum_start_energy('admin', self.agent), 3)
