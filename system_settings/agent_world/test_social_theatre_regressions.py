"""小剧场与现有关系、删除重建及同步快照的边界回归。"""
import threading
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from system_settings.models import Agent
from .farm_gate import farm_gate
from .life_time import local_time
from .social_models import SocialEvent, SocialIntegrity, SocialRelation, SocialTheatreEvent
from .social_relations import apply_event
from .social_sync import checkpoint_all, fingerprints, reconcile_social
from .social_theatre_runner import _set_skipped, _settle_relations
from .social_theatre_views import event_list_item


class TheatreRelationshipRegressionTests(TestCase):
    def test_theatre_reuses_existing_relation_and_delete_preserves_other_interactions(self):
        owner = User.objects.create_superuser(username='admin', password='test')
        actor, peer = Agent.objects.create(name='甲'), Agent.objects.create(name='乙')
        counterpart = f'agent-id:{peer.pk}'
        apply_event(owner.username, actor.pk, counterpart, 'existing-help',
                    {'category': 'help', 'reason': '对方提供了帮助'})
        event = SocialTheatreEvent.objects.create(
            pk='theatre-review', owner_id=owner.username, business_date=local_time().date(),
            slot_index=0, scheduled_at=local_time(), status='completed',
            participants=[{'id': actor.pk, 'name': actor.name}, {'id': peer.pk, 'name': peer.name}],
            snapshot={'relation_reviews': [{'actor_id': actor.pk, 'appraisals': [
                {'target_actor_id': peer.pk, 'category': 'insult', 'reason': '对方嘲讽了我'}]}]})
        _settle_relations(event)
        _settle_relations(event)
        relation = SocialRelation.objects.get(owner_id=owner.username, actor_id=actor.pk)
        self.assertEqual((relation.counterpart_id, relation.affinity), (counterpart, 0))
        self.assertEqual(SocialEvent.objects.filter(source_key=f'theatre:{event.pk}').count(), 1)
        change = event_list_item(event, detail=True)['relation_changes'][0]
        self.assertEqual((change['counterpart_id'], change['counterpart_name']), (counterpart, peer.name))
        self.assertEqual(change['affinity_delta'], -8)

        apply_event(owner.username, actor.pk, counterpart, 'later-agreement',
                    {'category': 'agreement', 'reason': '后来对方理解了我的看法'})
        client = APIClient()
        client.force_authenticate(owner)
        url = f'/api/settings/agent-world/social/discussions/{event.pk}/'
        for _ in range(2):
            self.assertEqual(client.delete(url).status_code, 200)
            relation.refresh_from_db()
            self.assertEqual((relation.affinity, relation.familiarity), (10, 5))
        checkpoint_all()
        reconcile_social()
        relation.refresh_from_db()
        self.assertEqual(relation.affinity, 10)


class TheatreSnapshotGateRegressionTests(TransactionTestCase):
    def test_background_status_update_waits_for_snapshot_gate(self):
        event = SocialTheatreEvent.objects.create(
            pk='snapshot-gate', owner_id='theatre-review', business_date=local_time().date(),
            slot_index=0, scheduled_at=local_time())
        checkpoint_all()
        attempted, finished = threading.Event(), threading.Event()
        errors = []

        def update():
            try:
                close_old_connections()
                attempted.set()
                _set_skipped(event.pk, '活动窗口已经结束')
            except Exception as exc:
                errors.append(exc)
            finally:
                close_old_connections()
                finished.set()

        thread = threading.Thread(target=update, daemon=True)
        try:
            with farm_gate():
                thread.start()
                self.assertTrue(attempted.wait(2))
                self.assertFalse(finished.wait(0.1))
                self.assertEqual(SocialIntegrity.objects.get(pk=event.owner_id).hashes,
                                 fingerprints(event.owner_id))
        finally:
            thread.join(timeout=3)
        self.assertFalse(thread.is_alive())
        self.assertFalse(errors, errors)
        event.refresh_from_db()
        self.assertEqual(event.status, 'skipped')
        checkpoint_all()
        reconcile_social()

    def test_news_network_wait_does_not_hold_snapshot_gate(self):
        from .social_theatre_runner import _ensure_news

        event = SocialTheatreEvent.objects.create(
            pk='search-gate', owner_id='theatre-review', business_date=local_time().date(),
            slot_index=0, scheduled_at=local_time(), snapshot={'search_server_id': 'fake'})
        acquired = threading.Event()

        def search(*args, **kwargs):
            def snapshot():
                with farm_gate():
                    acquired.set()
            thread = threading.Thread(target=snapshot, daemon=True)
            thread.start()
            self.assertTrue(acquired.wait(2), '新闻请求期间阻塞了同步互斥门')
            thread.join(timeout=3)
            return []

        with patch('system_settings.agent_world.publish_search.search', side_effect=search):
            _ensure_news([event], local_time())
        self.assertTrue(acquired.is_set())

class TheatreHistoricalResumeTests(TestCase):
    def test_resume_keeps_historical_date_and_messages_outside_active_window(self):
        from datetime import timedelta
        from system_settings.models import WorldActionRuntime
        from .social_models import SocialConfig
        owner = User.objects.create_superuser(username='admin', password='test')
        WorldActionRuntime.objects.create(pk='world', enabled=True)
        SocialConfig.objects.create(pk=owner.username, settings={'enabled': True})
        day = local_time().date() - timedelta(days=5)
        event = SocialTheatreEvent.objects.create(
            pk='historical-resume', owner_id=owner.username, business_date=day,
            slot_index=0, scheduled_at=local_time(), status='failed',
            transcript=[{'id': 'saved', 'content': '已保存的发言'}])
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .social_theatre_views import SocialTheatreResumeView
        request = APIRequestFactory().post('/')
        force_authenticate(request, user=owner)
        with patch('system_settings.agent_world.social_theatre_worker.start_manual_theatre_worker'):
            response = SocialTheatreResumeView.as_view()(request, identity=event.pk)
        self.assertEqual(response.status_code, 200)
        event.refresh_from_db()
        self.assertEqual(event.status, 'scheduled')
        self.assertEqual(event.business_date, day)
        self.assertEqual(event.transcript[0]['id'], 'saved')
        self.assertTrue(event.snapshot['resume'])

    def test_resumed_turn_still_checks_world_switch(self):
        from datetime import timedelta
        from system_settings.models import WorldActionRuntime
        from .life_models import LifeConfig
        from .social_models import SocialConfig
        from .social_theatre_runner import _turn_check
        owner = 'resume-check'
        runtime = WorldActionRuntime.objects.create(pk='world', enabled=True)
        SocialConfig.objects.create(pk=owner, settings={'enabled': True})
        LifeConfig.objects.create(pk=owner, migrated=True,
                                  settings={'active_start': '09:00', 'active_end': '18:00'})
        now = local_time()
        day = now.date() - timedelta(days=5)
        with self.assertRaisesMessage(ValueError, '已离开今日活动时间'):
            _turn_check(owner, {}, day, now)
        _turn_check(owner, {}, day, now, resumed=True)
        runtime.enabled = False
        runtime.save()
        with self.assertRaisesMessage(ValueError, '世界运行已关闭'):
            _turn_check(owner, {}, day, now, resumed=True)

    def test_historical_resume_is_dispatched_before_automatic_window(self):
        from datetime import timedelta
        from types import SimpleNamespace
        from system_settings.models import WorldActionRuntime
        from .life_models import LifeConfig
        from .social_models import SocialConfig
        from .social_theatre_runner import _tick_theatres
        owner = 'resume-dispatch'
        WorldActionRuntime.objects.create(pk='world', enabled=True)
        config = SocialConfig.objects.create(pk=owner, settings={'enabled': True})
        LifeConfig.objects.create(pk=owner, migrated=True,
                                  settings={'active_start': '23:00', 'active_end': '23:59'})
        now = local_time().replace(hour=1)
        event = SocialTheatreEvent.objects.create(
            pk='old-dispatch', owner_id=owner, business_date=now.date() - timedelta(days=5),
            slot_index=0, scheduled_at=now, status='scheduled', snapshot={'resume': True},
            participants=[{'id': 'a'}, {'id': 'b'}])
        with patch('system_settings.agent_world.social_theatre_runner._available_residents',
                   return_value=([SimpleNamespace(pk='a'), SimpleNamespace(pk='b')], 2)), \
             patch('system_settings.agent_world.social_theatre_runner.run_event') as run:
            _tick_theatres(config, now)
        self.assertEqual(run.call_args.args[1].pk, event.pk)
        event.refresh_from_db()
        self.assertEqual(event.status, 'scheduled')
