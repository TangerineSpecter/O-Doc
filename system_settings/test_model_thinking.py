import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.core import serializers
from django.test import TestCase, SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from system_settings.ai_views import AIModelViewSet
from system_settings.models import AIModel, AIProvider, SystemSetting
from system_settings.serializers import AIModelSerializer
from utils.ai_service import AIService
from utils.completion_options import thinking_options
from utils.thinking import thinking_body
from utils.thinking_capabilities import capability


class ThinkingPolicyTests(SimpleTestCase):
    def test_native_model_capability_matrix(self):
        for provider, name, protocol in (
            ('DeepSeek', 'deepseek-flash', 'thinking'),
            ('Qwen', 'qwen3.5-plus', 'enable_thinking'),
            ('SiliconFlow', 'deepseek-ai/DeepSeek-V4-Flash', 'enable_thinking'),
            ('Doubao', 'doubao-seed-1-6-250615', 'thinking'),
            ('Xiaomi', 'mimo-v2.5', 'thinking'),
            ('MiniMax', 'MiniMax-M3', 'adaptive'),
            ('Google AI', 'gemini-2.5-flash', 'reasoning_effort'),
            ('OpenAi', 'gpt-5.1', 'reasoning_effort'),
        ):
            with self.subTest(provider=provider, name=name):
                result = capability({'provider_type': provider, 'model_name': name})
                self.assertTrue(result['supported'])
                self.assertEqual(result['protocol'], protocol)
        for provider, name in (
            ('Qwen', 'qwen3-235b-a22b-thinking-2507'), ('Qwen', 'qwen3-coder-plus'),
            ('Qwen', 'qwen3-32b'), ('Qwen', 'qwen3.7-max-preview'),
            ('Qwen', 'qwen3.8-2.4t-a95b'), ('Qwen', 'qwen-plus-2024-01-01'),
            ('SiliconFlow', 'deepseek-ai/DeepSeek-R1'),
            ('Doubao', 'doubao-seed-1-6-thinking-250715'),
            ('Xiaomi', 'tts'), ('MiniMax', 'MiniMax-M3.1-Flash-Preview'),
            ('Google AI', 'gemini-2.5-pro'), ('Google AI', 'gemini-3-flash-preview'),
            ('OpenAi', 'gpt-4o'), ('OpenAi', 'gpt-5-mini'), ('OpenAi', 'gpt-5.1-codex'),
            ('Grsai', 'gpt-5.1'), ('custom', 'unknown'), ('NewAPI', 'dp-flash'),
        ):
            with self.subTest(provider=provider, name=name):
                self.assertFalse(capability({'provider_type': provider, 'model_name': name})['supported'])

    def test_native_provider_does_not_allow_protocol_bypass(self):
        config = {'provider_type': 'MiniMax', 'model_name': 'MiniMax-M2.5',
                  'thinking_protocol': 'thinking', 'thinking_mode': 'disabled'}
        self.assertFalse(capability(config)['supported'])
        with self.assertRaises(ValueError):
            thinking_body(config)

    @patch('utils.ollama_thinking.model_thinking')
    def test_ollama_requires_actual_toggle_metadata(self, show):
        config = {'provider_type': 'Ollama', 'model_name': 'custom-qwen',
                  'base_url': 'http://localhost:11434/v1', 'thinking_mode': 'disabled'}
        show.return_value = {'values': [False, True], 'default': True}
        self.assertEqual(thinking_body(config), {'reasoning_effort': 'none'})
        config['thinking_mode'] = 'enabled'
        self.assertEqual(thinking_body(config), {'reasoning_effort': 'medium'})
        for metadata in ({'values': ['low', 'medium', 'high']}, {'values': [False]}, {'values': None}, {}):
            show.return_value = metadata
            with self.assertRaises(ValueError):
                thinking_body(config)

    @patch('utils.ollama_thinking.requests.post')
    def test_ollama_metadata_probe_is_read_only_and_bounded(self, post):
        from utils.ollama_thinking import _show
        _show.cache_clear()
        post.return_value.json.return_value = {'thinking': {'values': [False, True]}}
        self.assertEqual(_show('http://example.test/v1', 'qwen', 1)['values'], [False, True])
        post.assert_called_once_with('http://example.test/api/show', json={'model': 'qwen'}, timeout=3)
        _show('http://example.test/v1', 'qwen', 1)
        self.assertEqual(post.call_count, 1)
        _show.cache_clear()

    @patch('utils.ollama_thinking.requests.post')
    def test_ollama_failure_never_claims_toggle_support(self, post):
        import requests
        from utils.ollama_thinking import _show
        _show.cache_clear()
        post.side_effect = requests.Timeout('unavailable')
        result = capability({'provider_type': 'Ollama', 'model_name': 'qwen',
                             'base_url': 'http://example.test/v1'}, probe_ollama=True)
        self.assertFalse(result['supported'])
        _show.cache_clear()

    def test_explicit_policy_overrides_legacy_and_display(self):
        config = {'provider_type': 'DeepSeek', 'model_name': 'deepseek-flash', 'thinking_mode': 'enabled'}
        self.assertEqual(thinking_body(config, default_mode='disabled'), {'thinking': {'type': 'enabled'}})
        config['thinking_mode'] = 'disabled'
        self.assertEqual(thinking_body(config, include_thinking=True), {'thinking': {'type': 'disabled'}})
        self.assertEqual(thinking_options(config), {'thinking': {'type': 'disabled'}})

    def test_alias_protocol_and_unsupported_models(self):
        self.assertEqual(thinking_body({'provider_type': 'NewAPI', 'model_name': 'dp-flash',
            'thinking_mode': 'disabled', 'thinking_protocol': 'thinking'}), {'thinking': {'type': 'disabled'}})
        self.assertEqual(thinking_body({'provider_type': 'Qwen', 'model_name': 'qwen3.5-plus', 'thinking_mode': 'enabled'}), {'enable_thinking': True})
        self.assertEqual(thinking_body({'provider_type': 'MiniMax', 'model_name': 'MiniMax-M3',
            'thinking_mode': 'enabled'}), {'thinking': {'type': 'adaptive'}})
        for model in ('MiniMax-M2.5', 'MiniMax-M3.1-Flash-Preview'):
            with self.assertRaises(ValueError):
                thinking_body({'provider_type': 'MiniMax', 'model_name': model, 'thinking_mode': 'disabled'})
        self.assertEqual(thinking_body({'provider_type': 'OpenAi'}), {})


class ModelThinkingTests(TestCase):
    def setUp(self):
        self.provider = AIProvider.objects.create(name='proxy', type='NewAPI', base_url='https://example.test/v1')
        self.model = AIModel.objects.create(name='dp-flash', type='chat', provider=self.provider,
            thinking_mode='disabled', thinking_protocol='thinking')
        SystemSetting.objects.create(key='system_ai_config', value={
            'defaultChatModelId': self.model.pk, 'simpleChatModelId': self.model.pk,
            'defaultImageModelId': self.model.pk})

    def test_every_config_loader_carries_policy(self):
        for config in (AIService.get_default_client_config(), AIService.get_default_client_config(True),
                       AIService.get_client_config_for_model(self.model.pk), AIService.get_default_image_client_config()):
            self.assertEqual(config['thinking_mode'], 'disabled')
            self.assertEqual(config['thinking_protocol'], 'thinking')

    def test_update_contract_and_reject_invalid_policy(self):
        factory = APIRequestFactory()
        view = AIModelViewSet.as_view({'patch': 'partial_update'})
        request = factory.patch('/', {'thinkingMode': 'enabled'}, format='json')
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True))
        response = view(request, pk=self.model.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['thinking_mode'], 'enabled')
        response.render()
        self.assertEqual(json.loads(response.content)['data']['thinkingMode'], 'enabled')
        self.model.refresh_from_db()
        self.assertEqual(self.model.thinking_mode, 'enabled')
        for values in ({'thinking_mode': 'bogus'}, {'thinking_protocol': 'auto'}, {'type': 'embedding'}):
            serializer = AIModelSerializer(self.model, data=values, partial=True)
            self.assertFalse(serializer.is_valid())
        bad = factory.patch('/', {'thinkingMode': 'invalid'}, format='json')
        force_authenticate(bad, user=SimpleNamespace(is_authenticated=True))
        self.assertEqual(view(bad, pk=self.model.pk).status_code, 400)

    def test_create_and_connection_payload_preserve_policy(self):
        view = AIModelViewSet.as_view({'post': 'create'})
        request = APIRequestFactory().post('/', {'provider': self.provider.pk, 'name': 'alias',
            'type': 'chat', 'thinkingMode': 'disabled', 'thinkingProtocol': 'enable_thinking'}, format='json')
        response = view(request)
        self.assertEqual(response.status_code, 200)
        created = AIModel.objects.get(pk=response.data['data']['id'])
        _, payload = AIModelViewSet._model_test_payload(created)
        self.assertIs(payload['enable_thinking'], False)

    def test_openai_connectivity_temperature_matches_reasoning_mode(self):
        self.provider.type = 'OpenAi'
        self.model.name = 'gpt-5.2'
        self.model.thinking_protocol = 'auto'
        for mode, effort in (('enabled', 'medium'), ('disabled', 'none'), ('default', None)):
            with self.subTest(mode=mode):
                self.model.thinking_mode = mode
                endpoint, payload = AIModelViewSet._model_test_payload(self.model)
                self.assertEqual(endpoint, '/chat/completions')
                self.assertEqual(payload.get('reasoning_effort'), effort)
                if mode == 'enabled':
                    self.assertNotIn('temperature', payload)
                else:
                    self.assertEqual(payload['temperature'], 0)

    def test_capability_endpoint_uses_current_provider_and_draft_model(self):
        from system_settings.ai_views import AIProviderViewSet
        view = AIProviderViewSet.as_view({'get': 'thinking_capability'})
        response = view(APIRequestFactory().get('/', {'name': 'dp-flash'}), pk=self.provider.pk)
        self.assertFalse(response.data['data']['supported'])
        response = view(APIRequestFactory().get('/', {'name': 'dp-flash', 'protocol': 'thinking'}), pk=self.provider.pk)
        self.assertTrue(response.data['data']['supported'])
        response.render()
        self.assertTrue(json.loads(response.content)['data']['manualProtocol'])

    def test_sync_export_restore_and_old_snapshot_defaults(self):
        from utils.sync_manager import SyncManager
        from system_settings.sync_state import should_track
        self.assertTrue(should_track(AIModel))
        manager = SyncManager.__new__(SyncManager)
        self.assertIn(AIModel, list(manager._iter_target_models()))
        rows = json.loads(serializers.serialize('json', manager._queryset_for_export(AIModel)))
        for _ in range(2):
            next(serializers.deserialize('json', json.dumps(rows))).save()
        self.model.refresh_from_db()
        self.assertEqual(self.model.thinking_mode, 'disabled')
        self.assertEqual(AIModel.objects.count(), 1)
        rows[0]['fields'].pop('thinking_mode')
        rows[0]['fields'].pop('thinking_protocol')
        old = next(serializers.deserialize('json', json.dumps(rows))).object
        self.assertEqual((old.thinking_mode, old.thinking_protocol), ('default', 'auto'))

    @patch('utils.ai_service.OpenAI')
    def test_plain_stream_and_simple_requests_use_saved_policy(self, factory):
        client = factory.return_value
        client.chat.completions.create.return_value = SimpleNamespace(choices=[
            SimpleNamespace(message=SimpleNamespace(content='done'), finish_reason='stop')])
        AIService.chat_completion('test', use_simple_model=True)
        AIService.chat_completion_messages([{'role': 'user', 'content': 'test'}], self.model.pk)
        client.chat.completions.create.return_value = MagicMock(__iter__=lambda _: iter([]))
        list(AIService.stream_chat_completion([], include_thinking=True))
        for call in client.chat.completions.create.call_args_list:
            self.assertEqual(call.kwargs['extra_body'], {'thinking': {'type': 'disabled'}})

    @patch('utils.ai_service.OpenAI')
    def test_tools_keep_reasoning_for_next_round(self, factory):
        tool = SimpleNamespace(id='tool-1', function=SimpleNamespace(name='search', arguments='{}'))
        factory.return_value.chat.completions.create.side_effect = [
            SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='',
                reasoning_content='internal reasoning', tool_calls=[tool]))]),
            SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='done', tool_calls=[]))]),
        ]
        result = AIService.chat_completion_messages_with_tools([], [{}], MagicMock(return_value='result'), model_id=self.model.pk)
        self.assertEqual(result, 'done')
        second = factory.return_value.chat.completions.create.call_args_list[1].kwargs
        self.assertEqual(second['extra_body'], {'thinking': {'type': 'disabled'}})
        self.assertEqual(second['messages'][0]['reasoning_content'], 'internal reasoning')
