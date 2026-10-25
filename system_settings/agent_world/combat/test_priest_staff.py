"""Basic staff permissions cover the entire priest profession tree."""
import json
import random
from pathlib import Path

from django.test import SimpleTestCase

from .catalog import bundled
from .equipment import allowed, generate
from .equipment_snapshot import permitted, rules_for


class PriestStaffTests(SimpleTestCase):
    def test_basic_staff_permissions_and_frozen_rules_cover_all_priest_jobs(self):
        catalog = bundled()[0]
        jobs = [row for row in catalog.tables['professions']
                if 'job.priest' in catalog.path(row['id'])]
        self.assertEqual(len(jobs), 7)
        snapshot = generate(catalog, 'equip.mage_staff', 11, 'white', random.Random(1))
        rules = rules_for(catalog, 'equip.mage_staff', snapshot)
        for job in jobs:
            level = max(11, int(job['required_level']))
            with self.subTest(job=job['id']):
                self.assertTrue(allowed(catalog, 'equip.mage_staff', job['id'], level, 11))
                self.assertTrue(permitted(snapshot, rules, job['id'], level))
                self.assertFalse(permitted(snapshot, rules, job['id'], 10))
        self.assertTrue(allowed(catalog, 'equip.mage_staff', 'job.mage', 16, 11))
        for job in ('job.novice', 'job.warrior', 'job.ranger', 'job.bard'):
            self.assertFalse(allowed(catalog, 'equip.mage_staff', job, 16, 11))

    def test_advanced_staff_mastery_requirements_are_preserved(self):
        catalog = bundled()[0]
        self.assertFalse(allowed(catalog, 'equip.holy_staff', 'job.priest', 30, 30))
        self.assertFalse(allowed(catalog, 'equip.holy_staff', 'job.cleric', 29, 29))
        self.assertTrue(allowed(catalog, 'equip.holy_staff', 'job.cleric', 30, 30))
        self.assertFalse(allowed(catalog, 'equip.holy_staff', 'job.naturalist', 30, 30))
        self.assertFalse(allowed(catalog, 'equip.staff', 'job.priest', 30, 30))

    def test_local_catalog_matches_runtime_staff_permissions(self):
        catalog = bundled()[0]
        root = Path(__file__).resolve().parents[3]
        local = json.loads((root / 'frontend_react/src/mocks/agentWorld/catalog.json').read_text())['combat']
        self.assertEqual(local['version'], catalog.version)
        expected = {row['profession_id'] for row in catalog.tables['equipment_professions']
                    if row['equipment_id'] == 'equip.mage_staff'}
        actual = {row['professionId'] for row in local['tables']['equipmentProfessions']
                  if row['equipmentId'] == 'equip.mage_staff'}
        self.assertEqual(actual, expected)
