"""Owner-driven level-one profession re-selection keeps level and replays growth."""
import random
from unittest.mock import patch

from django.test import TestCase

from . import test_food
from .models import CombatFact, CombatProfile, EquipmentInstance
from ..life_time import local_time, storage_time
from . import attributes, explorations, profiles
from . import equipment, equipment_snapshot
from .queries import profile_view
from .store import current
from .sync import metadata, validate_source


class JobReselectTests(TestCase):
    # 通过模块引用，避免把 FoodExplorationTests 一并注入本模块的测试发现范围。
    setUp = test_food.FoodExplorationTests.setUp
    exported = test_food.FoodExplorationTests.exported

    def promotion_experience(self, catalog, level):
        return sum(int(catalog.row('level_experience', f'level.{row}')['experience_to_next'])
                   for row in range(1, level))

    def promote_to(self, job, level, key):
        """Grow to the first promotion gate, promote, then keep growing under the new job."""
        profile = CombatProfile.objects.get(pk=self.agent.pk)
        catalog = current(profile.catalog_id)
        profile.progression, _ = attributes.award(
            catalog, profile.progression, self.promotion_experience(catalog, 10), stop_at_promotion=True)
        profile.save()
        profiles.promote('admin', self.agent, key, job)
        profile.refresh_from_db()
        if level > 10:
            profile.progression, _ = attributes.award(
                catalog, profile.progression,
                self.promotion_experience(catalog, level) - self.promotion_experience(catalog, 10))
            profile.save()
        return profile

    def test_level_ten_reselection_keeps_growth_and_swaps_skills(self):
        profiles.ensure('admin', self.agent)
        self.promote_to('job.ranger', 10, 'promote-ranger')
        profile = profiles.reselect('admin', self.agent, 'reselect-mage', 'job.mage')
        self.assertEqual(profile.progression['level'], 10)
        self.assertEqual(profile.progression['job'], 'job.mage')
        # Level one growth is all novice; the ranger branch never applied a level.
        self.assertEqual(profile.progression['stats'], dict.fromkeys(attributes.STATS, 23))
        self.assertEqual(profile.progression['fixed_hp'], 54)
        self.assertEqual(profile.progression['fixed_mp'], 27)
        catalog = current(profile.catalog_id)
        path = set(catalog.path('job.mage'))
        for identity in profile.progression['skills']:
            self.assertIn(catalog.row('skills', identity)['profession_id'], path)
        weapon = EquipmentInstance.objects.get(pk=profile.loadout['weapon'])
        self.assertTrue(equipment_snapshot.permitted(weapon.snapshot, weapon.rules, 'job.mage', 10))

    def test_reselection_grants_a_weapon_for_the_new_job(self):
        profiles.ensure('admin', self.agent)
        self.promote_to('job.ranger', 10, 'promote-ranger')
        profiles.equip('admin', self.agent, 'unequip-sword', {'weapon': None})
        profile = profiles.reselect('admin', self.agent, 'reselect-mage', 'job.mage')
        weapon = EquipmentInstance.objects.get(pk=profile.loadout['weapon'])
        self.assertTrue(weapon.pk.startswith('reselect:'))
        self.assertEqual(weapon.template_id, 'equip.mage_staff')

    def test_reselection_replays_growth_for_levels_above_the_promotion_gate(self):
        profiles.ensure('admin', self.agent)
        self.promote_to('job.ranger', 25, 'promote-ranger')
        profile = profiles.reselect('admin', self.agent, 'reselect-mage-25', 'job.mage')
        self.assertEqual(profile.progression['level'], 25)
        # Nine novice levels plus fifteen mage levels; mage grows 1/1/4/1/4/1, hp+6, mp+14.
        self.assertEqual(profile.progression['stats'], {
            'strength': 38, 'dexterity': 38, 'intelligence': 83,
            'vitality': 38, 'spirit': 83, 'luck': 38})
        self.assertEqual(profile.progression['fixed_hp'], 144)
        self.assertEqual(profile.progression['fixed_mp'], 237)

    def test_reselection_rejects_the_current_profession(self):
        profiles.ensure('admin', self.agent)
        self.promote_to('job.ranger', 10, 'promote-ranger')
        with self.assertRaisesMessage(ValueError, '当前已是该职业'):
            profiles.reselect('admin', self.agent, 'reselect-ranger', 'job.ranger')
        self.assertFalse(CombatFact.objects.filter(pk='reselect-ranger').exists())

    def test_second_stage_or_active_exploration_blocks_reselection(self):
        profiles.ensure('admin', self.agent)
        self.promote_to('job.ranger', 30, 'promote-ranger')
        with self.assertRaises(ValueError):
            profiles.reselect('admin', self.agent, 'reselect-mage', 'job.mage')
        profiles.promote('admin', self.agent, 'promote-archer', 'job.archer')
        now = storage_time(local_time())
        explorations.request('admin', self.agent, 'reselect-run', {}, now=now)
        with self.assertRaisesMessage(ValueError, '探索进行中'):
            profiles.reselect('admin', self.agent, 'reselect-mage-late', 'job.mage')

    def test_preview_reports_the_replay_without_writing(self):
        profiles.ensure('admin', self.agent)
        self.promote_to('job.ranger', 10, 'promote-ranger')
        preview = profiles.preview_reselect(CombatProfile.objects.get(pk=self.agent.pk), 'job.mage')
        self.assertEqual(CombatProfile.objects.get(pk=self.agent.pk).progression['job'], 'job.ranger')
        self.assertEqual(preview['progression']['job'], 'job.mage')
        self.assertIn('physical_attack', preview['attributes'])
        self.assert_preview_matches_reselection(CombatProfile.objects.get(pk=self.agent.pk), unequipped=[])

    def assert_preview_matches_reselection(self, profile, *, unequipped):
        # Recovery projections contain server time; compare both reads at one instant.
        with patch('system_settings.agent_world.life_time.timezone.now', return_value=storage_time(local_time())):
            before = profile_view('admin', self.agent)
            fact_count = CombatFact.objects.count()
            gear_count = EquipmentInstance.objects.count()
            preview = profiles.preview_reselect(profile, 'job.mage')
            self.assertEqual(preview['unequipped'], unequipped)
            self.assertEqual(profile_view('admin', self.agent), before)
        self.assertEqual(CombatFact.objects.count(), fact_count)
        self.assertEqual(EquipmentInstance.objects.count(), gear_count)
        changed = profiles.reselect('admin', self.agent, 'preview-reselect-mage', 'job.mage')
        self.assertEqual(preview['attributes'], profiles.stats(changed))
        self.assertEqual(preview['progression'], changed.progression)

    def test_empty_weapon_preview_includes_granted_weapon_without_writing(self):
        profiles.ensure('admin', self.agent)
        self.promote_to('job.ranger', 10, 'promote-ranger')
        profile = profiles.equip('admin', self.agent, 'unequip', {'weapon': None})
        self.assert_preview_matches_reselection(profile, unequipped=[])

    def test_incompatible_weapon_preview_includes_replacement_without_writing(self):
        profiles.ensure('admin', self.agent)
        self.promote_to('job.ranger', 10, 'promote-ranger')
        item = equipment.generate(self.catalog, 'equip.bow', 10, 'white', random.Random(1))
        gear = EquipmentInstance.objects.create(owner_id='admin', actor_id=self.agent.pk,
            catalog_id=self.catalog.version, template_id='equip.bow', snapshot=item)
        profile = profiles.equip('admin', self.agent, 'equip-bow', {'weapon': gear.pk})
        self.assert_preview_matches_reselection(profile, unequipped=['weapon'])

    def test_profile_view_exposes_reselect_state_and_fact_exports(self):
        profiles.ensure('admin', self.agent)
        self.promote_to('job.ranger', 10, 'promote-ranger')
        view = profile_view('admin', self.agent)
        self.assertEqual(view['reselect_blocked'], '')
        self.assertEqual({row['id'] for row in view['reselect_options']},
                         {'job.warrior', 'job.mage', 'job.ranger', 'job.priest', 'job.bard'})
        profiles.reselect('admin', self.agent, 'reselect-priest', 'job.priest')
        fact = CombatFact.objects.get(pk='reselect-priest')
        self.assertEqual(fact.kind, 'reselect')
        self.assertEqual(fact.payload['from_job'], 'job.ranger')
        self.assertEqual(fact.payload['progression_after']['job'], 'job.priest')
        data = self.exported()
        validate_source(data, metadata(data))
