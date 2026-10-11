import copy
import random
import unittest
from unittest.mock import patch

from . import attributes, equipment
from .catalog import bundled
from .equipment_rolls import affix_range, quality_base


class EquipmentRollTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = bundled()[0]

    def test_ranges_increase_with_level_and_quality_for_all_affixes(self):
        for definition in self.catalog.tables['affixes']:
            previous = {quality: (0, 0) for quality in ('white', 'blue', 'gold')}
            for level in range(1, 100):
                ranges = [affix_range(definition, level, quality) for quality in previous]
                for quality, (low, high) in zip(previous, ranges):
                    with self.subTest(affix=definition['id'], level=level, quality=quality):
                        self.assertGreater(low, 0)
                        self.assertLessEqual(low, high)
                        self.assertGreaterEqual(low, previous[quality][0])
                        self.assertGreaterEqual(high, previous[quality][1])
                    previous[quality] = low, high
                self.assertTrue(all(ranges[index][0] <= ranges[index+1][0] and
                                    ranges[index][1] < ranges[index+1][1] for index in (0, 1)))

    def test_endgame_budgets_and_ratio_limits(self):
        strength = self.catalog.row('affixes', 'affix.strength')
        self.assertEqual(affix_range(strength, 99, 'white'), (30, 60))
        self.assertEqual(affix_range(strength, 99, 'blue'), (48, 96))
        self.assertEqual(affix_range(strength, 99, 'gold'), (72, 144))
        self.assertEqual(affix_range(strength, 1, 'white'), (2, 3))
        self.assertEqual(quality_base(206, 'blue'), 236)
        self.assertEqual(quality_base(206, 'gold'), 267)
        critical = self.catalog.row('affixes', 'affix.critical')
        self.assertEqual(affix_range(critical, 99, 'gold'), (.0075, .03))
        self.assertEqual(affix_range(critical, 1, 'white'), (.0025, .01))
        for stat in ('critical', 'accuracy', 'evasion'):
            self.assertLessEqual(affix_range(self.catalog.row('affixes', f'affix.{stat}'), 99, 'gold')[1], .045)
        for level in (0, 100):
            with self.assertRaises(ValueError):
                affix_range(strength, level, 'gold')

    def test_generated_values_use_actual_saved_bounds_and_quality_base(self):
        c = self.catalog
        for template in c.tables['equipment_templates']:
            for level in (int(template['level_min']), 70, 99):
                if not int(template['level_min']) <= level <= int(template['level_max']):
                    continue
                for quality, count in [('white', 1), ('blue', 2), ('gold', 3)]:
                    for seed in range(15):
                        item = equipment.generate(c, template['id'], level, quality, random.Random(seed))
                        self.assertEqual(len(item['affixes']), count)
                        self.assertEqual(item, equipment.generate(c, template['id'], level, quality, random.Random(seed)))
                        for affix in item['affixes']:
                            self.assertEqual((affix['min'], affix['max']), affix_range(c.row('affixes', affix['id']), level, quality))
                            self.assertLessEqual(affix['min'], affix['value'])
                            self.assertLessEqual(affix['value'], affix['max'])
                        self.assertGreater(float(item['value']), 0)
        items = [equipment.generate(c, 'equip.sword', 99, q, random.Random(1)) for q in ('white', 'blue', 'gold')]
        # Remove rolled attack to compare the intrinsic weapon value alone.
        bases = [item['stats']['physical_attack'] - sum(a['value'] for a in item['affixes']
                 if a['stat'] == 'physical_attack') for item in items]
        self.assertEqual(bases, [206, 236, 267])

    def test_training_equipment_and_existing_snapshots_are_not_reestimated(self):
        c = self.catalog
        for level in (1, 30, 70):
            starter = equipment.generate(c, 'equip.sword', level, 'white', random.Random(1), starter=True)
            self.assertEqual(starter['stats']['physical_attack'], 8 + 2 * level)
            self.assertEqual(starter['stats']['strength'], 1)
            self.assertEqual(starter['value'], '0')
        old = {'slot': 'weapon', 'stats': {'strength': 5, 'physical_attack': 206},
               'affixes': [{'id': 'affix.strength', 'value': 5, 'min': 5, 'max': 10}]}
        original = copy.deepcopy(old)
        self.assertEqual(attributes.attributes(c, attributes.initial(), [old])['strength'], 10)
        self.assertEqual(old, original)

    def test_roll_endpoints_are_reachable_on_integer_and_ratio_grids(self):
        c = self.catalog
        for use_high in (False, True):
            rng = random.Random(1)
            with patch.object(rng, 'randint', side_effect=lambda low, high: high if use_high else low), \
                    patch.object(rng, 'choices', side_effect=lambda pool, **_kwargs: [next(
                        (row for row in pool if row['affix_id'] == 'affix.critical'), pool[0])]):
                item = equipment.generate(c, 'equip.charm', 99, 'gold', rng)
            self.assertTrue(any(affix['id'] == 'affix.critical' for affix in item['affixes']))
            for affix in item['affixes']:
                self.assertEqual(affix['value'], affix['max' if use_high else 'min'])
