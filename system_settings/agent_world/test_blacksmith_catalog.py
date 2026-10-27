"""Approved recipes, future-route eligibility and owner-scoped read-only API contracts."""
import copy
from collections import Counter
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient
from system_settings.models import Agent, WorldAction
from .blacksmith_catalog import DEFAULT_RULES, MATERIALS, validate_rule
from .blacksmith_candidates import template_options, recipe_options
from .blacksmith_models import BlacksmithCatalog, BlacksmithOperation
from .combat.catalog import bundled
from .combat.models import CombatCatalog, CombatProfile
from .combat.store import digest
from .life_models import LifeProfile
from .travel_models import AgentInventoryItem


class BlacksmithRecipeTests(SimpleTestCase):
    def test_all_seventy_recipes_match_the_independent_minimum_multiplier(self):
        # Restate the product table rather than reusing the implementation's weights.
        pools = [('叶壳碎片', '绒耳兔毛', '黏液'), ('晶蜥鳞', '蝠翼', '晨光粉尘'),
            ('铁矿', '孢子', '狼牙'), ('骨片', '水灵精华', '狼牙'),
            ('灰烬粉', '水灵精华', '骨片'), ('熔岩碎片', '灰烬粉', '遗迹碎晶'),
            ('熔岩碎片', '熔岩碎片', '火焰核心'), ('裂隙粉尘', '裂隙粉尘', '火焰核心'),
            ('星蚀结晶', '裂隙粉尘', '领主残核'), ('星蚀结晶', '星蚀结晶', '领主残核')]
        bands = [(1, 10), *[(low, low + 10) for low in range(10, 90, 10)], (90, 99)]
        ratios = {'weapon': (6, 2, 0), 'offhand': (4, 0, 3), 'head': (0, 3, 2),
                  'body': (4, 6, 0), 'hands': (0, 4, 1), 'feet': (2, 4, 0), 'accessory': (1, 0, 4)}
        by_name = {row['name']: row for row in MATERIALS.values()}
        self.assertEqual(len(DEFAULT_RULES), 70)
        for (low, high), names in zip(bands, pools):
            target = 2 * Decimal('1.1') * (10 + Decimal('.5') * high)
            for slot, weights in ratios.items():
                with self.subTest(band=(low, high), slot=slot):
                    merged = Counter()
                    for name, weight in zip(names, weights):
                        if weight:
                            merged[name] += weight
                    for multiplier in range(1, 1000):
                        amounts = {name: min(2, weight * multiplier) if name in
                            {'遗迹碎晶', '火焰核心', '领主残核'} else weight * multiplier
                            for name, weight in merged.items()}
                        # Published quantities were fixed using the original material curve.
                        cost = sum((Decimal('1') + Decimal('.04') * by_name[name]['level']) * count
                                   for name, count in amounts.items())
                        if cost >= target:
                            break
                    actual = DEFAULT_RULES[f'{low}-{high}:{slot}']
                    self.assertEqual({row['name']: row['quantity'] for row in actual['ingredients']}, amounts)
                    self.assertEqual(actual['energy_cost'], 2)
                    self.assertEqual(validate_rule(actual), actual)
                    for row in actual['ingredients']:
                        sources = MATERIALS[row['sku']]['sources']
                        self.assertTrue(any(source['rank'] != 'boss'
                            and max(low, source['level_min']) <= min(high, source['level_max'])
                            and max(low, source['dungeon_level_min']) <= min(high, source['dungeon_level_max'])
                            for source in sources))

    def test_frozen_rule_rejects_cost_underflow_and_boolean_metadata(self):
        rule = copy.deepcopy(DEFAULT_RULES['1-10:weapon'])
        rule['ingredients'] = [{**row, 'quantity': 1} for row in rule['ingredients']]
        with self.assertRaisesRegex(ValueError, '回收价值'):
            validate_rule(rule)
        rule = copy.deepcopy(DEFAULT_RULES['1-10:weapon'])
        rule['level_min'] = True
        with self.assertRaises(ValueError):
            validate_rule(rule)


class BlacksmithCandidateTests(SimpleTestCase):
    def setUp(self):
        self.catalog = bundled()[0]

    def types(self, job, band, slot, level=10):
        profile = SimpleNamespace(progression={'job': job, 'level': level})
        return template_options(self.catalog, profile, DEFAULT_RULES[f'{band}:{slot}'])

    def test_future_mastery_and_item_level_do_not_remove_the_route(self):
        options = self.types('job.warrior', '50-60', 'weapon')
        sword = next(row for row in options if row['equipment_type'] == 'two_handed_sword')
        self.assertEqual((sword['level_min'], sword['level_max']), (50, 60))
        self.assertFalse(sword['can_equip'])
        self.assertIn('job.swordsman', sword['job_ids'])
        self.assertFalse(self.types('job.guardian', '50-60', 'weapon', 30))
        self.assertTrue(self.types('job.elementalist', '30-40', 'weapon', 30))
        self.assertFalse(self.types('job.occultist', '30-40', 'weapon', 30)
                         and any(row['equipment_type'] == 'two_handed_staff'
                                 for row in self.types('job.occultist', '30-40', 'weapon', 30)))

    def test_branch_exclusions_novice_and_missing_catalog_ranges(self):
        self.assertEqual({row['equipment_type'] for row in self.types('job.archer', '10-20', 'weapon', 30)}, {'generic', 'bow'})
        self.assertEqual({row['equipment_type'] for row in self.types('job.assassin', '10-20', 'weapon', 30)}, {'generic', 'dagger'})
        self.assertEqual({row['equipment_type'] for row in self.types('job.novice', '10-20', 'weapon', 1)}, {'generic'})
        self.assertFalse(self.types('job.swordmaster', '90-99', 'weapon', 90))
        self.assertFalse(self.types('job.swordmaster', '90-99', 'accessory', 90))

    def test_both_accessory_types_share_one_rule_and_empty_profile_never_executes(self):
        rule = DEFAULT_RULES['10-20:accessory']
        profile = SimpleNamespace(progression={'job': 'job.warrior', 'level': 10})
        self.assertEqual({row['equipment_type'] for row in template_options(self.catalog, profile, rule)}, {'pendant', 'ring'})
        pool = [{**row, 'quantity': row['quantity'] * 3} for row in rule['ingredients']]
        self.assertFalse(recipe_options({rule['id']: rule}, self.catalog, None, pool, 100))
        self.assertEqual(recipe_options({rule['id']: rule}, self.catalog, profile, pool, 6)[rule['id']]['max_pieces'], 3)
        self.assertFalse(recipe_options({rule['id']: rule}, self.catalog, profile, pool, 1))

    def test_shared_level_endpoints_keep_both_legal_templates(self):
        options = self.types('job.warrior', '30-40', 'head')
        self.assertEqual([row['template_id'] for row in options], ['equip.head', 'equip.head.30'])
        self.assertEqual([(row['level_min'], row['level_max']) for row in options], [(30, 30), (30, 40)])
        prior = self.types('job.warrior', '20-30', 'head')
        self.assertEqual([row['template_id'] for row in prior], ['equip.head', 'equip.head.30'])
        self.assertEqual([(row['level_min'], row['level_max']) for row in prior], [(20, 30), (30, 30)])


class BlacksmithApiTests(TestCase):
    def setUp(self):
        temp = TemporaryDirectory(prefix='odoc-blacksmith-api-')
        self.addCleanup(temp.cleanup)
        setting = self.settings(MEDIA_ROOT=temp.name, ODOC_WORLD_LOCK_PATH=str(Path(temp.name) / 'world.lock'))
        setting.enable()
        self.addCleanup(setting.disable)
        self.enterContext(patch('system_settings.decision.routing.complete', side_effect=AssertionError('不得请求真实模型')))
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_superuser('admin', password='test'))
        self.agent = Agent.objects.create(name='铁匠测试居民')
        self.url = '/api/settings/agent-world/blacksmith/recipes/'

    def initialize(self):
        catalog = bundled()[0]
        CombatCatalog.objects.create(pk=catalog.version, tables=catalog.tables, digest=digest(catalog.tables))
        return CombatProfile.objects.create(pk=self.agent.pk, owner_id='admin', actor_name=self.agent.name,
            catalog_id=catalog.version, progression={'level': 10, 'job': 'job.warrior', 'skills': {}})

    def test_get_is_read_only_and_accepts_camel_case_actor(self):
        response = self.client.get(self.url, {'agentId': self.agent.pk})
        self.assertEqual(response.status_code, 200)
        data = response.json()['data']
        self.assertEqual(len(data['recipes']), 70)
        self.assertFalse(data['actor']['initialized'])
        self.assertTrue(all(row['state'] == 'unavailable' for row in data['recipes']))
        self.assertEqual(data['energyCost'], 2)
        self.assertFalse(BlacksmithCatalog.objects.exists())
        self.assertFalse(CombatProfile.objects.exists())
        self.assertFalse(CombatCatalog.objects.exists())
        self.assertEqual(APIClient().get(self.url).status_code, 401)

    def test_owner_permissions_and_foreign_history(self):
        LifeProfile.objects.create(pk=self.agent.pk, owner_id='foreign')
        self.assertEqual(self.client.get(self.url, {'agentId': self.agent.pk}).status_code, 403)
        response = self.client.get(f'/api/settings/agent-world/blacksmith/agents/{self.agent.pk}/history/')
        self.assertEqual(response.status_code, 403)

    def test_reserved_materials_are_not_executable(self):
        self.initialize()
        rule = DEFAULT_RULES['1-10:weapon']
        for index, row in enumerate(rule['ingredients']):
            AgentInventoryItem.objects.create(pk=f'stock-{index}', owner_id='admin', actor_id=self.agent.pk,
                name=row['name'], kind='combat_material', quantity=row['quantity'], value=row['price'], source={'sku': row['sku']})
        ready = self.client.get(self.url, {'agentId': self.agent.pk}).data['data']
        self.assertEqual(next(row for row in ready['recipes'] if row['id'] == rule['id'])['state'], 'ready')
        WorldAction.objects.create(pk='reserved', actor_id=self.agent.pk,
            snapshot={'blacksmith': True, 'owner_id': 'admin', 'current': {'reservation': {'ingredients': rule['ingredients']}}})
        data = self.client.get(self.url, {'agentId': self.agent.pk}).data['data']
        recipe = next(row for row in data['recipes'] if row['id'] == rule['id'])
        self.assertEqual(recipe['state'], 'missing')
        self.assertEqual(recipe['ingredients'][0]['reserved'], rule['ingredients'][0]['quantity'])
        self.assertEqual(recipe['ingredients'][0]['available'], 0)

    def test_patch_is_materials_only_and_bumps_account_version(self):
        rule = DEFAULT_RULES['1-10:weapon']
        payload = {'ingredients': [{'sku': row['sku'], 'quantity': row['quantity'] + 1} for row in rule['ingredients']]}
        response = self.client.patch(self.url + rule['id'] + '/', payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['version'], 2)
        self.assertEqual(BlacksmithCatalog.objects.get(pk='admin').version, 2)
        response = self.client.patch(self.url + rule['id'] + '/', {**payload, 'energyCost': 1}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(BlacksmithCatalog.objects.get(pk='admin').version, 2)
        payload = {'ingredients': [{'sku': rule['ingredients'][0]['sku'], 'quantity': 1}]}
        self.assertEqual(self.client.patch(self.url + rule['id'] + '/', payload, format='json').status_code, 400)

    def test_history_pages_activities_and_preserves_stages_without_receipts(self):
        for index in range(21):
            WorldAction.objects.create(pk=f'activity-{index:02}', actor_id=self.agent.pk, status='skipped',
                snapshot={'blacksmith': True, 'owner_id': 'admin', 'decisions': [{'scene': 'band', 'choice': 'stop'}]},
                result={'reason': '没有适合的配方'})
        BlacksmithOperation.objects.create(pk='old-piece', owner_id='admin', actor_id=self.agent.pk,
            actor_name=self.agent.name, opportunity_id='activity-20', piece_index=0, recipe_id='1-10:weapon',
            snapshot={'rule': DEFAULT_RULES['1-10:weapon']}, result={'equipment_id': 'saved-item'}, reason='保存结果')
        url = f'/api/settings/agent-world/blacksmith/agents/{self.agent.pk}/history/'
        data = self.client.get(url).data['data']
        self.assertEqual((data['total'], len(data['list'])), (21, 20))
        first = data['list'][0]
        self.assertEqual(first['stages'][0]['scene'], 'band')
        self.assertEqual(first['operations'][0]['result']['equipment_id'], 'saved-item')
        self.assertEqual(len(self.client.get(url, {'page': 2}).data['data']['list']), 1)
        self.assertEqual(self.client.get(url, {'page': 0}).status_code, 400)
