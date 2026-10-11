import copy
import itertools
import random
import unittest
from unittest.mock import patch

from .catalog import bundled
from .equipment import generate
from .equipment_names import equipment_name


def affixes(*stats):
    return [{'id': f'affix.{stat}', 'stat': stat, 'value': 1} for stat in stats]


class EquipmentNameTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = bundled()[0]

    def test_recognizable_combinations_and_single_affixes(self):
        staff = self.catalog.row('equipment_templates', 'equip.staff')
        body = self.catalog.row('equipment_templates', 'equip.body')
        self.assertEqual(equipment_name(staff, affixes('intelligence')), '睿智的法杖')
        self.assertEqual(equipment_name(staff, affixes('intelligence', 'magic_attack')), '辉耀的法杖')
        self.assertEqual(equipment_name(staff, affixes('intelligence', 'magic_attack', 'mp_max')), '辉耀的法杖')
        self.assertEqual(equipment_name(body, affixes('hp_max', 'physical_defense', 'magic_defense')), '不破的护甲')

    def test_every_ordinary_pool_combination_is_named_and_order_value_independent(self):
        count = 0
        for template in self.catalog.tables['equipment_templates']:
            if template['boss_only'] == '1':
                continue
            pool = [row['affix_id'] for row in self.catalog.tables['equipment_affixes']
                    if row['equipment_id'] == template['id']]
            for size in (1, 2, 3):
                for ids in itertools.combinations(pool, size):
                    rows = [{'id': identity, 'value': index + 1} for index, identity in enumerate(ids)]
                    original = copy.deepcopy(rows)
                    name = equipment_name(template, rows)
                    with self.subTest(template=template['id'], ids=ids):
                        self.assertTrue(name.endswith('的' + template['name']))
                        self.assertNotIn('奇异', name)
                        changed = [{'id': row['id'], 'value': 9999} for row in reversed(rows)]
                        self.assertEqual(name, equipment_name(template, changed))
                        self.assertEqual(rows, original)
                    count += 1
        self.assertGreater(count, 1000)

    def test_generator_preserves_rng_stats_and_special_names(self):
        c = self.catalog
        for quality, size in [('white', 1), ('blue', 2), ('gold', 3)]:
            rng = random.Random(14)
            drop = generate(c, 'equip.staff', 20, quality, rng)
            state = rng.getstate()
            original = copy.deepcopy(drop)
            self.assertEqual(len(drop['affixes']), size)
            self.assertEqual(drop['name'], equipment_name(c.row('equipment_templates', 'equip.staff'), drop['affixes']))
            equipment_name(c.row('equipment_templates', 'equip.staff'), drop['affixes'])
            self.assertEqual(rng.getstate(), state)
            self.assertEqual(drop, original)
            self.assertEqual(drop, generate(c, 'equip.staff', 20, quality, random.Random(14)))
            baseline_rng = random.Random(14)
            with patch('system_settings.agent_world.combat.equipment.equipment_name', return_value='法杖'):
                baseline = generate(c, 'equip.staff', 20, quality, baseline_rng)
            self.assertEqual({key: value for key, value in drop.items() if key != 'name'},
                             {key: value for key, value in baseline.items() if key != 'name'})
            self.assertEqual(state, baseline_rng.getstate())
        for template in c.tables['equipment_templates']:
            if template['boss_only'] == '1':
                drop = generate(c, template['id'], int(template['level_min']), 'gold', random.Random(14))
                self.assertEqual(drop['name'], template['name'])
        for level in (1, 30):
            drop = generate(c, 'equip.sword', level, 'white', random.Random(14), starter=True)
            self.assertEqual(drop['name'], '训练木剑' if level == 1 else '长剑')
            self.assertEqual(drop['value'], '0')
        self.assertEqual(equipment_name({'name': '长剑'}, []), '长剑')
        self.assertEqual(equipment_name({'name': '长剑'}, [{'id': 'custom.future'}]), '奇异的长剑')

    def test_real_reward_path_uses_named_snapshots(self):
        from .rewards import drops
        count = 0
        for seed in range(40):
            rewards = drops(self.catalog, 'monster.slime', 10, {'loot': 1, 'gear': 1}, random.Random(seed))
            for reward in rewards:
                if reward['kind'] == 'equipment':
                    count += 1
                    item = reward['item']
                    self.assertEqual(item['name'], equipment_name(
                        self.catalog.row('equipment_templates', item['template_id']), item['affixes']))
        self.assertGreater(count, 0)
