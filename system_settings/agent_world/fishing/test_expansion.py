"""扩展目录的内容约束、时段边界与成长曲线（无数据库或供应商）。"""
from datetime import datetime
from django.test import SimpleTestCase
from ..life_time import SHANGHAI
from .catalog import builtin, VERSION
from .rules import active, candidates, capture_probability, experience_for, level_for, skill_progress


def experience_at(level: int) -> int:
    return sum(100 + 25 * (n - 1) for n in range(1, level))


class FishingExpansionRulesTests(SimpleTestCase):
    def test_catalog_counts_order_and_independent_snapshots(self):
        rules = builtin()
        self.assertEqual(VERSION, 'fishing-1.2.0')
        self.assertEqual([spot['required_level'] for spot in rules['spots'].values()], [1,10,20,30,40,50,60,70,80,90])
        self.assertEqual(len(rules['fish']), 50)
        self.assertEqual(len(rules['baits']), 5)
        self.assertEqual(rules['max_level'], 99)
        self.assertEqual(list(rules['fish'])[:5], ['crucian','bitterling','carp','snakehead','golden_carp'])
        self.assertEqual(rules['fish']['moon_king']['value'], '160')
        for spot in rules['spots']:
            fish = [f for f in rules['fish'].values() if f['spot'] == spot]
            self.assertEqual(len(fish), 5)
            self.assertEqual(sum(f['king'] for f in fish), 1)
            self.assertTrue(all(f['weight'] == 1 for f in fish))
            self.assertTrue(all(0 < f['weight_range'][0] < f['weight_range'][1] for f in fish))
        rules['fish']['rainbow_trout']['hours'][0][0] = 0
        self.assertEqual(builtin()['fish']['rainbow_trout']['hours'], [[21,5]])

    def test_unlock_boundaries_and_99_cap_keep_accumulated_experience(self):
        for level in [30,40,50,60,70,80,90,99]:
            with self.subTest(level=level):
                threshold = experience_at(level)
                self.assertEqual(level_for(threshold-1)[0], level-1)
                self.assertEqual(level_for(threshold)[0], level)
                self.assertEqual(skill_progress(threshold)['experience'], threshold)
        self.assertEqual(experience_at(99), 128625)
        self.assertGreater(level_for(experience_at(75))[0], 50)
        self.assertEqual(level_for(experience_at(75), 50)[0], 50)
        capped = skill_progress(200000)
        self.assertEqual((capped['level'], capped['experience'], capped['progress'], capped['next_level_experience']), (99,200000,1,None))

    def test_all_new_spots_have_day_round_fish_and_valid_baits(self):
        rules = builtin()
        for spot in list(rules['spots'])[3:]:
            for hour in range(24):
                at = datetime(2026,10,24,hour,tzinfo=SHANGHAI)
                pool = {key for bait in rules['baits'] for key, fish in candidates(rules,spot,bait,at).items() if not fish['king']}
                self.assertGreaterEqual(len(pool), 2, (spot,hour))
        for fish in rules['fish'].values():
            self.assertTrue(set(fish['preferred'] + fish['accepted']) <= rules['baits'].keys())
            self.assertFalse(set(fish['preferred']) & set(fish['accepted']))

    def test_morning_evening_night_and_day_boundaries(self):
        rules = builtin()
        def visible(fish_id, hour, minute=0):
            return active(rules['fish'][fish_id], datetime(2026,10,24,hour,minute,tzinfo=SHANGHAI))
        for fish_id in ('red_spotted_trout','stream_king','frost_king'):
            for hour in (5,8,17,20):
                self.assertTrue(visible(fish_id,hour), (fish_id,hour))
            for hour in (4,9,16,21):
                self.assertFalse(visible(fish_id,hour), (fish_id,hour))
        for fish_id in ('rainbow_trout','wetland_king','trench_king'):
            for hour in (21,23,0,4):
                self.assertTrue(visible(fish_id,hour))
            self.assertFalse(visible(fish_id,5))
            self.assertFalse(visible(fish_id,20,59))
        self.assertTrue(visible('reef_king',9))
        self.assertFalse(visible('reef_king',17))
        self.assertTrue(visible('spring_king',17))
        self.assertFalse(visible('spring_king',21))

    def test_new_fish_keep_capture_experience_and_sale_rules(self):
        rules = builtin()
        for spot in list(rules['spots'])[3:]:
            fish = [f for f in rules['fish'].values() if f['spot'] == spot]
            normals = [f for f in fish if not f['king']]
            king = next(f for f in fish if f['king'])
            self.assertEqual(int(king['value']), int(normals[-1]['value']) * 10)
            for row in fish:
                self.assertEqual(experience_for(row), (10 + row['level'] * 2) * (5 if row['king'] else 1))
            level = rules['spots'][spot]['required_level']
            self.assertAlmostEqual(capture_probability(level,normals[0]['level']), .65)
            self.assertLess(capture_probability(level,normals[-1]['level']), .65)
