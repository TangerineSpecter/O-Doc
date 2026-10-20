"""Task attribution follows the same resident authorization as life execution."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from system_settings.models import Agent, AgentTask
from .life_config import DEFAULTS, task_for
from .life_models import LifeConfig, LifeCycle, LifeItem, LifeProfile
from .life_scope import life_scope


class LifeTaskAttributionTests(TestCase):
    def setUp(self):
        self.original = Agent.objects.create(name='原绑定居民')
        self.resident = Agent.objects.create(name='世界参与居民')
        self.config = LifeConfig.objects.create(
            pk='owner', migrated=True,
            settings={**DEFAULTS, 'agent_ids': [self.original.pk, self.resident.pk]})
        LifeProfile.objects.create(pk=self.resident.pk, owner_id='owner')

    def task(self, kind='farm', **values):
        return AgentTask.objects.create(
            name=kind, agent=self.original, agent_ids=[self.original.pk],
            task_kind=kind, **{kind + '_config': {'owner_id': 'owner'}}, **values)

    def test_world_participant_gets_task_despite_legacy_binding(self):
        for kind in ('farm', 'cooking', 'alchemy'):
            with self.subTest(kind=kind):
                task = self.task(kind)
                self.assertEqual(task_for('owner', self.resident, kind), task)
                self.assertEqual(task_for('owner', self.resident, kind, tasks=[task]), task)

    def test_multiple_authorized_tasks_remain_unassigned(self):
        self.task()
        self.task()
        self.assertIsNone(task_for('owner', self.resident, 'farm'))

    def test_disabled_task_does_not_make_attribution_ambiguous(self):
        task = self.task()
        self.task(enabled=False)
        self.assertEqual(task_for('owner', self.resident, 'farm'), task)

    def test_paused_and_nonparticipating_residents_are_unassigned(self):
        self.task()
        self.config.paused_agents = [self.resident.pk]
        self.config.save()
        self.assertIsNone(task_for('owner', self.resident, 'farm'))
        self.config.paused_agents = []
        self.config.settings['agent_ids'] = [self.original.pk]
        self.config.save()
        self.assertIsNone(task_for('owner', self.resident, 'farm'))

    def test_archived_resident_is_unassigned(self):
        self.task()
        self.resident.archived_at = timezone.now()
        self.resident.save()
        self.assertIsNone(task_for('owner', self.resident, 'farm'))

    def test_supplied_tasks_cannot_cross_owner_boundary(self):
        task = self.task()
        task.farm_config = {'owner_id': 'another-owner'}
        self.assertIsNone(task_for('owner', self.resident, 'farm', tasks=[task]))

    def test_existing_cycle_keeps_participant_after_future_config_change(self):
        task = self.task()
        start = timezone.now() - timedelta(days=2)
        cycle = LifeCycle.objects.create(
            id='attribution-cycle', owner_id='owner', starts_at=start,
            ends_at=start + timedelta(days=1),
            snapshot={'participants': [self.resident.pk]})
        item = LifeItem.objects.create(
            id='attribution-item', owner_id='owner', actor_id=self.resident.pk,
            cycle=cycle, original_at=start, scheduled_at=start)
        self.config.settings['agent_ids'] = [self.original.pk]
        self.config.save()
        self.assertIsNone(task_for('owner', self.resident, 'farm'))
        with life_scope(item, {}):
            self.assertEqual(task_for('owner', self.resident, 'farm'), task)
