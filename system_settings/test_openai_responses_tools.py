import json
import time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from utils.ai_service import AIService
from utils.responses_tool_calls import uses_responses_tools
from system_settings.agent_world.market_model_context import compact_messages


CONFIG = {'provider_type': 'OpenAi', 'model_name': 'gpt-6.1-terra', 'model_id': 'model',
          'api_key': 'fake', 'base_url': 'https://example.invalid/v1', 'reasoning_effort': 'high'}
TOOLS = [{'type': 'function', 'function': {'name': 'get_market_context', 'description': 'Read state',
          'parameters': {'type': 'object', 'properties': {'page': {'type': 'integer'}}}}}]


def response(*items, status='completed'):
    return SimpleNamespace(status=status, output=list(items), usage=None)


def call(identity='call-1', name='get_market_context', arguments='{"page": 1}'):
    return {'type': 'function_call', 'id': 'item-' + identity, 'call_id': identity,
            'name': name, 'arguments': arguments, 'status': 'completed'}


def final(text='完成'):
    return {'type': 'message', 'role': 'assistant', 'content': [{'type': 'output_text', 'text': text}]}


class ResponsesToolTests(SimpleTestCase):
    def run_loop(self, responses, *, config=CONFIG, tools=TOOLS, messages=None, executor=None, **kwargs):
        executor = executor or MagicMock(return_value={'data': 'fresh'})
        with patch.object(AIService, 'get_client_config_for_model', return_value=config), \
                patch('utils.ai_service.OpenAI') as factory:
            client = factory.return_value
            client.responses.create.side_effect = responses
            result = AIService.chat_completion_messages_with_tools(
                messages or [{'role': 'user', 'content': '查看市场'}], tools, executor, model_id='model', **kwargs)
            return result, client, executor

    def test_native_models_only_are_routed_to_responses(self):
        for name in ('gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'):
            self.assertTrue(uses_responses_tools({**CONFIG, 'model_name': name}, TOOLS))
        self.assertFalse(uses_responses_tools({**CONFIG, 'provider_type': 'NewAPI'}, TOOLS))
        self.assertFalse(uses_responses_tools({**CONFIG, 'model_name': 'gpt-5.2'}, TOOLS))
        self.assertFalse(uses_responses_tools(CONFIG, []))

    def test_chat_path_remains_for_other_providers_or_requests_without_tools(self):
        for config, tools in [({**CONFIG, 'provider_type': 'NewAPI', 'reasoning_effort': 'default'}, TOOLS), (CONFIG, [])]:
            with self.subTest(provider=config['provider_type'], tools=bool(tools)), \
                    patch.object(AIService, 'get_client_config_for_model', return_value=config), \
                    patch('utils.ai_service.OpenAI') as factory:
                client = factory.return_value
                client.chat.completions.create.return_value = SimpleNamespace(choices=[SimpleNamespace(
                    message=SimpleNamespace(content='完成', tool_calls=[]))])
                self.assertEqual(AIService.chat_completion_messages_with_tools(
                    [{'role': 'user', 'content': '测试'}], tools, MagicMock(), model_id='model'), '完成')
                client.chat.completions.create.assert_called_once()
                client.responses.create.assert_not_called()

    def test_reasoning_replay_tool_outputs_and_compaction(self):
        reasoning1 = {'type': 'reasoning', 'id': 'r1', 'summary': [], 'encrypted_content': 'encrypted-1'}
        reasoning2 = {'type': 'reasoning', 'id': 'r2', 'summary': [], 'encrypted_content': 'encrypted-2'}
        observed = MagicMock()
        result, client, executor = self.run_loop(
            [response(reasoning1, call()), response(reasoning2, call('call-2')), response(final())],
            messages=[{'role': 'system', 'content': '规则'},
                      {'role': 'user', 'content': json.dumps({'market_state': {'balance': 5}})}],
            message_transform=compact_messages, on_tool_call=observed)
        self.assertEqual(result, '完成')
        self.assertEqual(executor.call_count, 2)
        self.assertEqual(observed.call_count, 2)
        self.assertFalse(client.chat.completions.create.called)
        first, second, third = [entry.kwargs for entry in client.responses.create.call_args_list]
        self.assertFalse(first['store'])
        self.assertEqual(first['include'], ['reasoning.encrypted_content'])
        self.assertFalse(first['parallel_tool_calls'])
        self.assertEqual(first['reasoning'], {'effort': 'high'})
        self.assertEqual(first['tools'][0]['name'], 'get_market_context')
        self.assertIs(first['tools'][0]['strict'], False)
        self.assertIn(reasoning1, second['input'])
        self.assertIn({'type': 'function_call_output', 'call_id': 'call-1', 'output': '{"data": "fresh"}'}, second['input'])
        self.assertIn('superseded', json.loads(second['input'][1]['content'])['market_state'])
        self.assertIn(reasoning1, third['input'])
        self.assertIn(reasoning2, third['input'])
        old_output = next(item for item in third['input'] if item.get('call_id') == 'call-1' and item.get('type') == 'function_call_output')
        self.assertEqual(json.loads(old_output['output'])['superseded_by'], 'call-2')

    def test_multimodal_user_input_is_converted_for_responses(self):
        _, client, _ = self.run_loop([response(final())], messages=[{'role': 'user', 'content': [
            {'type': 'text', 'text': '看一下'},
            {'type': 'image_url', 'image_url': {'url': 'https://example.invalid/a.png', 'detail': 'low'}}]}])
        parts = client.responses.create.call_args.kwargs['input'][0]['content']
        self.assertEqual(parts, [{'type': 'input_text', 'text': '看一下'},
                                 {'type': 'input_image', 'image_url': 'https://example.invalid/a.png', 'detail': 'low'}])

    def test_unsafe_incomplete_or_unreplayable_response_never_executes_tools(self):
        for result in (
            response(call(), status='incomplete'),
            response({'type': 'reasoning', 'id': 'r1', 'summary': []}, call()),
            response(call(name='not_allowed')),
            response(call(arguments='[]')),
            response(call(arguments='invalid')),
            response({**call(), 'status': 'incomplete'}),
            response(call(), call()),
        ):
            executor = MagicMock()
            with self.subTest(result=result), self.assertRaises((ValueError, RuntimeError)):
                self.run_loop([result], executor=executor)
            executor.assert_not_called()

    def test_repeated_call_id_is_rejected_before_second_execution(self):
        executor = MagicMock(return_value='ok')
        with self.assertRaisesRegex(ValueError, '重复'):
            self.run_loop([response(call()), response(call())], executor=executor)
        executor.assert_called_once()

    def test_expected_tool_stop_and_deadline_are_preserved(self):
        class Finished(Exception):
            expected_tool_stop = True
        executor = MagicMock(side_effect=Finished('已完成'))
        result, _, _ = self.run_loop([response(call())], executor=executor)
        self.assertEqual(result, '已完成')
        executor = MagicMock()
        with self.assertRaises(TimeoutError):
            self.run_loop([response(call())], executor=executor, deadline=time.monotonic() - 1)
        executor.assert_not_called()

    def test_named_tool_choice_and_legacy_policy(self):
        config = {**CONFIG, 'reasoning_effort': 'default', 'thinking_mode': 'disabled'}
        _, client, _ = self.run_loop([response(final())], config=config,
            tool_choice={'type': 'function', 'function': {'name': 'get_market_context'}})
        options = client.responses.create.call_args.kwargs
        self.assertEqual(options['reasoning'], {'effort': 'none'})
        self.assertEqual(options['tool_choice'], {'type': 'function', 'name': 'get_market_context'})

    def test_explicit_task_disable_prefers_none_when_supported(self):
        for name in ('gpt-6.1-terra', 'gpt-6-sol', 'gpt-6-luna'):
            with self.subTest(name=name):
                config = {**CONFIG, 'model_name': name, 'reasoning_effort': 'default'}
                _, client, _ = self.run_loop([response(final())], config=config, disable_thinking=True)
                self.assertEqual(client.responses.create.call_args.kwargs['reasoning'], {'effort': 'none'})
                _, client, _ = self.run_loop([response(final())], config=config, use_simple_model=True)
                self.assertNotIn('reasoning', client.responses.create.call_args.kwargs)

    def test_task_disable_respects_saved_effort_and_unsupported_none(self):
        for name in ('gpt-6.1-terra', 'gpt-6-sol', 'gpt-6-luna'):
            with self.subTest(name=name):
                config = {**CONFIG, 'model_name': name}
                _, client, _ = self.run_loop([response(final())], config=config, disable_thinking=True)
                self.assertEqual(client.responses.create.call_args.kwargs['reasoning'], {'effort': 'high'})
        for name in ('gpt-6.1-sol', 'gpt-6-astra'):
            with self.subTest(name=name):
                config = {**CONFIG, 'model_name': name, 'reasoning_effort': 'default'}
                with self.assertLogs('utils.ai_service', level='WARNING') as logs:
                    _, client, _ = self.run_loop([response(final())], config=config, disable_thinking=True)
                self.assertNotIn('reasoning', client.responses.create.call_args.kwargs)
                self.assertIn('不支持关闭', logs.output[0])
