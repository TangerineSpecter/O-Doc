"""No real providers, database, media, keys or network in these regressions."""
import asyncio
import json
import threading
import time
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from django.test import SimpleTestCase
from openai import APIConnectionError, AsyncOpenAI, AuthenticationError, BadRequestError

from utils.ai_observer import observe_ai
from utils.ai_service import AIAuthenticationError, AIService
from utils.completion_options import thinking_options
from utils.bounded_completion import AIBoundedRequestError, AIOutputTruncated, AIRequestTimeout, AIStreamIncomplete, complete

from .errors import AnalysisError
from .extraction import SCHEMA, extract_segment


CONFIG = {'api_key': 'never-log-this-key', 'base_url': 'https://example.invalid/v1', 'model_name': 'test-model', 'model_role': 'simple', 'provider_name': '测试提供商'}


class FakeStream:
    def __init__(self, content='', finish='stop', *, hang=False):
        self.content, self.finish, self.hang, self.closed = content, finish, hang, False

    async def __aiter__(self):
        if self.hang:
            await asyncio.sleep(100)
        midpoint = max(1, len(self.content) // 2)
        for text in (self.content[:midpoint], self.content[midpoint:]):
            yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=text), finish_reason=None)], usage=None)
        yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=None), finish_reason=self.finish)], usage=None)

    async def close(self):
        self.closed = True


class FakeClient:
    def __init__(self, responder, requests, clients, **options):
        self.options, self.closed = options, False
        clients.append(self)

        async def create(**parameters):
            requests.append(parameters)
            response = responder(parameters)
            if isinstance(response, Exception):
                raise response
            return response

        self.chat = SimpleNamespace(completions=SimpleNamespace(create=create))

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        self.closed = True


def fake_factory(responder, requests, clients):
    return lambda **options: FakeClient(responder, requests, clients, **options)


class BoundedCompletionTests(SimpleTestCase):
    def call(self, responder, *, json_output=True, seconds=120, control=None):
        self.requests, self.clients, self.events = [], [], []
        factory = fake_factory(responder, self.requests, self.clients)
        with patch('utils.bounded_completion.AsyncOpenAI', side_effect=factory), patch('utils.bounded_completion.DEADLINE_SECONDS', seconds), observe_ai(lambda kind, title, level, details: self.events.append((kind, details)), check_cancel=control):
            return complete(CONFIG, 'private book text; JSON requested', json_output=json_output, max_tokens=6000, extra_body={})

    def test_stream_controls_progress_and_no_raw_content_in_events(self):
        stream = FakeStream('{"nodes":[],"edges":[]}')
        self.assertEqual(self.call(lambda _: stream), stream.content)
        parameters = self.requests[0]
        self.assertTrue(parameters['stream'])
        self.assertEqual(parameters['max_tokens'], 6000)
        self.assertEqual(parameters['response_format'], {'type': 'json_object'})
        self.assertEqual(self.clients[0].options['max_retries'], 0)
        self.assertTrue(self.clients[0].closed and stream.closed)
        self.assertIn('model_first_output', [kind for kind, _ in self.events])
        self.assertIn('model_response', [kind for kind, _ in self.events])
        self.assertNotIn('private book text', str(self.events))
        self.assertNotIn(CONFIG['api_key'], str(self.events))

    def test_silent_provider_has_hard_deadline_and_no_timeout_retry(self):
        stream = FakeStream(hang=True)
        started = time.monotonic()
        with self.assertRaises(AIRequestTimeout):
            self.call(lambda _: stream, seconds=.12)
        self.assertLess(time.monotonic() - started, 1)
        self.assertEqual(len(self.requests), 1)
        self.assertTrue(stream.closed and self.clients[0].closed)
        self.assertFalse(any(t.name == 'bounded-ai-network' and t.is_alive() for t in threading.enumerate()))

    def test_trickling_whitespace_does_not_reset_wall_clock_deadline(self):
        class Trickle(FakeStream):
            async def __aiter__(self):
                while True:
                    await asyncio.sleep(.02)
                    yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=' '), finish_reason=None)], usage=None)
        stream = Trickle()
        started = time.monotonic()
        with self.assertRaises(AIRequestTimeout):
            self.call(lambda _: stream, seconds=.14)
        self.assertLess(time.monotonic() - started, 1)
        self.assertTrue(stream.closed)
        self.assertIn('model_first_output', [kind for kind, _ in self.events])
        self.assertNotIn('model_response', [kind for kind, _ in self.events])

    def test_bounded_authentication_preserves_actual_model_context_and_hides_body(self):
        response = httpx.Response(401, request=httpx.Request('POST', CONFIG['base_url']))
        error = AuthenticationError('private book and never-log-this-key', response=response, body={'error': CONFIG['api_key']})
        requests, clients = [], []
        with patch('utils.ai_service.AIService.get_default_client_config', return_value=CONFIG), patch('utils.bounded_completion.AsyncOpenAI', side_effect=fake_factory(lambda _: error, requests, clients)):
            with self.assertRaises(AIAuthenticationError) as caught:
                AIService.chat_completion('private text', use_simple_model=True, bounded=True, json_output=True)
        self.assertEqual(caught.exception.model_role, 'simple')
        self.assertEqual(len(requests), 1)
        self.assertTrue(clients[0].closed)
        self.assertNotIn(CONFIG['api_key'], str(caught.exception))

    def test_stop_interrupts_wait_and_preserves_cancellation_exception(self):
        stream = FakeStream(hang=True)
        def control():
            if getattr(self, 'requests', []):
                raise AnalysisError('已停止分析', 499)
        with self.assertRaises(AnalysisError) as caught:
            self.call(lambda _: stream, control=control)
        self.assertEqual(caught.exception.status, 499)
        self.assertTrue(stream.closed and self.clients[0].closed)
        self.assertNotIn('model_response', [kind for kind, _ in self.events])

    def test_transport_retry_is_explicit_and_shares_deadline(self):
        error = APIConnectionError(request=httpx.Request('POST', CONFIG['base_url']))
        self.assertEqual(self.call(lambda _: error if len(self.requests) == 1 else FakeStream('ok')), 'ok')
        starts = [details for kind, details in self.events if kind == 'model_request_started']
        self.assertEqual([s['request_attempt'] for s in starts], [1, 2])
        self.assertLessEqual(self.clients[1].options['timeout'], self.clients[0].options['timeout'])
        self.assertIn('model_transport_retry', [kind for kind, _ in self.events])

    def test_only_explicit_json_parameter_rejection_allows_compatibility_retry(self):
        response = httpx.Response(400, request=httpx.Request('POST', CONFIG['base_url']))
        unsupported = BadRequestError('safe fixture', response=response, body={'error': 'response_format json_object not supported'})
        self.assertEqual(self.call(lambda _: unsupported if len(self.requests) == 1 else FakeStream('{}')), '{}')
        self.assertNotIn('response_format', self.requests[1])
        self.assertIn('model_compatibility', [kind for kind, _ in self.events])
        bad_model = BadRequestError('safe fixture', response=response, body={'error': 'invalid model'})
        with self.assertRaises(AIBoundedRequestError):
            self.call(lambda _: bad_model)
        self.assertEqual(len(self.requests), 1)

    def test_provider_error_body_cannot_escape_into_task_logs(self):
        response = httpx.Response(400, request=httpx.Request('POST', CONFIG['base_url']))
        error = BadRequestError('private book text never-log-this-key', response=response, body={'error': CONFIG['api_key']})
        with self.assertRaises(AIBoundedRequestError) as caught:
            self.call(lambda _: error)
        self.assertNotIn(CONFIG['api_key'], str(caught.exception))
        self.assertNotIn('private book text', str(caught.exception))
        self.assertTrue(caught.exception.__suppress_context__)

    def test_installed_sdk_serializes_json_thinking_budget_and_decodes_sse(self):
        requests, clients = [], []
        async def handler(request):
            requests.append(json.loads(request.content))
            chunks = [
                {'id': 'fake', 'object': 'chat.completion.chunk', 'created': 1, 'model': 'test-model', 'choices': [{'index': 0, 'delta': {'content': '{"nodes":[]}'}, 'finish_reason': None}]},
                {'id': 'fake', 'object': 'chat.completion.chunk', 'created': 1, 'model': 'test-model', 'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}], 'usage': {'prompt_tokens': 42, 'completion_tokens': 8, 'total_tokens': 50}},
            ]
            body = ''.join('data: ' + json.dumps(chunk) + '\n\n' for chunk in chunks) + 'data: [DONE]\n\n'
            return httpx.Response(200, headers={'content-type': 'text/event-stream'}, content=body)
        def factory(**options):
            client = AsyncOpenAI(**options, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
            clients.append(client)
            return client
        events = []
        with patch('utils.bounded_completion.AsyncOpenAI', side_effect=factory), observe_ai(lambda kind, title, level, details: events.append((kind, details))):
            result = complete({**CONFIG, 'provider_type': 'DeepSeek'}, 'Return JSON', json_output=True, max_tokens=6000, extra_body={'thinking': {'type': 'disabled'}})
        self.assertEqual(result, '{"nodes":[]}')
        self.assertEqual(requests[0]['thinking'], {'type': 'disabled'})
        self.assertEqual(requests[0]['max_tokens'], 6000)
        self.assertEqual(requests[0]['response_format'], {'type': 'json_object'})
        self.assertEqual([d['completion_tokens'] for k, d in events if k == 'model_usage'], [8])
        self.assertTrue(clients[0].is_closed())

    def test_truncated_or_incomplete_stream_is_never_returned_even_if_json_parses(self):
        for finish, error in (('length', AIOutputTruncated), (None, AIStreamIncomplete)):
            stream = FakeStream('{}', finish=finish)
            with self.assertRaises(error):
                self.call(lambda _: stream)
            self.assertTrue(stream.closed)
            self.assertNotIn('model_response', [kind for kind, _ in self.events])


class ExtractionRepairTests(SimpleTestCase):
    chapter = SimpleNamespace(id='chapter', book_id='book', title='第一章', ordinal=1, locator={'format': 'txt', 'offset': 10})

    def test_schema_example_has_no_dangling_references(self):
        ids = {node['id'] for node in SCHEMA['nodes']}
        self.assertTrue(all(edge['source'] in ids and edge['target'] in ids for edge in SCHEMA['edges']))

    def test_syntax_repair_receives_actual_invalid_output(self):
        invalid = '{"nodes":[], "summary":"错引号" "edges":[]}'
        valid = json.dumps({'nodes': [], 'edges': [], 'summary': '正文摘要'})
        with patch('book_analysis.extraction.AIService.chat_completion', side_effect=[invalid, valid]) as model:
            extract_segment('这是可验证的正文内容。', self.chapter, 0, 'story', [])
        self.assertIn(invalid, model.call_args_list[1].args[0])
        self.assertIn('<invalid_output>', model.call_args_list[1].args[0])
        self.assertTrue(model.call_args_list[0].kwargs['bounded'])
        self.assertTrue(model.call_args_list[0].kwargs['json_output'])

    def test_output_limit_splits_all_text_and_preserves_source_offsets(self):
        text = '林雨收到信。' * 130 + '尾部独有事实。'
        seen = []
        def responder(prompt, **kwargs):
            body = prompt.split('<book_text>\n', 1)[1].split('\n</book_text>', 1)[0]
            seen.append(body)
            if len(seen) == 1:
                raise AIOutputTruncated('fixture output limit')
            return json.dumps({'nodes': [{'id': 'event', 'kind': 'event', 'name': '收到信', 'quote': body[-7:]}], 'summary': body[-7:]}, ensure_ascii=False)
        with patch('book_analysis.extraction.AIService.chat_completion', side_effect=responder):
            result = extract_segment(text, self.chapter, 20, 'story', [])
        self.assertEqual(''.join(seen[1:]), text)
        self.assertIn('尾部独有事实。', result['summary'])
        positions = [node['evidence']['locator']['offset'] for node in result['nodes']]
        self.assertEqual(positions[-1], 10 + 20 + len(text) - 7)

    def test_evidence_with_collapsed_whitespace_uses_exact_source_slice(self):
        from book_analysis.extraction import evidence_for
        text = '桐原洋介走进银行，\n    随后看见柜台旁的人。'
        evidence = evidence_for('桐原洋介走进银行， 随后看见柜台旁的人。', text, self.chapter, 0)
        self.assertEqual(evidence['quote'], text)
        self.assertEqual(evidence['locator']['offset'], 10)

    def test_repeated_evidence_failure_splits_segment_instead_of_failing_run(self):
        text = ('桐原洋介走进银行，随后看见柜台旁的人。\n' * 100)
        full_attempts = 0
        seen_parts = []
        def responder(prompt, **kwargs):
            nonlocal full_attempts
            body = prompt.split('<book_text>\n', 1)[1].split('\n</book_text>', 1)[0]
            if body == text:
                full_attempts += 1
                return json.dumps({'nodes': [{'id': 'n1', 'kind': 'person', 'name': '桐原洋介', 'quote': '原文不存在的改写证据'}], 'edges': [], 'summary': ''}, ensure_ascii=False)
            seen_parts.append(body)
            quote = body[:body.find('。') + 1]
            return json.dumps({'nodes': [{'id': 'n1', 'kind': 'person', 'name': '桐原洋介', 'quote': quote}], 'edges': [], 'summary': quote}, ensure_ascii=False)
        with patch('book_analysis.extraction.AIService.chat_completion', side_effect=responder):
            result = extract_segment(text, self.chapter, 0, 'story', [])
        self.assertEqual(full_attempts, 2)
        self.assertEqual(''.join(seen_parts), text)
        self.assertEqual(len(result['nodes']), 2)

    def test_common_story_node_kind_aliases_are_normalized(self):
        from book_analysis.extraction import validate_payload
        text = '桐原洋介拿起了带血的剪刀。'
        payload = {
            'nodes': [
                {'id': 'p1', 'kind': 'character', 'name': '桐原洋介', 'quote': '桐原洋介拿起了带血的剪刀'},
                {'id': 'c1', 'kind': 'object', 'name': '带血的剪刀', 'quote': '带血的剪刀'},
            ],
            'edges': [],
            'summary': '',
        }
        result = validate_payload(payload, text, self.chapter, 0, [])
        self.assertEqual([node['kind'] for node in result['nodes']], ['person', 'clue'])

    def test_repeated_unknown_node_kind_splits_segment(self):
        text = ('桐原洋介走进银行，随后看见柜台旁的人。\n' * 100)
        full_attempts = 0
        def responder(prompt, **kwargs):
            nonlocal full_attempts
            body = prompt.split('<book_text>\n', 1)[1].split('\n</book_text>', 1)[0]
            quote = body[:body.find('。') + 1]
            if body == text:
                full_attempts += 1
                kind = 'organization'
            else:
                kind = 'person'
            return json.dumps({'nodes': [{'id': 'n1', 'kind': kind, 'name': '桐原洋介', 'quote': quote}], 'edges': [], 'summary': quote}, ensure_ascii=False)
        with patch('book_analysis.extraction.AIService.chat_completion', side_effect=responder):
            result = extract_segment(text, self.chapter, 0, 'story', [])
        self.assertEqual(full_attempts, 2)
        self.assertEqual(len(result['nodes']), 2)

    def test_failed_repair_salvages_valid_records(self):
        text = '桐原洋介走进银行，看见柜台旁的人。'
        response = json.dumps({
            'nodes': [
                {'id': 'valid', 'kind': 'person', 'name': '桐原洋介', 'quote': '桐原洋介走进银行'},
                {'id': 'invalid', 'kind': 'person', 'name': '柜台旁的人', 'quote': ''},
            ],
            'attributes': [
                {'node_id': 'valid', 'attribute': 'action', 'value': '走进银行', 'quote': '走进银行', 'attribution': 'narrator'},
                {'node_id': 'invalid', 'attribute': 'action', 'value': '站在柜台旁', 'quote': '', 'attribution': 'narrator'},
            ],
            'edges': [],
            'summary': '柜台旁的人持枪威胁桐原洋介。',
        }, ensure_ascii=False)
        with patch('book_analysis.extraction.AIService.chat_completion', return_value=response) as mocked:
            result = extract_segment(text, self.chapter, 0, 'story', [])
        self.assertEqual(mocked.call_count, 2)
        self.assertEqual([node['name'] for node in result['nodes']], ['桐原洋介'])
        self.assertEqual([fact['value'] for fact in result['attributes']], ['走进银行'])
        self.assertEqual(result['summary'], '')

    def test_short_exact_evidence_is_valid(self):
        from book_analysis.extraction import evidence_for
        evidence = evidence_for('笹垣', '刑警笹垣赶到现场。', self.chapter, 0)
        self.assertEqual(evidence['quote'], '笹垣')

    def test_small_segment_overflow_fails_without_publishing_empty_results(self):
        with patch('book_analysis.extraction.AIService.chat_completion', return_value='{"nodes":[],"overflow":true}'):
            with self.assertRaises(AnalysisError):
                extract_segment('短正文内容。', self.chapter, 0, 'story', [])

    def test_simple_model_only_sends_verified_existing_thinking_flag(self):
        self.assertEqual(thinking_options({'provider_type': 'Qwen'}), {'enable_thinking': False})
        for provider, model in (('MiniMax', 'MiniMax-M3'), ('DeepSeek', 'deepseek-flash')):
            self.assertEqual(thinking_options({'provider_type': provider, 'model_name': model}), {'thinking': {'type': 'disabled'}})
        self.assertEqual(thinking_options({'provider_type': 'MiniMax', 'model_name': 'MiniMax-M2.7'}), {})
        self.assertEqual(thinking_options({'provider_type': 'custom', 'model_name': 'MiniMax-M3'}), {})
