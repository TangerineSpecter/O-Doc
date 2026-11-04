"""First-promotion skill thresholds and immutable catalog compatibility."""
import copy
import json
from pathlib import Path
import unittest

from . import attributes, engine
from ._test_catalog_fixtures import restore_second_promotion_1_0_38
from .catalog import Catalog, bundled
from .catalog_validation import validate_tables


class FirstPromotionSkillTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog, _ = bundled()
        cls.jobs = [row for row in cls.catalog.tables['professions'] if row['stage'] == '1' and row['enabled'] == '1']
        ids = {row['id'] for row in cls.jobs}
        cls.skills = [row for row in cls.catalog.tables['skills'] if row['profession_id'] in ids and row['enabled'] == '1']

        # Reconstruct the 1.0.36 schedules without modifying the installed pack.
        old_tables = copy.deepcopy(cls.catalog.tables)
        restore_second_promotion_1_0_38(old_tables)
        old_skills = {row['id']: row for row in old_tables['skills']}
        second_ids = {row['id'] for row in old_tables['professions'] if row['stage'] == '2'}
        for skill in old_skills.values():
            if skill['profession_id'] in second_ids and skill['kind'] == 'passive' and skill['learn_level'] == '35':
                skill['learn_level'] = '45'
        for row in old_tables['skill_levels']:
            skill = old_skills[row['skill_id']]
            if skill['profession_id'] in ids | second_ids:
                row['required_level'] = str(min(99, int(skill['learn_level']) + 10 * (int(row['rank']) - 1)))
        cls.old = Catalog(old_tables, 'combat-1.0.36')

    def test_all_first_promotion_skills_have_the_requested_thresholds(self):
        self.assertEqual(len(self.jobs), 5)
        self.assertEqual(len(self.skills), 23)
        groups = {(10, 'active'): [10, 20, 30], (10, 'passive'): [10, 20, 30],
                  (15, 'active'): [15, 25, 30], (20, 'passive'): [20, 25, 30]}
        for skill in self.skills:
            with self.subTest(job=skill['profession_id'], skill=skill['name']):
                expected = groups[(int(skill['learn_level']), skill['kind'])]
                ranks = sorted(self.catalog.ranks[skill['id']], key=lambda row: int(row['rank']))
                self.assertEqual([int(row['required_level']) for row in ranks], expected)
                for level in (9, 10, 14, 15, 19, 20, 24, 25, 29, 30, 31):
                    eligible = [rank + 1 for rank, threshold in enumerate(expected) if threshold <= level]
                    learned = self.catalog.learned(skill['profession_id'], level)
                    self.assertEqual(learned.get(skill['id']), max(eligible) if eligible else None)

    def test_30_level_gate_and_every_second_promotion_keep_all_first_skills_at_rank_three(self):
        for job in self.jobs:
            skills = [row for row in self.skills if row['profession_id'] == job['id']]
            children = [row for row in self.catalog.tables['professions']
                        if row['parent_id'] == job['id'] and row['enabled'] == '1']
            self.assertTrue(children)
            progress = attributes.initial()
            progress.update(job=job['id'], level=29, skills=self.catalog.learned(job['id'], 29))
            xp = int(self.catalog.row('level_experience', 'level.29')['experience_to_next'])
            progress, _ = attributes.award(self.catalog, progress, xp, stop_at_promotion=True)
            self.assertEqual(progress['level'], 30)
            for child in children:
                promoted = attributes.promote(self.catalog, progress, child['id'])
                with self.subTest(job=child['id']):
                    self.assertTrue(all(promoted['skills'].get(skill['id']) == 3 for skill in skills))

    def test_old_catalog_is_unchanged_and_switching_catalog_catches_up(self):
        validate_tables(self.old.tables, expected_player_skills=98,
                        expected_promotion_level=50, catalog_version=self.old.version)
        priest = 'job.priest'
        self.assertEqual(self.old.learned(priest, 25)['skill.player.012'], 1)
        self.assertEqual(self.old.learned(priest, 30)['skill.player.011'], 2)
        self.assertEqual(self.old.learned(priest, 30)['skill.player.012'], 2)
        self.assertEqual(self.catalog.learned(priest, 25, self.old.learned(priest, 25))['skill.player.012'], 2)
        adopted = self.catalog.learned('job.cleric', 30, self.old.learned('job.cleric', 30))
        self.assertEqual([adopted[sid] for sid in ('skill.player.011', 'skill.player.012', 'skill.player.074')], [3, 3, 3])
        self.assertEqual(self.old.learned(priest, 30)['skill.player.012'], 2)

    def test_validator_rejects_wrong_schedule_for_each_catalog_version(self):
        validate_tables(self.catalog.tables, expected_player_skills=98,
                        expected_promotion_level=50, catalog_version=self.catalog.version)
        for identity, value in (('skill.player.011.r3', '35'), ('skill.player.012.r2', '30'),
                                ('skill.player.001.r3', '31')):
            tables = copy.deepcopy(self.catalog.tables)
            next(row for row in tables['skill_levels'] if row['id'] == identity)['required_level'] = value
            with self.subTest(identity=identity), self.assertRaisesRegex(ValueError, 'Skill growth schedule'):
                validate_tables(tables, expected_player_skills=98,
                                expected_promotion_level=50, catalog_version=self.catalog.version)
        with self.assertRaisesRegex(ValueError, 'Skill growth schedule'):
            validate_tables(self.old.tables, expected_player_skills=98,
                            expected_promotion_level=50, catalog_version=self.catalog.version)
        with self.assertRaisesRegex(ValueError, 'Skill growth schedule'):
            validate_tables(self.catalog.tables, expected_player_skills=98,
                            expected_promotion_level=50, catalog_version=self.old.version)

    def test_earlier_active_rank_increases_actual_cost_without_changing_effects(self):
        identity = 'skill.player.011'
        old_rank = self.old.learned('job.priest', 30)[identity]
        new_rank = self.catalog.learned('job.priest', 30)[identity]
        entity = {'level': 30, 'passives': []}
        self.assertEqual((old_rank, new_rank), (2, 3))
        self.assertEqual((engine.cost(self.old, entity, identity, old_rank),
                          engine.cost(self.catalog, entity, identity, new_rank)), (23, 26))
        for rank in (1, 2, 3):
            self.assertEqual(self.old.skill(identity, rank)[1], self.catalog.skill(identity, rank)[1])

    def test_local_catalog_contains_the_same_skill_rows(self):
        path = Path(__file__).resolve().parents[3] / 'frontend_react/src/mocks/agentWorld/catalog.json'
        local = json.loads(path.read_text())['combat']
        self.assertEqual(local['version'], self.catalog.version)
        local_rows = {row['id']: row for row in local['tables']['skillLevels']}
        for skill in self.skills:
            for row in self.catalog.ranks[skill['id']]:
                with self.subTest(rank=row['id']):
                    self.assertEqual(local_rows[row['id']]['requiredLevel'], row['required_level'])


if __name__ == '__main__':
    unittest.main()
