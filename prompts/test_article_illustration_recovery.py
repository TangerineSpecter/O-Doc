import json
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from system_settings.grsai_images import GrsaiImageError, GrsaiImageResult
from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS
from utils.web_parser import WebParserError

from .article_illustration import sign_article_illustration_task
from .models import PendingArticleIllustration


class ArticleIllustrationRecoveryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('illustration-recovery-user', password='secret')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_failed_download_keeps_generated_url_and_retry_never_generates_again(self):
        model = SimpleNamespace(id='model-1', provider=SimpleNamespace(type='Grsai'))
        result = GrsaiImageResult(
            task_id='generated-task-1', status='succeeded',
            image_urls=('https://images.example.com/generated.png',),
        )
        download_error = GrsaiImageError('生成成功，但图片下载失败，请稍后重试获取结果', retryable=True)
        download_error.__cause__ = WebParserError('网页访问失败，请确认链接可访问。')

        with patch('prompts.article_illustration_views.get_default_image_generation_model', return_value=model), \
                patch('prompts.article_illustration_views.resolve_image_generation_request', return_value={}), \
                patch('prompts.article_illustration_views.GrsaiImageClient') as client_class, \
                patch('prompts.article_illustration_views.save_first_grsai_illustration', side_effect=download_error):
            client_class.return_value.generate.return_value = result
            response = self.client.post('/api/prompt/article-illustration/generate', {
                'selectedText': '适合配图的文章段落', 'generationOptions': {},
            }, format='json')

            self.assertEqual(response.status_code, 202)
            self.assertEqual(response.data['data']['status'], 'download_pending')
            pending_id = response.data['data']['pending_id']
            pending = PendingArticleIllustration.objects.get(pk=pending_id)
            self.assertEqual(pending.image_url, result.image_urls[0])
            self.assertEqual(pending.user_id, self.user.profile.userid)
            self.assertEqual(client_class.return_value.generate.call_count, 1)

            with patch('prompts.pending_article_illustration_views.save_first_grsai_illustration',
                       side_effect=download_error):
                failed_retry = self.client.post(f'/api/prompt/article-illustration/pending/{pending_id}', {}, format='json')
            self.assertEqual(failed_retry.status_code, 502)
            self.assertTrue(PendingArticleIllustration.objects.filter(pk=pending_id).exists())

            with patch('prompts.pending_article_illustration_views.save_first_grsai_illustration',
                       return_value={'id': 'saved-asset', 'image_url': '/api/resource/view/saved-asset'}) as save:
                retry = self.client.post(f'/api/prompt/article-illustration/pending/{pending_id}', {}, format='json')

            self.assertEqual(retry.status_code, 200)
            self.assertEqual(retry.data['data']['asset']['id'], 'saved-asset')
            save.assert_called_once_with(result.image_urls, user_id=self.user.profile.userid, task_id=result.task_id)
            self.assertFalse(PendingArticleIllustration.objects.filter(pk=pending_id).exists())
            self.assertEqual(client_class.return_value.generate.call_count, 1)

    def test_pending_urls_are_local_only_and_private(self):
        self.assertIn('prompts.pendingarticleillustration', LOCAL_ONLY_MODEL_LABELS)
        pending = PendingArticleIllustration.objects.create(
            user_id=f'user_{self.user.id}', task_id='private-task',
            image_url='https://images.example.com/private.png',
        )
        owner_listing = self.client.get('/api/prompt/article-illustration/pending')
        owner_payload = json.loads(owner_listing.content)
        self.assertEqual(owner_payload['data'][0]['imageUrl'], pending.image_url)
        self.assertIn('createdAt', owner_payload['data'][0])
        other = User.objects.create_user('other-illustration-user', password='secret')
        self.client.force_authenticate(other)
        listing = self.client.get('/api/prompt/article-illustration/pending')
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data['data'], [])
        retry = self.client.post(f'/api/prompt/article-illustration/pending/{pending.id}', {}, format='json')
        self.assertEqual(retry.status_code, 404)

    def test_async_result_download_failure_also_creates_pending_record(self):
        user_id = f'user_{self.user.id}'
        token = sign_article_illustration_task(task_id='async-task-1', model_id='model-1', user_id=user_id)
        model = SimpleNamespace(id='model-1', provider=SimpleNamespace(type='Grsai'))
        result = GrsaiImageResult(
            task_id='async-task-1', status='succeeded',
            image_urls=('https://images.example.com/async.png',),
        )
        with patch('prompts.article_illustration_views.AIModel') as model_class, \
                patch('prompts.article_illustration_views.GrsaiImageClient') as client_class, \
                patch('prompts.article_illustration_views.save_first_grsai_illustration',
                      side_effect=GrsaiImageError('图片下载超时', retryable=True)):
            model_class.objects.select_related.return_value.filter.return_value.first.return_value = model
            client_class.return_value.get_result.return_value = result
            response = self.client.post('/api/prompt/article-illustration/result', {'taskToken': token}, format='json')

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data['data']['status'], 'download_pending')
        self.assertEqual(PendingArticleIllustration.objects.get(task_id=result.task_id).image_url, result.image_urls[0])
