"""分类配图契约与补偿测试：不调用远程模型，不写真实媒体。"""
import copy
import tempfile
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from system_settings.models import WorldActionRuntime, AIModel, AIProvider
from article.models import Article
from . import test_publish as fixtures
from .publish_config import CategoryRuleSerializer
from .publish_media import recover_photo, operate_photo, runtime_id
from .publish_image_prompt import build_prompt

OPTIONS = {'configured': True, 'model_id': 'image-model', 'supports_reference_images': True,
           'agent_reference_images': {'avatar': 'a'*32, 'full_body': 'b'*32},
           'default_aspect_ratio': '16:9', 'default_image_size': '1K', 'mode': 'manual'}


class PostPhotoTests(TestCase):
    def setUp(self):
        self.media = tempfile.TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name)
        self.settings_override.enable()
        self.addCleanup(self.media.cleanup)
        self.addCleanup(self.settings_override.disable)
        fixtures.PublicationTests.setUp(self)
        self.config['rules'][0].update(image_enabled=True, image_subject='auto', image_prompt='暖色厨房')
        self.task.publish_config = self.config
        self.task.save()
        self.state['config'] = copy.deepcopy(self.config)
        self.options = patch('system_settings.agent_world.publish_media.image_generation_options', return_value=OPTIONS)
        from .publish_media import _poll_times, _started_times
        _poll_times.clear(); _started_times.clear()
        self.options.start()
        self.addCleanup(self.options.stop)

    action = fixtures.PublicationTests.action
    commit = fixtures.PublicationTests.commit

    def published(self):
        action = self.action()
        self.commit(action)
        action.refresh_from_db()
        return action

    def result(self):
        return {'status': 'succeeded', 'task_id': 'c'*32, 'image_url': '/api/resource/view/test', 'asset_id': 'd'*32}

    def test_old_rule_defaults_and_invalid_subject(self):
        serializer = CategoryRuleSerializer(data={'category_id': self.category.pk, 'modes': ['topic']})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertFalse(serializer.validated_data['image_enabled'])
        invalid = CategoryRuleSerializer(data={'category_id': self.category.pk, 'modes': ['topic'], 'image_subject': 'anything'})
        self.assertFalse(invalid.is_valid())

    def test_model_type_and_reference_capability_validation(self):
        base = {'category_id': self.category.pk, 'modes': ['topic'], 'image_enabled': True, 'image_subject': 'agent'}
        invalid = CategoryRuleSerializer(data={**base, 'image_model_id': self.agent.model_id})
        self.assertFalse(invalid.is_valid())
        provider = AIProvider.objects.create(name='newapi', type='NewAPI', base_url='https://example.invalid')
        model = AIModel.objects.create(provider=provider, name='image', type='image_generation')
        serializer = CategoryRuleSerializer(data={**base, 'image_model_id': model.pk})
        self.assertFalse(serializer.is_valid())

    def test_commit_queues_one_and_never_generates_inline(self):
        with patch('system_settings.agent_world.publish_media.generate_image') as generate:
            action = self.published()
            self.commit(action)
        generate.assert_not_called()
        self.assertEqual(Article.objects.count(), 1)
        photo = action.snapshot['photo']
        self.assertEqual(photo['status'], 'pending')
        self.assertEqual(photo['request']['model_id'], 'image-model')
        self.assertEqual(photo['request']['reference_image_ids'], ['a'*32, 'b'*32])
        self.assertIn('暖色厨房', photo['request']['prompt'])
        self.assertIn('Q版', photo['request']['prompt'])

    def test_scene_omits_references(self):
        article = Article(title='食谱', content='料理知识')
        prompt, refs = build_prompt(article, {'image_subject': 'scene', 'image_prompt': ''}, OPTIONS['agent_reference_images'])
        self.assertEqual(refs, [])
        self.assertIn('不出现人物', prompt)
        self.assertIn('不能画成', prompt)

    def test_missing_model_keeps_text_published(self):
        with patch('system_settings.agent_world.publish_media.image_generation_options', return_value={'configured': False, 'message': '无模型'}):
            action = self.published()
        self.assertEqual(action.status, 'success')
        self.assertEqual(action.snapshot['photo']['status'], 'failed')
        self.assertEqual(Article.objects.count(), 1)

    def test_completion_inserts_once(self):
        action = self.published()
        with patch('system_settings.agent_world.publish_media.generate_image', return_value=self.result()) as generate:
            recover_photo(action)
            recover_photo(action)
        generate.assert_called_once()
        action.refresh_from_db()
        self.assertEqual(action.snapshot['photo']['status'], 'inserted')
        self.assertEqual(Article.objects.get().content.count('![帖子配图]'), 1)

    def test_poll_preserves_original_request(self):
        action = self.published()
        with patch('system_settings.agent_world.publish_media.generate_image', return_value={'status': 'generating', 'task_id': 'c'*32}):
            recover_photo(action)
        action.refresh_from_db()
        operate_photo(action, 'query')
        with patch('system_settings.agent_world.publish_media.get_image_generation_result', return_value=self.result()) as query, patch('system_settings.agent_world.publish_media.generate_image') as generate:
            recover_photo(action)
        query.assert_called_once_with({'task_id': 'c'*32}, agent=self.agent)
        generate.assert_not_called()

    def test_manual_edit_preserved_and_explicit_insert(self):
        action = self.published()
        post = Article.objects.get()
        post.content = '我的人工修改'; post.save()
        with patch('system_settings.agent_world.publish_media.generate_image', return_value=self.result()):
            recover_photo(action)
        action.refresh_from_db()
        self.assertEqual(action.snapshot['photo']['status'], 'manual')
        self.assertEqual(Article.objects.get().content, '我的人工修改')
        operate_photo(action, 'use_image')
        self.assertTrue(Article.objects.get().content.startswith('我的人工修改'))

    def test_uncertain_submission_cannot_retry(self):
        action = self.published()
        with patch('system_settings.agent_world.publish_media.generate_image', return_value={'status': 'submission_unknown', 'task_id': 'c'*32, 'message': '未知'}):
            recover_photo(action)
        with self.assertRaises(ValueError):
            operate_photo(action, 'retry')

    def test_retry_uses_new_key_without_mutating_publish_config(self):
        action = self.published()
        original = copy.deepcopy(action.snapshot['config'])
        with patch('system_settings.agent_world.publish_media.generate_image', return_value={'status': 'failed', 'task_id': 'c'*32}):
            recover_photo(action)
        action.refresh_from_db()
        action = operate_photo(action, 'retry')
        self.assertEqual(action.snapshot['config'], original)
        self.assertEqual(action.snapshot['photo']['request']['request_id'], f'post:{action.pk}:1')
        self.assertNotIn('task_id', action.snapshot['photo'])

    def test_restored_snapshot_without_runtime_does_not_submit(self):
        action = self.published()
        WorldActionRuntime.objects.filter(pk=runtime_id(action)).delete()
        with patch('system_settings.agent_world.publish_media.generate_image') as generate:
            recover_photo(action)
        generate.assert_not_called()
        from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS
        self.assertIn('system_settings.worldactionruntime', LOCAL_ONLY_MODEL_LABELS)

    def test_endpoint_permissions_confirmation_and_public_fields(self):
        action = self.published()
        url = f'/api/settings/agent-world/posts/{action.snapshot["post_id"]}/photo/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn('request', response.data['data'])
        self.assertEqual(self.client.post(url, {'action': 'retry'}, format='json').status_code, 400)
        other = User.objects.create_user('other')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post(url, {'action': 'query'}, format='json').status_code, 403)
        anonymous = APIClient()
        self.assertEqual(anonymous.get(url).status_code, 200)
        self.assertIn(anonymous.post(url, {'action': 'query'}, format='json').status_code, (401, 403))

    def test_sync_roundtrip_keeps_photo_and_disables_local_worker(self):
        from pathlib import Path
        from utils.sync_manager import SyncManager
        from system_settings.sync_state import suspend_tracking
        from system_settings.models import WorldAction
        action = self.published()
        with tempfile.TemporaryDirectory() as root:
            media = Path(root) / 'media'; media.mkdir()
            sentinel = Path(root) / 'outside.txt'; sentinel.write_text('preserved')
            with override_settings(MEDIA_ROOT=media):
                manager = SyncManager()
                data = manager.build_snapshot_data()
                exported = next(row for row in data if row['model'] == 'system_settings.worldaction' and row['pk'] == action.pk)
                self.assertIn('photo', exported['fields']['snapshot'])
                self.assertNotIn('polled_at', exported['fields']['snapshot']['photo'])
                self.assertFalse(any(row['model'] == 'system_settings.worldactionruntime' for row in data))
                WorldAction.objects.filter(pk=action.pk).update(snapshot={}, status='failed')
                with patch('system_settings.agent_world.settlement.reconcile_awards'), patch('article.html_note_resources.retry_html_cleanup'), patch('article.version_service.enforce_article_version_retention'), suspend_tracking():
                    manager.apply_snapshot_data(copy.deepcopy(data))
                    manager.apply_snapshot_data(copy.deepcopy(data))
                action.refresh_from_db()
                self.assertEqual(action.snapshot['photo']['status'], 'pending')
                self.assertFalse(WorldActionRuntime.objects.get(pk=runtime_id(action)).enabled)
                self.assertEqual(sentinel.read_text(), 'preserved')

    def test_config_api_accepts_camel_case_and_retains_optional_prompt(self):
        response = self.client.patch(f'/api/settings/agent-tasks/{self.task.pk}/', {'publishConfig': {
            'collectionId': self.collection.pk, 'searchServerId': self.server.pk,
            'rules': [{'categoryId': self.category.pk, 'modes': ['topic'], 'imageEnabled': True,
                       'imageSubject': 'scene', 'imagePrompt': ''}]}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.task.refresh_from_db()
        rule = self.task.publish_config['rules'][0]
        self.assertTrue(rule['image_enabled'])
        self.assertEqual(rule['image_prompt'], '')
        self.assertEqual(rule['image_subject'], 'scene')

    def test_restored_pending_state_exposes_query_control(self):
        from .publish_media import public_photo, reset_photo_runtime
        action = self.published()
        reset_photo_runtime()
        self.assertEqual(public_photo(action)['status'], 'paused')
        self.assertLessEqual(len(runtime_id(action)), 40)
        operate_photo(action, 'query')
        self.assertEqual(public_photo(action)['status'], 'pending')

    def test_deleted_post_stops_without_provider_call(self):
        action = self.published()
        Article.objects.filter(pk=action.snapshot['post_id']).update(is_valid=False)
        with patch('system_settings.agent_world.publish_media.generate_image') as generate:
            recover_photo(action)
        generate.assert_not_called()
        action.refresh_from_db()
        self.assertEqual(action.snapshot['photo']['status'], 'abandoned')

    def test_runtime_revocation_during_generation_preserves_restored_state(self):
        from .publish_media import reset_photo_runtime
        action = self.published()
        def result(*args, **kwargs):
            reset_photo_runtime()
            return self.result()
        with patch('system_settings.agent_world.publish_media.generate_image', side_effect=result):
            recover_photo(action)
        action.refresh_from_db()
        self.assertEqual(action.snapshot['photo']['status'], 'pending')
        self.assertNotIn('![帖子配图]', Article.objects.get().content)
