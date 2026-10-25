"""Graph provenance, bounded index execution and sync boundaries; no live network."""
import copy
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from quant import test_factor_curation as curation_fixtures
from quant.models import FactorVector, FactorRelation, FactorIndexJob
from quant.graph.indexing import queue_index, index_status, auto_index
from quant.graph.projection import cosine, projection
from quant.graph.worker import execute
from quant.sync import metadata, validate
from system_settings.models import AIModel, SystemSetting
from utils.sync_manager import SyncManager, SyncError


class GraphTests(TestCase):
    setUp = curation_fixtures.CurationTests.setUp
    collect = curation_fixtures.CurationTests.collect
    publish = curation_fixtures.CurationTests.publish

    def configure(self):
        model = AIModel.objects.create(provider=self.model.provider, name='fixture-embedding', type='embedding')
        config = SystemSetting.objects.get(key='system_ai_config')
        config.value['defaultEmbeddingModelId'] = model.pk
        config.save()
        return model

    def run_job(self, job, vectors=None):
        with patch('quant.graph.worker.embed_texts', side_effect=vectors or [[[1., .1]]] * 10) as mock:
            execute(job.pk)
        job.refresh_from_db()
        return mock

    def test_no_model_still_shows_provenance_and_exact_edges(self):
        first = self.publish('graph_exact_0000001')
        self.publish('graph_exact_0000002')
        url = f'/api/quant/{self.collection.pk}/graph/'
        data = self.client.get(url, {'candidateId': first.pk}).json()['data']
        self.assertEqual(data['focusId'], first.pk)
        self.assertFalse(data['index']['configured'])
        self.assertEqual({row['kind'] for row in data['edges']}, {'analyzed_from', 'extracted_from', 'same_expression'})
        self.assertEqual(self.client.post(url + 'index/').status_code, 400)
        self.assertFalse(FactorIndexJob.objects.exists())
        self.client.force_authenticate(get_user_model().objects.create_user('graph-stranger'))
        self.assertIn(self.client.get(url).status_code, (403, 404))

    def test_index_build_reuse_and_semantic_evidence_survives_restore(self):
        self.configure()
        first = self.publish('graph_vector_000001', window='20')
        self.publish('graph_vector_000002', window='50')
        job = queue_index(self.collection)
        self.assertIsNone(queue_index(self.collection))  # No overlapping paid work.
        mock = self.run_job(job)
        self.assertEqual(job.status, 'completed', job.error)
        self.assertEqual(mock.call_count, 2)
        self.assertEqual(index_status(self.collection)['ready'], 2)
        self.assertIsNone(queue_index(self.collection))
        self.assertEqual(FactorRelation.objects.count(), 1)
        graph = self.client.get(f'/api/quant/{self.collection.pk}/graph/', {'candidateId': first.pk}).json()['data']
        self.assertFalse(next(edge for edge in graph['edges'] if edge['kind'] == 'semantic_similar')['historical'])
        snapshot = SyncManager().build_snapshot_data()
        self.assertFalse(any(row['model'] in ('quant.factorvector', 'quant.factorindexjob') for row in snapshot))
        validate(snapshot, metadata(snapshot))
        altered = copy.deepcopy(snapshot)
        relation = next(row for row in altered if row['model'] == 'quant.factorrelation')
        relation['fields']['evidence']['left_projection_hash'] = 'bad'
        with self.assertRaises(SyncError):
            validate(altered, metadata(altered))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(FactorVector.objects.exists())
        self.assertFalse(FactorIndexJob.objects.exists())
        self.assertEqual(FactorRelation.objects.count(), 1)

    def test_cancel_during_response_cannot_write_vectors(self):
        self.configure()
        self.publish('graph_cancel_000001')
        job = queue_index(self.collection)
        def response(*args, **kwargs):
            response = self.client.post(f'/api/quant/{self.collection.pk}/graph/index/{job.pk}/cancel/')
            self.assertEqual(response.status_code, 200)
            return [[1., .1]]
        with patch('quant.graph.worker.embed_texts', side_effect=response):
            execute(job.pk)
        job.refresh_from_db()
        self.assertEqual(job.status, 'cancelled')
        self.assertEqual(self.client.get(f'/api/quant/{self.collection.pk}/graph/index/{job.pk}/cancel/').status_code, 405)
        self.assertFalse(FactorVector.objects.exists())

    def test_model_change_and_expired_lease_prevent_requests(self):
        model = self.configure()
        self.publish('graph_model_000001')
        job = queue_index(self.collection)
        model.name = 'new-model'; model.save()
        mock = self.run_job(job)
        self.assertEqual(mock.call_count, 0)
        self.assertEqual(job.status, 'failed')
        job = queue_index(self.collection)
        job.lease_until = timezone.now() - timedelta(seconds=1); job.save()
        mock = self.run_job(job)
        self.assertEqual(mock.call_count, 0)
        self.assertEqual(job.status, 'interrupted')

    def test_revision_invalidates_index_and_marks_relation_historical(self):
        self.configure()
        first = self.publish('graph_edit_0000001', window='20')
        self.publish('graph_edit_0000002', window='50')
        self.run_job(queue_index(self.collection))
        old = projection(first)[1]
        changed = {'name': '新的说明', 'family': 'momentum', 'tags': ['窗口'], 'aliases': [], 'note': '重新解释用途'}
        result = self.client.patch(f'/api/quant/{self.collection.pk}/factors/{first.pk}/', {'data': changed, 'expectedRevisionId': ''}, format='json')
        self.assertEqual(result.status_code, 200)
        first.refresh_from_db()
        self.assertNotEqual(projection(first)[1], old)
        self.assertEqual(index_status(self.collection)['missing'], 1)
        graph = self.client.get(f'/api/quant/{self.collection.pk}/graph/', {'candidateId': first.pk}).json()['data']
        self.assertTrue(next(edge for edge in graph['edges'] if edge['kind'] == 'semantic_similar')['historical'])
        auto_index(first.report_id)
        self.assertEqual(FactorIndexJob.objects.filter(status='pending').count(), 1)
        self.run_job(FactorIndexJob.objects.get(status='pending'))
        self.assertEqual(index_status(self.collection)['ready'], 2)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_invalid_vector_fails_and_retains_existing_cache(self):
        self.configure()
        self.publish('graph_invalid_0001')
        job = queue_index(self.collection)
        self.run_job(job, [[[0., 0.]]])
        self.assertEqual(job.status, 'failed')
        self.assertFalse(FactorVector.objects.exists())
        for value in ([float('nan')], [float('inf')], [True], [], [0], [1] * 8193):
            self.assertIsNone(cosine(value, value))
        self.assertIsNone(cosine([1], [1, 2]))
        self.assertAlmostEqual(cosine([1, 0], [1, 1]), 2 ** -.5)

    def test_auto_index_on_commit_under_existing_collection_lock(self):
        from quant.locking import collection_lock
        self.configure()
        with collection_lock(self.collection.pk), self.captureOnCommitCallbacks(execute=True):
            self.publish('graph_auto_00000001')
        self.assertEqual(FactorIndexJob.objects.count(), 1)
        self.assertEqual(FactorIndexJob.objects.get().status, 'pending')
        # Read endpoints only expose state, never authorize another job.
        self.client.get(f'/api/quant/{self.collection.pk}/graph/')
        self.assertEqual(FactorIndexJob.objects.count(), 1)

    def test_changed_input_during_request_discards_stale_vector(self):
        self.configure()
        candidate = self.publish('graph_stale_0000001')
        job = queue_index(self.collection)
        def response(*args, **kwargs):
            changed = {'name': '新投影', 'family': 'trend', 'tags': [], 'aliases': [], 'note': ''}
            saved = self.client.patch(f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/', {'data': changed, 'expected_revision_id': ''}, format='json')
            self.assertEqual(saved.status_code, 200)
            return [[1., .1]]
        with patch('quant.graph.worker.embed_texts', side_effect=response):
            execute(job.pk)
        self.assertFalse(FactorVector.objects.exists())
        self.assertEqual(index_status(self.collection)['missing'], 1)

    def test_embedding_transport_records_usage_without_raw_vectors(self):
        import httpx
        from system_settings.token_usage.models import AgentTokenUsage
        self.configure()
        self.publish('graph_transport_0001')
        job = queue_index(self.collection)
        original = httpx.AsyncClient
        async def respond(request):
            return httpx.Response(200, json={'data': [{'index': 0, 'embedding': [1., .1]}], 'usage': {'prompt_tokens': 12, 'total_tokens': 12}})
        with patch('utils.bounded_embeddings.httpx.AsyncClient', side_effect=lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(respond))):
            execute(job.pk)
        job.refresh_from_db()
        self.assertEqual(job.status, 'completed', job.error)
        usage = AgentTokenUsage.objects.get(phase='factor_index')
        self.assertEqual(usage.status, 'success')
        self.assertEqual(usage.input_tokens, 12)
        self.assertEqual(usage.total_tokens, 12)
