"""Second-promotion thresholds, promotion gates and old catalog compatibility."""
import copy
import json
from pathlib import Path
import unittest

from . import attributes
from ._test_catalog_fixtures import restore_second_promotion_1_0_38
from .catalog import Catalog, bundled
from .catalog_validation import validate_tables


class SecondPromotionSkillTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog, _ = bundled()
        cls.jobs = [row for row in cls.catalog.tables['professions'] if row['stage'] == '2' and row['enabled'] == '1']
        ids = {job['id'] for job in cls.jobs}
        cls.skills = [skill for skill in cls.catalog.tables['skills']
                      if skill['profession_id'] in ids and skill['enabled'] == '1']

        # Reconstruct 1.0.37, which already had the new first-promotion schedule.
        old_tables = copy.deepcopy(cls.catalog.tables)
        restore_second_promotion_1_0_38(old_tables)
        old_skills = {skill['id']: skill for skill in old_tables['skills']}
        for skill in old_skills.values():
            if skill['profession_id'] in ids and skill['kind'] == 'passive' and skill['learn_level'] == '35':
                skill['learn_level'] = '45'
        for rank in old_tables['skill_levels']:
            skill = old_skills[rank['skill_id']]
            if skill['profession_id'] in ids:
                rank['required_level'] = str(int(skill['learn_level']) + 10 * (int(rank['rank']) - 1))
        cls.old = Catalog(old_tables, 'combat-1.0.37')

    def test_all_second_promotion_skills_reach_rank_three_by_level_50(self):
        self.assertEqual((len(self.jobs), len(self.skills)), (10, 28))
        groups = {(30, 'active'): [30, 40, 50], (30, 'passive'): [30, 40, 50],
                  (40, 'active'): [40, 45, 50], (35, 'passive'): [35, 40, 50]}
        for skill in self.skills:
            expected = groups[(int(skill['learn_level']), skill['kind'])]
            ranks = sorted(self.catalog.ranks[skill['id']], key=lambda row: int(row['rank']))
            with self.subTest(job=skill['profession_id'], skill=skill['name']):
                self.assertEqual([int(row['required_level']) for row in ranks], expected)
                for level in (29, 30, 34, 35, 39, 40, 44, 45, 49, 50, 51):
                    eligible = [rank + 1 for rank, threshold in enumerate(expected) if threshold <= level]
                    learned = self.catalog.learned(skill['profession_id'], level)
                    self.assertEqual(learned.get(skill['id']), max(eligible) if eligible else None)

    def test_level_50_gate_and_all_third_promotion_branches_inherit_full_skills(self):
        for job in self.jobs:
            skills = [skill for skill in self.skills if skill['profession_id'] == job['id']]
            children = [row for row in self.catalog.tables['professions']
                        if row['parent_id'] == job['id'] and row['enabled'] == '1']
            self.assertTrue(children)
            progress = attributes.initial()
            progress.update(job=job['id'], level=49, skills=self.catalog.learned(job['id'], 49))
            xp = int(self.catalog.row('level_experience', 'level.49')['experience_to_next'])
            progress, _ = attributes.award(self.catalog, progress, xp, stop_at_promotion=True)
            self.assertEqual(progress['level'], 50)
            for child in children:
                with self.subTest(job=child['id']):
                    promoted = attributes.promote(self.catalog, progress, child['id'])
                    self.assertTrue(all(promoted['skills'].get(skill['id']) == 3 for skill in skills))

    def test_old_catalog_remains_valid_and_adoption_catches_up_existing_characters(self):
        validate_tables(self.old.tables, expected_player_skills=98,
                        expected_promotion_level=50, catalog_version=self.old.version)
        job, passive, active = 'job.musician', 'skill.player.083', 'skill.player.082'
        self.assertNotIn(passive, self.old.learned(job, 40))
        self.assertEqual(self.old.learned(job, 50)[passive], 1)
        self.assertEqual(self.old.learned(job, 50)[active], 2)
        for level, expected_passive, expected_active in ((35, 1, None), (40, 2, 1), (45, 2, 2), (50, 3, 3)):
            with self.subTest(level=level):
                learned = self.catalog.learned(job, level, self.old.learned(job, level))
                self.assertEqual(learned.get(passive), expected_passive)
                self.assertEqual(learned.get(active), expected_active)
        self.assertEqual(self.old.learned(job, 50)[passive], 1)

    def test_catalog_validator_rejects_wrong_or_mismatched_schedules(self):
        validate_tables(self.catalog.tables, expected_player_skills=98,
                        expected_promotion_level=50, catalog_version=self.catalog.version)
        for identity, value in (('skill.player.014.r1', '45'), ('skill.player.014.r2', '45'),
                                ('skill.player.082.r3', '60'), ('skill.player.013.r3', '51')):
            tables = copy.deepcopy(self.catalog.tables)
            next(row for row in tables['skill_levels'] if row['id'] == identity)['required_level'] = value
            with self.subTest(identity=identity), self.assertRaisesRegex(ValueError, 'Skill growth schedule'):
                validate_tables(tables, expected_player_skills=98,
                                expected_promotion_level=50, catalog_version=self.catalog.version)
        with self.assertRaisesRegex(ValueError, 'Skill growth schedule|Profession skill exceeds'):
            validate_tables(self.old.tables, expected_player_skills=98,
                            expected_promotion_level=50, catalog_version=self.catalog.version)
        with self.assertRaisesRegex(ValueError, 'Skill growth schedule'):
            validate_tables(self.catalog.tables, expected_player_skills=98,
                            expected_promotion_level=50, catalog_version=self.old.version)

    def test_local_catalog_matches_skill_unlocks_and_rank_levels(self):
        path = Path(__file__).resolve().parents[3] / 'frontend_react/src/mocks/agentWorld/catalog.json'
        local = json.loads(path.read_text())['combat']
        self.assertEqual(local['version'], self.catalog.version)
        local_skills = {row['id']: row for row in local['tables']['skills']}
        local_ranks = {row['id']: row for row in local['tables']['skillLevels']}
        for skill in self.skills:
            with self.subTest(skill=skill['id']):
                self.assertEqual(local_skills[skill['id']]['learnLevel'], skill['learn_level'])
                for rank in self.catalog.ranks[skill['id']]:
                    self.assertEqual(local_ranks[rank['id']]['requiredLevel'], rank['required_level'])


if __name__ == '__main__':
    unittest.main()
