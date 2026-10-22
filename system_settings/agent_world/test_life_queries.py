from datetime import timedelta
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from .life_models import LifeConfig, LifeItem
from .life_queries import next_activity_times
from .life_time import local_time


class NextActivityTimesTests(TestCase):
    def setUp(self):
        self.now = timezone.now()

    def item(self, *, actor='actor', owner='owner', status='pending', activity='unplanned', minutes=30):
        at = self.now + timedelta(minutes=minutes)
        return LifeItem.objects.create(id=uuid4().hex, owner_id=owner, actor_id=actor, original_at=at,
                                       scheduled_at=at, status=status, activity=activity)

    def test_earliest_waiting_item_uses_current_time_and_owner(self):
        self.item(minutes=60)
        expected = self.item(status='deferred', minutes=20)
        for status in ('running', 'completed', 'cancelled', 'failed', 'rest', 'paused'):
            self.item(status=status, minutes=5)
        self.item(activity='rest', minutes=2)
        self.item(owner='other', minutes=1)
        self.item(actor='unrequested', minutes=1)
        self.assertEqual(next_activity_times('owner', ['actor']),
                         {'actor': local_time(expected.scheduled_at).isoformat()})
        self.assertEqual(next_activity_times(None, ['actor']), {})

    def test_paused_and_missing_actors_have_no_time(self):
        LifeConfig.objects.create(id='owner', paused_agents=['actor'])
        self.item()
        self.assertEqual(next_activity_times('owner', ['actor', 'missing']), {})

    def test_overdue_item_is_kept_so_ui_can_show_waiting(self):
        expected = self.item(minutes=-10)
        self.item(minutes=10)
        self.assertEqual(next_activity_times('owner', ['actor'])['actor'],
                         local_time(expected.scheduled_at).isoformat())

    def test_relation_graph_exposes_time_but_hides_archived_residents_time(self):
        from system_settings.agent_relation import relation_graph
        from system_settings.models import Agent

        agent = Agent.objects.create(name='日程居民')
        archived = Agent.objects.create(name='已归档居民', archived_at=self.now)
        expected = self.item(actor=agent.pk)
        self.item(actor=archived.pk)
        nodes = {node['id']: node for node in relation_graph('owner', include_departed=True)['nodes']}
        self.assertEqual(nodes[agent.pk]['next_activity_at'], local_time(expected.scheduled_at).isoformat())
        self.assertIsNone(nodes[archived.pk]['next_activity_at'])
