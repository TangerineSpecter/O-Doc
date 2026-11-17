from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from memos.models import Memo
from system_settings.models import SyncEntityState
from system_settings.sync_state import record_bulk_change
from user.models import UserProfile
from utils.notification_service import NotificationService
from .models import Notification
from .views import update_notifications


class NotificationTests(TestCase):
    url = '/api/message/notifications/'

    def setUp(self):
        self.user = User.objects.create_superuser('admin')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_notification_pages_bound_content_and_preserve_legacy_responses(self):
        Notification.objects.bulk_create([Notification(user=self.user, title=str(i)) for i in range(65)])
        Notification.objects.create(user=self.user, title='回收站', is_deleted=True)
        Notification.objects.create(user=User.objects.create_user('other'), title='其他用户')
        with CaptureQueriesContext(connection) as queries:
            first = self.client.get(self.url, {'page': 1}).json()['data']
        self.assertEqual((len(first['items']), first['total'], first['pages'], first['page']), (30, 65, 3, 1))
        self.assertIn('isRead', first['items'][0])
        self.assertTrue(any('LIMIT 30' in q['sql'] for q in queries))
        second = self.client.get(self.url, {'page': 2}).json()['data']
        last = self.client.get(self.url, {'page': 4}).json()['data']
        self.assertEqual((last['page'], len(last['items'])), (3, 5))
        ids = [r['id'] for p in (first, second, last) for r in p['items']]
        self.assertEqual(len(set(ids)), 65)
        self.assertEqual(self.client.get(self.url, {'page': 'invalid'}).json()['data'], first)
        self.assertEqual(self.client.get(self.url, {'page': 1, 'status': 'read'}).json()['data']['total'], 0)
        self.assertEqual(self.client.get(self.url, {'count_only': '1', 'page': 1}).json()['data'], {'count': 65})
        self.assertEqual(len(self.client.get(self.url).json()['data']), 65)
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(self.url, {'page': 1}).status_code, (401, 403))

    def test_full_length_memo_tag_keeps_content_and_valid_title(self):
        tag = '🍊' * 120
        Memo.objects.create(tag=tag, user_id='admin', content='完整正文')
        result = self.client.post(self.url + 'push_memo/').data['data']
        self.assertEqual(result['title'], ('Memos · ' + tag)[:100])
        self.assertEqual(result['content'], '完整正文')
        NotificationService.send(self.user, tag, '另一条正文')
        self.assertTrue(Notification.objects.filter(title=tag[:100], content='另一条正文').exists())

    def test_scheduled_retry_is_per_account_and_manual_push_stays_repeatable(self):
        url = self.url + 'push_memo/'
        schedule = {'HTTP_IDEMPOTENCY_KEY': '2026-11-17:daily:10:00'}
        Memo.objects.create(user_id='admin', content='一')
        scheduled = self.client.post(url, **schedule).data['data']['id']
        self.assertEqual(self.client.post(url, **schedule).data['data']['id'], scheduled)
        self.assertNotEqual(self.client.post(url).data['data']['id'], self.client.post(url).data['data']['id'])
        second = User.objects.create_user('second')
        Memo.objects.create(user_id=f'user_{second.pk}', content='二')
        self.client.force_authenticate(second)
        self.assertNotEqual(self.client.post(url, **schedule).data['data']['id'], scheduled)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 3)
        self.assertEqual(Notification.objects.filter(user=second).count(), 1)

    def test_mark_all_is_batched_and_repeated_calls_leave_revisions_alone(self):
        rows = [Notification(user=self.user, title='未读') for _ in range(45)]
        Notification.objects.bulk_create(rows)
        read = Notification.objects.create(user=self.user, title='已读', is_read=True)
        deleted = Notification.objects.create(user=self.user, title='回收站', is_deleted=True)
        other = Notification.objects.create(user=User.objects.create_user('other'), title='其他账号')
        states = SyncEntityState.objects.filter(model_label='message.notification')
        states.filter(object_pk=read.pk).update(content_hash='previous')
        states.create(object_pk=rows[0].pk, model_label='message.notification', content_hash='old-hash', is_deleted=True)
        previous = list(states.filter(object_pk__in=[read.pk, deleted.pk, other.pk]).order_by('pk').values())
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(self.client.post(self.url).status_code, 200)
        self.assertEqual(sum('INSERT INTO "sys_sync_entity_state"' in q['sql'] for q in queries), 1)
        self.assertEqual(Notification.objects.filter(is_read=True).count(), 46)
        self.assertEqual(list(states.filter(object_pk__in=[read.pk, deleted.pk, other.pk]).order_by('pk').values()), previous)
        revised = states.get(object_pk=rows[0].pk)
        self.assertFalse(revised.is_deleted)
        self.assertEqual(revised.content_hash, 'old-hash')
        self.assertEqual(states.filter(object_pk__in=[row.pk for row in rows]).count(), 45)
        with CaptureQueriesContext(connection) as repeated:
            self.client.post(self.url)
            self.client.patch(self.url + read.pk + '/')
        self.assertFalse(any('UPDATE "message_notification"' in q['sql'] or
                             'INSERT INTO "sys_sync_entity_state"' in q['sql'] for q in repeated))

    def test_notification_arriving_during_mark_all_remains_unread(self):
        Notification.objects.create(user=self.user, title='原通知')

        def receive_after_selection(selected):
            record_bulk_change(selected)
            Notification.objects.create(user=self.user, title='新通知')

        with patch('message.views.record_bulk_change', side_effect=receive_after_selection):
            self.client.post(self.url)
        self.assertEqual(list(Notification.objects.filter(is_read=False).values_list('title', flat=True)), ['新通知'])

    def test_revision_failure_rolls_back_and_trash_restore_keep_read_state(self):
        row = Notification.objects.create(user=self.user, title='通知')
        state = SyncEntityState.objects.get(model_label='message.notification', object_pk=row.pk)

        def fail_after_revision(selected):
            record_bulk_change(selected)
            raise RuntimeError('rollback')

        with self.assertRaises(RuntimeError), patch('message.views.record_bulk_change', side_effect=fail_after_revision):
            update_notifications(Notification.objects.filter(pk=row.pk), is_read=True)
        self.assertEqual(SyncEntityState.objects.get(pk=state.pk).revision_at, state.revision_at)
        self.client.delete(self.url + row.pk + '/')
        self.client.patch(self.url + row.pk + '/')
        self.client.patch(self.url + row.pk + '/restore/')
        row.refresh_from_db()
        self.assertFalse(row.is_read)
        self.assertFalse(row.is_deleted)
        self.assertIsNone(row.deleted_at)


class ScheduledConcurrencyTests(TransactionTestCase):
    def test_concurrent_scheduled_requests_return_the_same_notification(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import close_old_connections, connections

        user = User.objects.create_superuser('admin')
        UserProfile.objects.update_or_create(user=user, defaults={'userid': 'admin'})
        Memo.objects.create(user_id='admin', content='内容')
        start = Barrier(2)

        def push():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(User.objects.get(pk=user.pk))
                start.wait(timeout=10)
                result = client.post('/api/message/notifications/push_memo/', HTTP_IDEMPOTENCY_KEY='2026-11-17:daily:10:00')
                return result.data['data']['id']
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            first, second = (task.result() for task in [pool.submit(push), pool.submit(push)])
        self.assertEqual(first, second)
        self.assertEqual(Notification.objects.filter(user=user).count(), 1)
