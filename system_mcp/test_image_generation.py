from django.test import TestCase

from assets.models import Asset
from system_settings.models import Agent, AIModel, AIProvider, MCPServer, SystemSetting
from utils.mcp_client import call_mcp_tool, fetch_mcp_tools
from utils.resource_assets import get_resource_view_url
from .image_generation import validate_generation_arguments
from .views import get_system_mcp_tools_for_scope


class ImageGenerationOptionsTests(TestCase):
    def setUp(self):
        self.provider = AIProvider.objects.create(name='Grsai', type='Grsai', base_url='https://grsai.example/v1', api_key='test-key')
        self.model = AIModel.objects.create(provider=self.provider, name='nano-banana-2', type='image_generation')
        SystemSetting.objects.create(key='system_ai_config', value={'defaultImageGenerationModelId': self.model.pk})
        self.server = MCPServer.objects.create(name='生图 MCP', source='system', enabled=True, transport='streamableHttp')

    def test_tools_are_visible_only_in_image_scope_and_keep_legacy_tool(self):
        tools, error = fetch_mcp_tools(self.server)
        self.assertIsNone(error)
        names = {tool['name'] for tool in tools}
        self.assertEqual(names, {'get_illustration_options', 'get_image_generation_options',
                                 'generate_image', 'get_image_generation_result'})
        for scope in ('system', 'agent_posts', 'vision'):
            self.assertFalse(names & {tool['name'] for tool in get_system_mcp_tools_for_scope(scope)})

    def test_options_include_explicit_role_reference_ids(self):
        asset = Asset.objects.create(id='character-options-test', name='character.png', original_name='character.png',
            file_type='image', file_size=10, file_path='image/character.png', file_extension='.png',
            mime_type='image/png', uploader='admin', file_hash='character-options-hash')
        agent = Agent.objects.create(name='角色', avatar='🌸', full_body_image=get_resource_view_url(asset.pk))
        result, error = call_mcp_tool(self.server, 'get_image_generation_options', {}, agent=agent)
        self.assertIsNone(error)
        self.assertTrue(result['supports_reference_images'])
        self.assertEqual(result['agent_reference_images'], {'full_body': asset.pk})
        self.assertEqual(result['default_aspect_ratio'], '1:1')
        self.assertEqual(result['default_image_size'], '1K')

    def test_options_do_not_claim_newapi_reference_support(self):
        self.provider.type = 'NewAPI'
        self.provider.save()
        result, error = call_mcp_tool(self.server, 'get_image_generation_options', {})
        self.assertIsNone(error)
        self.assertFalse(result['supports_reference_images'])
        self.assertEqual(result['max_reference_images'], 0)

    def test_validates_arguments_and_preserves_prompt(self):
        text = '  原样提示词\n换行  '
        self.assertEqual(validate_generation_arguments({'prompt': text})['prompt'], text)
        for args in ({'prompt': ' '}, {'prompt': 'x', 'image_size': '8K'},
                     {'prompt': 'x', 'reference_image_ids': ['same', 'same']},
                     {'prompt': 'x', 'reference_image_ids': 'url'},
                     {'prompt': 'x', 'images': ['http://localhost/secret']}):
            with self.subTest(args=args), self.assertRaises(ValueError):
                validate_generation_arguments(args)

    def test_explicit_options_do_not_require_a_system_default(self):
        SystemSetting.objects.filter(key='system_ai_config').update(value={})
        result, error = call_mcp_tool(self.server, 'get_image_generation_options', {'model_id': str(self.model.pk)})
        self.assertIsNone(error)
        self.assertTrue(result['configured'])
        self.assertEqual(result['model_id'], str(self.model.pk))
        invalid, error = call_mcp_tool(self.server, 'get_image_generation_options', {'model_id': 'missing'})
        self.assertFalse(invalid['configured'])


class ImageGenerationLifecycleTests(ImageGenerationOptionsTests):
    def setUp(self):
        super().setUp()
        import tempfile
        from django.test import override_settings
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        from io import BytesIO
        from PIL import Image
        output = BytesIO()
        Image.new('RGB', (8, 8), 'blue').save(output, format='PNG')
        from prompts.generation import _validate_image_content
        self.image = _validate_image_content(output.getvalue())

    def _submit(self, **kwargs):
        from .image_generation_tasks import generate_image
        return generate_image({'prompt': '角色在铁塔前', 'request_id': 'trip-scene-1', **kwargs})

    def test_explicit_model_is_saved_and_repeated_request_cannot_switch_models(self):
        from unittest.mock import patch
        from system_settings.grsai_images import GrsaiImageResult
        from prompts.models import ImageGenerationTask
        selected = AIModel.objects.create(provider=self.provider, name='nano-banana-pro', type='image_generation')
        SystemSetting.objects.filter(key='system_ai_config').update(value={})
        with patch('system_mcp.image_generation_tasks.GrsaiImageClient') as client:
            client.return_value.generate.return_value = GrsaiImageResult('explicit-task', 'pending')
            first = self._submit(model_id=str(selected.pk))
            again = self._submit(model_id=str(selected.pk))
            self.assertEqual(first['task_id'], again['task_id'])
            self.assertEqual(ImageGenerationTask.objects.get().model_id, str(selected.pk))
            self.assertEqual(client.call_args.args[0].pk, selected.pk)
            client.return_value.generate.assert_called_once()
            with self.assertRaises(ValueError):
                self._submit(model_id=str(self.model.pk))

    def test_invalid_explicit_model_does_not_fall_back_or_submit(self):
        from unittest.mock import patch
        from prompts.models import ImageGenerationTask
        with patch('system_mcp.image_generation_tasks.GrsaiImageClient') as client:
            with self.assertRaises(ValueError):
                self._submit(model_id='missing')
            client.assert_not_called()
        self.assertFalse(ImageGenerationTask.objects.exists())

    def test_async_mcp_submission_query_and_resource_saved_once(self):
        from unittest.mock import patch
        from system_settings.grsai_images import GrsaiImageResult
        from prompts.models import ImageGenerationTask
        with patch('system_mcp.image_generation_tasks.GrsaiImageClient') as client, patch(
                'system_mcp.image_generation_tasks._download_generated_images', return_value=[self.image]) as download:
            client.return_value.generate.return_value = GrsaiImageResult('provider-task-1', 'pending')
            result, error = call_mcp_tool(self.server, 'generate_image', {'prompt': '角色在铁塔前', 'request_id': 'trip-scene-1'})
            self.assertIsNone(error)
            self.assertEqual(result['status'], 'generating')
            self.assertEqual(self._submit()['task_id'], result['task_id'])
            client.return_value.generate.assert_called_once()
            client.return_value.get_result.return_value = GrsaiImageResult('provider-task-1', 'succeeded', ('https://images.example/scene.png',))
            # A later default-model change must not redirect the pending request.
            SystemSetting.objects.filter(key='system_ai_config').update(value={})
            done, error = call_mcp_tool(self.server, 'get_image_generation_result', {'task_id': result['task_id']})
            self.assertIsNone(error)
            self.assertEqual(done['status'], 'succeeded')
            asset = Asset.objects.get(pk=done['asset_id'])
            self.assertEqual(asset.original_name, '生成图片.png')
            from pathlib import Path
            self.assertTrue((Path(self.media.name) / asset.file_path).is_file())
            again, error = call_mcp_tool(self.server, 'get_image_generation_result', {'task_id': result['task_id']})
            self.assertEqual(again['asset_id'], done['asset_id'])
            self.assertEqual(Asset.objects.count(), 1)
            download.assert_called_once()
            self.assertEqual(ImageGenerationTask.objects.get().model_id, str(self.model.pk))

    def test_download_recovery_does_not_generate_again(self):
        from unittest.mock import patch
        from system_settings.grsai_images import GrsaiImageResult, GrsaiImageError
        from .image_generation_tasks import get_image_generation_result
        with patch('system_mcp.image_generation_tasks.GrsaiImageClient') as client, patch(
                'system_mcp.image_generation_tasks._download_generated_images', side_effect=[GrsaiImageError('下载失败'), [self.image]]):
            client.return_value.generate.return_value = GrsaiImageResult('provider-task', 'succeeded', ('https://images.example/x.png',))
            first = self._submit()
            self.assertEqual(first['status'], 'download_pending')
            done = get_image_generation_result({'task_id': first['task_id']})
            self.assertEqual(done['status'], 'succeeded')
            client.return_value.generate.assert_called_once()
            client.return_value.get_result.assert_not_called()

    def test_uncertain_submission_is_not_retried_or_polled(self):
        from unittest.mock import patch
        from system_settings.grsai_images import GrsaiImageError
        from .image_generation_tasks import get_image_generation_result
        with patch('system_mcp.image_generation_tasks.GrsaiImageClient') as client:
            client.return_value.generate.side_effect = GrsaiImageError('超时', status_code=504)
            first = self._submit()
            self.assertEqual(first['status'], 'submission_unknown')
            self.assertEqual(self._submit()['task_id'], first['task_id'])
            self.assertEqual(get_image_generation_result({'task_id': first['task_id']})['status'], 'submission_unknown')
            client.return_value.generate.assert_called_once()
            client.return_value.get_result.assert_not_called()
            with self.assertRaises(ValueError):
                self._submit(prompt='不同画面')

    def test_task_is_private_to_agent_and_expired_submission_is_unknown(self):
        from datetime import timedelta
        from django.utils import timezone
        from prompts.models import ImageGenerationTask
        from .image_generation_tasks import get_image_generation_result
        task = ImageGenerationTask.objects.create(user_id='admin', agent_key='', request_id='stale', input_hash='x',
            model_id=str(self.model.pk), provider_type='Grsai', lease_until=timezone.now() - timedelta(seconds=1))
        agent = Agent.objects.create(name='另一个角色')
        with self.assertRaises(ValueError):
            get_image_generation_result({'task_id': task.pk}, agent)
        self.assertEqual(get_image_generation_result({'task_id': task.pk})['status'], 'submission_unknown')

    def test_reference_rejection_precedes_creation_and_network(self):
        from unittest.mock import patch
        from prompts.models import ImageGenerationTask
        self.provider.type = 'NewAPI'
        self.provider.save()
        with patch('system_mcp.image_generation_tasks.NewApiImageClient') as client, self.assertRaises(ValueError):
            self._submit(reference_image_ids=['missing'])
        client.assert_not_called()
        self.assertFalse(ImageGenerationTask.objects.exists())

    def test_newapi_text_generation_saves_bytes(self):
        from unittest.mock import patch
        from system_settings.newapi_images import NewApiImageResult
        self.provider.type = 'NewAPI'
        self.provider.save()
        with patch('system_mcp.image_generation_tasks.NewApiImageClient') as client:
            client.return_value.generate.return_value = NewApiImageResult((self.image.content,))
            result = self._submit()
            self.assertEqual(result['status'], 'succeeded')
            client.return_value.generate.assert_called_once_with('角色在铁塔前')
            client.return_value.fetch_image.assert_not_called()

    def test_explicit_reference_reaches_provider_without_prompt_rewriting(self):
        from pathlib import Path
        from unittest.mock import patch
        from system_settings.grsai_images import GrsaiImageResult
        path = Path(self.media.name) / 'reference.png'
        path.write_bytes(self.image.content)
        asset = Asset.objects.create(id='reference-id', name='ref.png', original_name='ref.png', file_type='image',
            file_size=len(self.image.content), file_path='reference.png', file_extension='.png', mime_type='image/png',
            uploader='admin', file_hash='reference-hash')
        with patch('system_mcp.image_generation_tasks.GrsaiImageClient') as client:
            client.return_value.generate.return_value = GrsaiImageResult('provider-task', 'pending')
            result = self._submit(reference_image_ids=[asset.pk])
            self.assertEqual(result['status'], 'generating')
            args, kwargs = client.return_value.generate.call_args
            self.assertEqual(args, ('角色在铁塔前',))
            self.assertTrue(kwargs['reference_images'][0].startswith('data:image/png;base64,'))
            self.assertTrue(kwargs['asynchronous'])
            from .image_generation_tasks import get_image_generation_result
            from prompts.models import ImageGenerationTask
            from django.utils import timezone
            from datetime import timedelta
            task = ImageGenerationTask.objects.get(pk=result['task_id'])
            task.lease_until = timezone.now() + timedelta(minutes=1)
            task.save()
            self.assertEqual(get_image_generation_result({'task_id': task.pk})['status'], 'generating')
            client.return_value.get_result.assert_not_called()

    def test_provider_terminal_failure_stops_polling(self):
        from unittest.mock import patch
        from system_settings.grsai_images import GrsaiImageResult, GrsaiImageError
        from .image_generation_tasks import get_image_generation_result
        with patch('system_mcp.image_generation_tasks.GrsaiImageClient') as client:
            client.return_value.generate.return_value = GrsaiImageResult('provider-task', 'pending')
            client.return_value.get_result.side_effect = GrsaiImageError('内容审核失败', status_code=422)
            task_id = self._submit()['task_id']
            self.assertEqual(get_image_generation_result({'task_id': task_id})['status'], 'failed')
            self.assertEqual(get_image_generation_result({'task_id': task_id})['status'], 'failed')
            client.return_value.get_result.assert_called_once()
            client.return_value.generate.assert_called_once()
