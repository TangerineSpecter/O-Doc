"""Pure price checks; no database, scheduler or remote services."""
import copy
from decimal import Decimal
import random
import unittest

from .catalog import Catalog, bundled, cash
from .equipment import generate


class EndpointRandom(random.Random):
    def __init__(self, high):
        super().__init__(17)
        self.high = high

    def randint(self, a, b):
        return b if self.high else a


class EquipmentPriceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = bundled()[0]

    def template(self, level):
        return next(row['id'] for row in self.catalog.tables['equipment_templates']
                    if row['enabled'] == '1'
                    and int(row['level_min']) <= level <= int(row['level_max']))

    def test_all_levels_qualities_and_roll_endpoints(self):
        for level in range(1, 100):
            for quality, multiplier in [('white', '1'), ('blue', '1.6'), ('gold', '2.4')]:
                for high in (False, True):
                    with self.subTest(level=level, quality=quality, high=high):
                        item = generate(self.catalog, self.template(level), level,
                                        quality, EndpointRandom(high))
                        positions = [(a['value'] - a['min']) / (a['max'] - a['min'])
                                     if a['max'] > a['min'] else 0 for a in item['affixes']]
                        expected = cash(Decimal(20 + 2 * level) * Decimal(multiplier)
                                        * (1 + Decimal('.1') * Decimal(str(sum(positions) / len(positions)))))
                        self.assertEqual(Decimal(item['value']), expected)
                        if quality == 'white' and not high:
                            self.assertEqual(expected, Decimal(20 + 2 * level))

    def test_frozen_old_catalog_preserves_original_prices_and_rolls(self):
        tables = copy.deepcopy(self.catalog.tables)
        for row in tables['rules']:
            if row['id'] == 'weapon_sale_base':
                row['value'] = '10'
            elif row['id'] == 'weapon_sale_per_level':
                row['value'] = '0.5'
        legacy = Catalog(tables, 'combat-1.0.28')
        for level in (10, 30, 70, 90):
            old = generate(legacy, self.template(level), level, 'white', EndpointRandom(False))
            original = copy.deepcopy(old)
            new = generate(self.catalog, self.template(level), level, 'white', EndpointRandom(False))
            self.assertEqual(Decimal(old['value']), Decimal(10) + Decimal('.5') * level)
            self.assertEqual(old['affixes'], new['affixes'])
            self.assertEqual(old['stats'], new['stats'])
            self.assertEqual(old, original)

    def test_training_equipment_remains_free(self):
        item = generate(self.catalog, self.template(1), 1, 'white', random.Random(17), starter=True)
        self.assertEqual(Decimal(item['value']), 0)
