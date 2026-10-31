"""Owner-scoped, explicitly requested hybrid retrieval. No live embeddings."""
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from quant import test_graph as fixtures
from quant.models import FactorVector, FactorIndexJob, FactorRelation
from quant.graph.projection import projection
from quant.factors.curation import revise_candidate
from utils.rag_client import RagClient
from utils.token_usage import usage_context
from quant.retrieval.ranking import lexical


class RetrievalTests(TestCase):
    setUp = fixtures.GraphTests.setUp
    collect = fixtures.GraphTests.collect
    publish = fixtures.GraphTests.publish
    configure = fixtures.GraphTests.configure

    def search(self, **data):
        return self.client.post(f'/api/quant/{self.collection.pk}/factors/search/', {'q': '收缩突破', **data}, format='json')

    def vector(self, candidate, model, values):
        FactorVector.objects.create(candidate=candidate, projection_hash=projection(candidate)[1],
            model_signature=RagClient.embedding_model_signature(model), model_name=model.name, vector=values)

    def test_keyword_fallback_formula_alias_filters_and_validation_without_paid_calls(self):
        first = self.publish('retrieval_text_00001', name='收缩突破')
        self.publish('retrieval_text_00002', name='另一个指标', window='50')
        with patch('quant.retrieval.service.embed_texts') as embed:
            result = self.search().json()['data']
            self.assertEqual(result['search']['semanticStatus'], 'no_model')
            self.assertEqual(result['items'][0]['id'], first.pk)
            self.assertIn('名称', result['items'][0]['searchMatch']['keywordFields'])
            self.assertIsNone(result['items'][0]['searchMatch']['semanticSimilarity'])
            self.assertEqual(self.search(q='完全没有的东西').data['data']['total'], 0)
            self.assertEqual(self.search(q='').status_code, 400)
            self.assertEqual(self.search(q='x' * 201).status_code, 400)
            self.assertEqual(self.search(role='display').data['data']['total'], 0)
            embed.assert_not_called()
        self.assertGreater(self.client.get(f'/api/quant/{self.collection.pk}/factors/', {'q': 'close'}).data['data']['total'], 0)
        score, fields = lexical('close', {'curation': {'name':'x','tags':[],'aliases':[],'note':''}, 'data': {'name':'x','summary':'x','formula':'close / lag(close, N)', 'expression':None}, 'entry_title':'x'})
        self.assertGreater(score, 0); self.assertEqual(fields, ['公式或表达式'])
        data = {'name': '另名', 'family': first.data['family'], 'tags': [], 'aliases': ['收缩突破'], 'note': ''}
        revise_candidate(first, data, '', '')
        self.assertIn('标签或别名', self.search().json()['data']['items'][0]['searchMatch']['keywordFields'])

    def test_semantic_only_recall_fusion_and_no_business_side_effects(self):
        model = self.configure()
        word = self.publish('retrieval_vector001', name='收缩突破')
        concept = self.publish('retrieval_vector002', name='其他计算', window='50')
        self.vector(word, model, [1, 0]); self.vector(concept, model, [.8, .6])
        def embed(texts, **options):
            self.assertEqual(texts, ['收缩突破'])
            self.assertEqual(options['timeout_seconds'], 30)
            self.assertEqual(usage_context()['owner_key'], str(self.collection.user_id))
            return [[1, 0]]
        with patch('quant.retrieval.service.embed_texts', side_effect=embed) as call:
            result = self.search().json()['data']
        self.assertEqual(call.call_count, 1)
        self.assertEqual([row['id'] for row in result['items']], [word.pk, concept.pk])
        self.assertEqual(result['items'][1]['searchMatch']['keywordFields'], [])
        self.assertEqual(result['items'][1]['searchMatch']['semanticSimilarity'], .8)
        self.assertEqual(result['search']['indexedTotal'], 2)
        self.assertFalse(FactorIndexJob.objects.exists()); self.assertFalse(FactorRelation.objects.exists())

    def test_stale_index_and_failure_leave_keyword_results_and_explain_coverage(self):
        model = self.configure(); row = self.publish('retrieval_stale0001', name='收缩突破')
        self.vector(row, model, [1, 0])
        with patch('quant.retrieval.service.embed_texts', side_effect=TimeoutError('secret provider body')):
            result = self.search().json()['data']
        self.assertEqual(result['total'], 1); self.assertEqual(result['search']['semanticStatus'], 'unavailable')
        self.assertNotIn('secret', str(result))
        FactorVector.objects.update(projection_hash='stale')
        with patch('quant.retrieval.service.embed_texts') as embed:
            self.assertEqual(self.search().json()['data']['search']['semanticStatus'], 'no_index')
            embed.assert_not_called()

    def test_deletion_revision_or_model_change_during_query_is_rechecked(self):
        model = self.configure(); row = self.publish('retrieval_change001', name='收缩突破')
        self.vector(row, model, [1, 0])
        def change(*args, **kwargs):
            row.report.entry.is_valid = False; row.report.entry.save(update_fields=['is_valid'])
            return [[1, 0]]
        with patch('quant.retrieval.service.embed_texts', side_effect=change):
            self.assertEqual(self.search().data['data']['total'], 0)
        row.report.entry.is_valid = True; row.report.entry.save(update_fields=['is_valid'])
        def edit(*args, **kwargs):
            revise_candidate(row, {'name': '新名称', 'family': row.data['family'], 'tags': [], 'aliases': [], 'note': ''}, '', '')
            return [[1, 0]]
        with patch('quant.retrieval.service.embed_texts', side_effect=edit):
            result = self.search().json()['data']
        self.assertEqual(result['search']['semanticStatus'], 'no_compatible_index')
        self.assertEqual(result['items'][0]['curation']['name'], '新名称')
        row.refresh_from_db()
        FactorVector.objects.filter(candidate=row).update(projection_hash=projection(row)[1])
        def model_change(*args, **kwargs):
            model.name = 'changed'; model.save(update_fields=['name'])
            return [[1, 0]]
        with patch('quant.retrieval.service.embed_texts', side_effect=model_change):
            result = self.search().json()['data']
        self.assertEqual(result['search']['semanticStatus'], 'model_changed')
        self.assertIsNone(result['items'][0]['searchMatch']['semanticSimilarity'])

    def test_foreign_owner_and_ownership_revocation_cannot_leak_results(self):
        model = self.configure(); row = self.publish('retrieval_owner0001', name='收缩突破')
        self.vector(row, model, [1, 0])
        stranger = get_user_model().objects.create_user('search-stranger')
        self.client.force_authenticate(stranger)
        with patch('quant.retrieval.service.embed_texts') as embed:
            self.assertIn(self.search().status_code, (403, 404)); embed.assert_not_called()
        self.client.force_authenticate(self.user)
        def revoke(*args, **kwargs):
            self.collection.is_valid = False; self.collection.save(update_fields=['is_valid'])
            return [[1, 0]]
        with patch('quant.retrieval.service.embed_texts', side_effect=revoke):
            self.assertEqual(self.search().status_code, 404)


    def test_grouping_and_other_collection_vectors_do_not_change_scope(self):
        from anthology.models import Anthology
        from quant.models import Entry
        model = self.configure()
        first = self.publish('retrieval_group0001', name='收缩突破')
        second = self.publish('retrieval_group0002', name='收缩突破')
        outsider = self.publish('retrieval_group0003', name='收缩突破', window='50')
        foreign = Anthology.objects.create(type='quant', permission='private', title='Other', user_id='another-owner')
        Entry.objects.filter(pk=outsider.report.entry_id).update(anthology=foreign)
        for candidate in (first, second, outsider): self.vector(candidate, model, [1, 0])
        with patch('quant.retrieval.service.embed_texts', return_value=[[1, 0]]):
            result = self.search(group_by='expression').json()['data']
        self.assertEqual(result['search']['candidateTotal'], 2)
        self.assertEqual(result['search']['indexedTotal'], 2)
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['items'][0]['occurrenceCount'], 2)
        self.assertNotEqual(result['items'][0]['id'], outsider.pk)
