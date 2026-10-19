from decimal import Decimal
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient
from system_settings.models import Agent, AgentTask, AIModel, AIProvider

from .alchemy_catalog import DEFAULT_RULES, MATERIALS, validate_rule
from .alchemy_models import AlchemyCatalog
from .alchemy_quality import RULES, experience_for, material_stars, outcome, probabilities, skill_progress, unit_value
from .cooking_quality import skill_progress as cooking_progress
from .elixir_effects import VERSION, effects_for, validate_carried
from .alchemy_limits import CARRY_CAP


class AlchemyRulesTests(TestCase):
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
