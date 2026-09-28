import csv
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.test import TestCase

from .agent_world.travel_csv import HEADERS
from .agent_world.travel_models import TravelDestination, TravelSeedState
from .agent_world.travel_seed import SEED_UPDATED_AT, initialize_travel_destinations
from .agent_world.travel_startup import initialize_after_migrate, start_travel_initialization
from .models import SyncEntityState
from .sync_state import LOCAL_ONLY_MODEL_LABELS


class TravelSeedTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'cities.csv'
        self.rows = [['1', 'CN', '中国', '四川', '成都', 'Chengdu', '5000', '1'],
                     ['2', 'CN', '中国', '广东', '惠州', 'Huizhou', '2800', '1']]
        self.write_rows()

    def write_rows(self):
        with self.path.open('w', encoding='utf-8-sig', newline='') as stream:
            writer = csv.writer(stream)
            writer.writerow(HEADERS)
            writer.writerows(self.rows)

    def test_import_and_repeat_preserve_edits(self):
        self.assertEqual(initialize_travel_destinations(self.path), 2)
        city = TravelDestination.objects.get(pk='1')
        self.assertEqual(city.updated_at, SEED_UPDATED_AT)
        city.price = Decimal('1234')
        city.enabled = False
        city.save(update_fields=['price', 'enabled'])
        self.assertGreater(city.updated_at, SEED_UPDATED_AT)
        self.assertEqual(initialize_travel_destinations(self.path), 0)
        city.refresh_from_db()
        self.assertEqual(city.price, Decimal('1234'))
        self.assertFalse(city.enabled)
        self.assertEqual(TravelSeedState.objects.count(), 1)

    def test_new_version_only_adds_missing_and_preserves_tombstones(self):
        initialize_travel_destinations(self.path)
        TravelDestination.objects.filter(pk='1').update(price=777, enabled=False)
        TravelDestination.objects.get(pk='2').delete()
        # 模拟未来开启同步后，另一设备带来的删除修订。
        SyncEntityState.objects.update_or_create(model_label='system_settings.traveldestination', object_pk='2', defaults={'is_deleted': True})
        self.rows.append(['3', 'TH', '泰国', '', '曼谷', 'Bangkok', '2800', '1'])
        self.write_rows()
        self.assertEqual(initialize_travel_destinations(self.path), 1)
        self.assertFalse(TravelDestination.objects.filter(pk='2').exists())
        self.assertEqual(TravelDestination.objects.get(pk='1').price, 777)

    def test_invalid_file_and_insert_failure_leave_no_partial_data(self):
        self.rows[1][6] = '0'
        self.write_rows()
        with self.assertRaises(ValueError):
            initialize_travel_destinations(self.path)
        self.assertFalse(TravelSeedState.objects.exists())
        self.assertFalse(TravelDestination.objects.exists())
        self.rows[1][6] = '2800'
        self.write_rows()
        with patch('django.db.models.query.QuerySet.bulk_create', side_effect=RuntimeError('failed')):
            with self.assertRaises(RuntimeError):
                initialize_travel_destinations(self.path)
        self.assertFalse(TravelSeedState.objects.exists())
        self.assertEqual(initialize_travel_destinations(self.path), 2)

    def test_sync_scope(self):
        self.assertIn('system_settings.travelseedstate', LOCAL_ONLY_MODEL_LABELS)
        self.assertNotIn('system_settings.traveldestination', LOCAL_ONLY_MODEL_LABELS)

    def test_management_and_test_processes_do_not_auto_initialize(self):
        with patch('sys.argv', ['manage.py', 'test']), patch(
            'system_settings.agent_world.travel_startup.initialize_travel_destinations'
        ) as initialize, patch('system_settings.agent_world.travel_startup.threading.Thread') as thread:
            from django.apps import apps
            initialize_after_migrate(apps.get_app_config('system_settings'))
            start_travel_initialization()
            initialize.assert_not_called()
            thread.assert_not_called()

    def test_city_cleanup_preserves_custom_prices_names_and_travel_history(self):
        import importlib
        import json
        from types import SimpleNamespace
        from django.apps import apps
        from .agent_world.travel_models import TravelJourney
        migration = importlib.import_module('system_settings.migrations.0041_travel_city_cleanup')
        manifest = json.loads((Path(migration.__file__).parent / 'data/0041_travel_city_cleanup.json').read_text())
        bad = TravelDestination.objects.create(pk='4366476', city='马里兰州', original_name='Randallstown',
            country_code='US', country='美国', region='马里兰州', price=7777, enabled=False)
        edited = TravelDestination.objects.create(pk='4938048', city='用户自定义名字', original_name='Grafton',
            country_code='US', country='美国', price=8888)
        disabled_id = manifest['disabled_ids'][0]
        blocked = TravelDestination.objects.create(pk=disabled_id, city='片区', country='测试', country_code='CN', price=1234)
        journey = TravelJourney.objects.create(pk='old-trip', actor_id='deleted-agent', owner_id='admin', destination_id=bad.pk,
            snapshot={'selected': {'id': bad.pk, 'city': '马里兰州'}, 'draft': {'content': '原游记'}})
        migration.clean_destinations(apps, SimpleNamespace(connection=SimpleNamespace(alias='default')))
        bad.refresh_from_db(); edited.refresh_from_db(); blocked.refresh_from_db(); journey.refresh_from_db()
        self.assertEqual(bad.city, '蘭道斯敦')
        self.assertEqual(bad.price, 7777)
        self.assertFalse(bad.enabled)
        self.assertEqual(edited.city, '用户自定义名字')
        self.assertFalse(blocked.enabled)
        self.assertEqual(blocked.price, 1234)
        self.assertEqual(journey.snapshot['selected']['city'], '马里兰州')
        self.assertEqual(journey.snapshot['draft']['content'], '原游记')
        self.assertEqual(journey.snapshot['destination_scope'], 'unconfirmed')

    def test_price_reduction_is_idempotent_preserves_custom_prices_and_fixed_quotes(self):
        import importlib
        import json
        from types import SimpleNamespace
        from django.apps import apps
        from .agent_world.travel_models import TravelJourney
        migration = importlib.import_module('system_settings.migrations.0042_reduce_travel_prices')
        groups = json.loads((Path(migration.__file__).parent / 'data/0042_travel_price_reduction.json').read_text())
        ids = groups['8700']
        city = TravelDestination.objects.create(pk=ids[0], city='城市', country='测试', country_code='CA', price=8700)
        custom = TravelDestination.objects.create(pk=ids[1], city='人工定价', country='测试', country_code='CA', price=7777, enabled=False)
        snapshot = {'selected': {'id': city.pk, 'price': '8700'}, 'goods': [{'price': '820'}]}
        journey = TravelJourney.objects.create(pk='fixed-quote', actor_id='agent', owner_id='owner', destination_id=city.pk, snapshot=snapshot)
        schema_editor = SimpleNamespace(connection=SimpleNamespace(alias='default'))
        migration.reduce_default_prices(apps, schema_editor)
        migration.reduce_default_prices(apps, schema_editor)
        city.refresh_from_db(); custom.refresh_from_db(); journey.refresh_from_db()
        self.assertEqual(city.price, Decimal('2175'))
        self.assertEqual(custom.price, Decimal('7777'))
        self.assertFalse(custom.enabled)
        self.assertEqual(journey.snapshot, snapshot)

    def test_current_seed_matches_frozen_price_reduction(self):
        import json
        manifest = Path(__file__).parent / 'migrations/data/0042_travel_price_reduction.json'
        expected = {key: Decimal(old) * Decimal('.25') for old, keys in json.loads(manifest.read_text()).items() for key in keys}
        seed = Path(__file__).parent.parent / 'docs/data/travel_cities_seed.csv'
        with seed.open(encoding='utf-8-sig', newline='') as stream:
            actual = {row['城市ID']: Decimal(row['价格']) for row in csv.DictReader(stream)}
        self.assertEqual(actual, expected)
