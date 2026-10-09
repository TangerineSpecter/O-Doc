import copy
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from .farm_catalog import DEFAULT_RULES
from .farm_models import FarmCatalog, AgentFarm
from .travel_models import AgentInventoryItem


class ItemCatalogTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_superuser('admin', 'catalog@example.invalid', 'test'))

    def add_item(self, item_id, owner='admin', **extra):
        extra.setdefault('quantity', 1)
        return AgentInventoryItem.objects.create(pk=item_id, actor_id='resident', owner_id=owner,
            actor_name='居民', name='明信片', value=10, **extra)

    def entries(self):
        response = self.client.get('/api/settings/agent-world/item-catalog/')
        self.assertEqual(response.status_code, 200)
        return response.data['data']

    def test_empty_world_has_complete_catalog_without_creating_farm(self):
        rows = self.entries()
        self.assertEqual(len(rows), 2 * len(DEFAULT_RULES['crops']) + 7)
        self.assertEqual({row['category'] for row in rows}, {'seed', 'feed', 'crop', 'animal_product'})
        self.assertFalse(FarmCatalog.objects.exists())
        self.assertFalse(AgentFarm.objects.exists())
        self.assertFalse(AgentInventoryItem.objects.exists())

    def test_quantities_use_sku_across_sources_and_exclude_other_owners(self):
        self.add_item('seed-market', kind='seed', quantity=7, source={'sku': 'seed.radish', 'market': True})
        self.add_item('seed-farm', kind='farm_seed', quantity=2, source={'sku': 'seed.radish'})
        self.add_item('private-seed', owner='private', quantity=99, source={'sku': 'seed.radish'})
        self.add_item('private-souvenir', owner='private')
        rows = self.entries()
        self.assertEqual(len(rows), 2 * len(DEFAULT_RULES['crops']) + 7)
        self.assertEqual(next(row for row in rows if row['sku'] == 'seed.radish')['quantity'], 9)

    def test_souvenirs_merge_same_identity_but_keep_different_destinations(self):
        for item_id, city in [('one', '上海'), ('two', '上海'), ('three', '北京')]:
            self.add_item(item_id, quantity=2, source={'destination': {'city': city}})
        rows = [row for row in self.entries() if row['category'] == 'souvenir']
        self.assertEqual(len(rows), 2)
        self.assertEqual(sorted(row['quantity'] for row in rows), [2, 4])

    def test_current_prices_and_gold_multiplier_follow_catalog(self):
        rules = copy.deepcopy(DEFAULT_RULES)
        rules['animals']['cow']['sale_price'] = 123
        FarmCatalog.objects.create(pk='admin', seed='test', rules=rules)
        rows = self.entries()
        self.assertEqual(next(row for row in rows if row['sku'] == 'product.cow.gold')['sale_price'], 369)

    def test_anonymous_cannot_read(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/settings/agent-world/item-catalog/').status_code, (401, 403))
