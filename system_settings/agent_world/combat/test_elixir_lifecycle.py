"""Original elixir prices survive departure, partial use, failure and settlement retries."""
import json
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core import serializers
from django.test import TestCase

from system_settings.models import Agent, AIModel, AIProvider
from ..inventory_stock import add_stock, stock_rows
from ..life_time import local_time, storage_time
from . import elixir_sync, explorations
from .models import CombatFact
from .store import install


class ElixirLifecycleTests(TestCase):
    def setUp(self):
        temp = TemporaryDirectory(prefix='odoc-elixir-tests-')
        self.addCleanup(temp.cleanup)
        isolation = self.settings(MEDIA_ROOT=temp.name, ODOC_WORLD_LOCK_PATH=str(Path(temp.name) / 'world.lock'))
        isolation.enable()
        self.addCleanup(isolation.disable)
        self.catalog = install()
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='A', model=model)
        self.now = storage_time(local_time())

    def stock(self, price, *, stars=1):
        return add_stock(self.agent.pk, 'admin', self.agent.name, 'elixir.healing', 1,
                         '愈合药剂', 'elixir', price, 'fixture', stars=stars)

    def depart(self, count=2):
        dungeon = min(self.catalog.tables['dungeons'], key=lambda row: int(row['recommended_level_min']))
        run = explorations.request('admin', self.agent, 'trip', {}, now=self.now)
        run = explorations.depart(run.pk, {
            'dungeon_id': dungeon['id'], 'duration_seconds': 1800, 'style_id': 'style.balanced',
            'potions': {}, 'food': None, 'elixirs': [{'recipe_id': 'healing', 'stars': 1, 'count': count}],
        }, now=self.now)
        run.refresh_from_db()
        return run

    def lots(self):
        return [lot for row in stock_rows(self.agent.pk, 'admin', 'elixir.healing')
                if row.source.get('stars', 1) == 1 for lot in row.source['lots']]

    def assert_sync_valid(self):
        data = json.loads(serializers.serialize('json', [
            *explorations.Exploration.objects.all(), *CombatFact.objects.all(),
        ]))
        elixir_sync.validate_source(data, elixir_sync.metadata(data), require_manifest=True)

    def test_recall_returns_original_lots_and_stars_only_once(self):
        self.stock('20')
        self.stock('40')
        other = self.stock('100', stars=3)
        run = self.depart()
        # A post-departure rule edit must not reprice returned stock either.
        from ..alchemy_catalog import catalog_for
        catalog = catalog_for('admin')
        catalog.rules['healing']['sale_price'] = '99.00'
        catalog.save()
        explorations.finish(run.pk, now=self.now)
        expected = [{'quantity': 1, 'price': '20'}, {'quantity': 1, 'price': '40'}]
        self.assertEqual(self.lots(), expected)
        explorations.finish(run.pk, now=self.now)
        self.assertEqual(self.lots(), expected)
        other.refresh_from_db()
        self.assertEqual((other.quantity, other.source['stars']), (1, 3))
        self.assert_sync_valid()

    def test_partial_use_returns_fifo_tail_across_inventory_rows(self):
        self.stock('10')
        self.stock('20')
        later = stock_rows(self.agent.pk, 'admin', 'elixir.healing').get()
        later.pk, later.quantity, later.value = 'later-stock', 1, Decimal('30')
        later.source = {**later.source, 'lots': [{'quantity': 1, 'price': '30'}]}
        later.save(force_insert=True)
        run = self.depart(count=3)
        self.assertEqual(len(run.snapshot['elixirs'][0]['consumed']), 2)
        run.state['elixirs'][0]['remaining'] = 2
        run.result['elixirs_used'] = {'healing:1': 1}
        run.save()
        explorations.finish(run.pk, now=self.now)
        self.assertEqual(self.lots(), [{'quantity': 1, 'price': '20'}, {'quantity': 1, 'price': '30'}])
        self.assert_sync_valid()

    def test_return_failure_rolls_back_all_lots_and_can_retry(self):
        self.stock('20')
        self.stock('40')
        run = self.depart()
        original = explorations.add_stock
        calls = []

        def fail_second(*args, **kwargs):
            calls.append(args)
            if len(calls) == 2:
                raise ValueError('fixture failure')
            return original(*args, **kwargs)

        with patch.object(explorations, 'add_stock', side_effect=fail_second):
            with self.assertRaisesRegex(ValueError, 'fixture failure'):
                explorations.finish(run.pk, now=self.now)
        self.assertEqual(self.lots(), [])
        run.refresh_from_db()
        self.assertEqual(run.status, 'active')
        explorations.finish(run.pk, now=self.now)
        self.assertEqual(self.lots(), [{'quantity': 1, 'price': '20'}, {'quantity': 1, 'price': '40'}])

    def test_fully_used_elixirs_are_not_returned(self):
        self.stock('20')
        self.stock('40')
        run = self.depart()
        run.state['elixirs'][0]['remaining'] = 0
        run.result['elixirs_used'] = {'healing:1': 2}
        run.save()
        explorations.finish(run.pk, now=self.now)
        self.assertEqual(self.lots(), [])
        self.assert_sync_valid()
