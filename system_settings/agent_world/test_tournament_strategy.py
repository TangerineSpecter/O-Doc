"""Tournament choices use real combat rules without a database."""
import random
import unittest

from .combat import engine
from .combat.catalog import bundled
from .tournament_strategy import DuelCatalog, action, candidates


class TournamentStrategyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = bundled()[0]

    def fighter(self, name, skills=None, hp=1000, mp=1000):
        stats = {'hp_max': 1000, 'mp_max': 1000, 'magic_attack': 200, 'physical_attack': 100,
                 'healing': 200, 'magic_defense': 100, 'physical_defense': 100, 'accuracy': 1,
                 'evasion': 0, 'critical': 0, 'critical_damage': 1.5, 'damage_type': 'magic'}
        return engine.fighter(stats, name, 32, hp=hp, mp=mp, skills=skills)

    def test_skill_is_preferred_and_mana_and_cooldown_are_set(self):
        skill = 'skill.player.011'
        casts = 0
        for seed in range(500):
            player, enemy = self.fighter('p', {skill: 3}), self.fighter('e')
            events = action(self.catalog, player, enemy, 1, random.Random(seed))
            if events[0]['action'] == '圣光':
                casts += 1
                self.assertLess(player['mp'], 1000)
                self.assertGreater(player['cooldowns'][skill], 1)
        self.assertGreater(casts, 450)
        self.assertLess(casts, 500)

    def test_healing_priority_and_critical_health(self):
        skills = {'skill.player.010': 3, 'skill.player.011': 3}
        enemy = self.fighter('e')
        healthy = candidates(self.catalog, self.fighter('p', skills, hp=900), enemy, 1)
        self.assertNotIn('skill.player.010', [row[0] for row in healthy])
        moderate = candidates(self.catalog, self.fighter('p', skills, hp=600), enemy, 1)
        low = candidates(self.catalog, self.fighter('p', skills, hp=300), enemy, 1)
        self.assertGreater(next(row[2] for row in low if row[3]), next(row[2] for row in moderate if row[3]))
        for seed in range(50):
            player = self.fighter('p', skills, hp=150)
            events = action(self.catalog, player, self.fighter('e'), 1, random.Random(seed))
            self.assertEqual(events[0]['action'], '治愈术')
            self.assertGreater(player['hp'], 150)

    def test_no_usable_skill_falls_back_to_attack(self):
        for mp, cooldown in [(0, 0), (1000, 5)]:
            player = self.fighter('p', {'skill.player.011': 3}, mp=mp)
            player['cooldowns']['skill.player.011'] = cooldown
            events = action(self.catalog, player, self.fighter('e'), 1, random.Random(2))
            self.assertEqual(events[0]['action'], '普通攻击')

    def test_dungeon_action_retains_balanced_weights(self):
        class CaptureRandom(random.Random):
            def choices(self, population, weights):
                if 'attack' in population:
                    self.action_weights = dict(zip(population, weights))
                    return ['attack']
                return super().choices(population, weights=weights)

        rng = CaptureRandom(7)
        player = self.fighter('p', {'skill.player.011': 3})
        engine.player_action(self.catalog, player, self.fighter('e'), {}, 1,
                             self.catalog.row('styles', 'style.balanced'), rng)
        self.assertEqual(rng.action_weights['attack'], 100)
        self.assertEqual(rng.action_weights['skill'], 60)

    def test_existing_hot_is_not_recast(self):
        skill = 'skill.player.025'
        player = self.fighter('p', {skill: 1}, hp=300)
        _, effects = self.catalog.skill(skill, 1)
        hot = next(fx for fx in effects if fx['code'] == 'hot')
        player['states'].append({'code': 'hot', 'group': hot['group']})
        self.assertFalse(candidates(self.catalog, player, self.fighter('e'), 1))

    def test_overtime_does_not_select_healing(self):
        skills = {'skill.player.010': 3, 'skill.player.011': 3}
        player = self.fighter('p', skills, hp=150)
        catalog = DuelCatalog(self.catalog, overtime=True)
        available = candidates(catalog, player, self.fighter('e'), 201)
        self.assertEqual([row[0] for row in available], ['skill.player.011'])
        self.assertFalse(available[0][3])
        events = action(catalog, player, self.fighter('e'), 201, random.Random(1))
        self.assertEqual(events[0]['action'], '圣光')
        self.assertEqual(player['hp'], 150)


if __name__ == '__main__':
    unittest.main()
