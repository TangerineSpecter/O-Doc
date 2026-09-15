import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from django.test import SimpleTestCase

from utils.ai_observer import observe_ai
from utils.rag_client import RagSyncError
from .embeddings import embed_texts, validate_vectors
from .errors import AnalysisError


class BookEmbeddingTests(SimpleTestCase):
    model = SimpleNamespace(name='qwen3-embedding:4b', provider=SimpleNamespace(name='ollama', base_url='http://fixture.test/v1', api_key='isolated-secret'))

    def transport(self, handler):
        original = httpx.AsyncClient
        return patch('book_analysis.embeddings.httpx.AsyncClient', side_effect=lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(handler)))

    def test_single_string_requests_use_long_index_budget_and_short_query_budget(self):
        requests, events = [], []
        async def handle(request):
            requests.append(json.loads(request.content))
            return httpx.Response(200, json={'data': [{'index': 0, 'embedding': [.1, .2]}]})
        with self.transport(handle), observe_ai(lambda *args: events.append(args)):
            self.assertEqual(embed_texts(['甲\n乙', '丙' * 1500], model=self.model), [[.1, .2], [.1, .2]])
            embed_texts(['问题'], model=self.model, purpose='query')
        self.assertEqual([r['input'] for r in requests], ['甲 乙', '丙' * 1500, '问题'])
        starts = [e[3] for e in events if e[0] == 'model_request_started']
        self.assertEqual([e['timeout_seconds'] for e in starts], [180, 180, 30])
        self.assertEqual([e['chars'] for e in starts], [3, 1500, 2])
        self.assertEqual(starts[-1]['phase'], 'retrieve')
        self.assertNotIn('isolated-secret', str(events))

    def test_hard_timeout_closes_request_without_retry(self):
        closed, calls = [], []
        async def handle(request):
            calls.append(request)
            try:
                await asyncio.sleep(5)
            finally:
                closed.append(True)
        started = time.monotonic()
        with self.transport(handle), patch('book_analysis.embeddings.INDEX_TIMEOUT', .12):
            with self.assertRaisesRegex(TimeoutError, '超时|硬时限'):
                embed_texts(['正文'], model=self.model)
        self.assertLess(time.monotonic() - started, 1)
        self.assertEqual(len(calls), 1)
        self.assertTrue(closed)

    def test_stop_cancels_network_and_does_not_start_next_document(self):
        calls, closed = [], []
        async def handle(request):
            calls.append(request)
            try:
                await asyncio.sleep(5)
            finally:
                closed.append(True)
        def check():
            if calls:
                raise AnalysisError('用户停止', 499)
        with self.transport(handle), observe_ai(lambda *args: None, check_cancel=check):
            with self.assertRaises(AnalysisError) as caught:
                embed_texts(['正文1', '正文2'], model=self.model)
        self.assertEqual(caught.exception.status, 499)
        self.assertEqual(len(calls), 1)
        self.assertTrue(closed)

    def test_provider_error_body_is_not_exposed(self):
        async def handle(request):
            return httpx.Response(401, json={'error': 'isolated-secret'})
        with self.transport(handle):
            with self.assertRaisesRegex(RagSyncError, 'HTTP 401') as caught:
                embed_texts(['正文'], model=self.model)
        self.assertNotIn('isolated-secret', str(caught.exception))

    def test_vectors_reject_duplicate_index_invalid_number_and_dimension(self):
        for data in (
            {'data': [{'index': 0, 'embedding': [1]}, {'index': 0, 'embedding': [2]}]},
            {'data': [{'index': 0, 'embedding': [float('nan')]}]},
            {'data': [{'index': 0, 'embedding': [True]}]},
            {'data': [{'index': 0, 'embedding': []}]},
            {'data': [{'index': 0, 'embedding': [1]}, {'index': 1, 'embedding': [1, 2]}]},
        ):
            with self.subTest(data=data), self.assertRaises(RagSyncError):
                validate_vectors(data, len(data['data']))
