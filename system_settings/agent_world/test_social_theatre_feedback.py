"""无发言终态仍隐藏，手动失败通过通知解释；引用不能拼接。"""
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from .life_time import local_time
from .social_models import SocialTheatreEvent
from .social_theatre_decision import prepare_topic, validate_topic
from .social_theatre_feedback import pending_manual_ids, notify_manual_results
from .social_theatre_views import SocialTheatreListView


class TheatreFeedbackTests(TestCase):
    def row(self, identity, *, manual=None, status='failed'):
        now = local_time()
        return SocialTheatreEvent.objects.create(
            pk=identity, owner_id='theatre-feedback-test', business_date=now.date(),
            scheduled_at=now, slot_index=SocialTheatreEvent.objects.filter(
                owner_id='theatre-feedback-test').count(), status=status,
            snapshot={} if manual is None else {'manual': manual},
            error='模型输出未通过场景校验：议题依据必须逐字引用新闻片段',
        )

    def test_empty_terminal_attempts_remain_hidden(self):
        user = User.objects.create_user(username='theatre-feedback-test')
        from user.models import UserProfile
        UserProfile.objects.update_or_create(user=user, defaults={'userid': 'theatre-feedback-test'})
        self.row('manual-failure', manual=True)
        self.row('automatic-failure')
        self.row('explicit-automatic', manual=False)
        self.row('manual-deleted', manual=True, status='deleted')
        request = APIRequestFactory().get('/')
        force_authenticate(request, user)
        result = SocialTheatreListView.as_view()(request).data['data']['items']
        self.assertEqual(result, [])

    def test_failure_notification_stores_topic_result_and_reason(self):
        from message.models import Notification
        from user.models import UserProfile
        user = User.objects.create_user(username='theatre-feedback-test')
        UserProfile.objects.update_or_create(user=user, defaults={'userid': 'theatre-feedback-test'})
        row = self.row('manual-search', manual=True, status='searching')
        pending = pending_manual_ids(row.owner_id)
        row.status = 'skipped'
        row.snapshot['manual_topic'] = '测试议题'
        row.error = '新闻搜索失败：搜索服务连接或读取超时'
        row.save(update_fields=['status', 'snapshot', 'error'])
        notify_manual_results(row.owner_id, pending)
        notice = Notification.objects.get(user=user)
        self.assertIn('议题：测试议题', notice.content)
        self.assertIn('结果：未能发起讨论', notice.content)
        self.assertIn(row.error, notice.content)
        self.assertEqual(notice.type, 'warning')

    def test_only_new_terminal_manual_result_notifies(self):
        row = self.row('manual-queued', manual=True, status='scheduled')
        self.row('old-manual-failure', manual=True)
        pending = pending_manual_ids(row.owner_id)
        with patch('utils.notification_service.NotificationService.send') as send:
            notify_manual_results(row.owner_id, pending)
            send.assert_not_called()
            row.status = 'failed'
            row.save(update_fields=['status'])
            notify_manual_results(row.owner_id, pending)
            send.assert_called_once()
            self.assertIn(row.error, send.call_args.args[2])
            notify_manual_results(row.owner_id, pending_manual_ids(row.owner_id))
            send.assert_called_once()

    def test_ended_without_speech_notifies_but_successful_discussion_does_not(self):
        empty = self.row('manual-stop', manual=True, status='running')
        successful = self.row('manual-success', manual=True, status='running')
        pending = pending_manual_ids(empty.owner_id)
        empty.status, empty.error = 'completed', ''
        empty.save(update_fields=['status', 'error'])
        successful.status = 'completed'
        successful.transcript = [{'content': '实际发言'}]
        successful.save(update_fields=['status', 'transcript'])
        with patch('utils.notification_service.NotificationService.send') as send:
            notify_manual_results(empty.owner_id, pending)
            send.assert_called_once()
            self.assertIn('参与居民本次均未继续发言', send.call_args.args[2])
            self.assertEqual(send.call_args.kwargs['level'], 'info')

    def test_prompt_requires_one_contiguous_quote_and_validator_stays_strict(self):
        source = {'title': '资料', 'summary': '第一段真实资料。 第二段真实资料。'}
        value = {'is_event': True, 'event': '事件', 'question': '问题', 'tradeoff': '取舍',
                 'evidence': '“第一段真实资料。”；“第二段真实资料。”'}
        with self.assertRaisesRegex(ValueError, '逐字引用'):
            validate_topic(value, source)
        value['evidence'] = '第一段真实资料。'
        self.assertTrue(validate_topic(value, source)['is_event'])
        for topic in ('', '指定议题'):
            with patch('system_settings.agent_world.social_theatre_decision.complete_json') as complete:
                prepare_topic(None, source, owner='owner', check=lambda: None, manual_topic=topic)
                self.assertIn('不得拼接多处引文', complete.call_args.args[1])
