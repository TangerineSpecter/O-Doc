"""恢复回归使用隔离数据库、临时 Chroma 和假的 Embedding HTTP 响应。"""
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

import chromadb
from chromadb.config import Settings
from django.conf import settings
from django.test import TestCase

from anthology.models import Anthology
from article.models import Article
from memos.models import Memo
from system_settings.embedding_recovery import _refresh_article_vectors_unlocked, _refresh_memo_vectors
from utils.rag_client import RagClient


def embedding_model(name):
    return SimpleNamespace(
        pk=name, name=name,
        provider=SimpleNamespace(pk='test-provider', base_url='https://embedding.invalid/v1', api_key='test-key'),
    )


class EmbeddingRecoveryTests(TestCase):
    def setUp(self):
        self.assertEqual(settings.DATABASES['default']['ENGINE'], 'django.db.backends.sqlite3')
        self.assertIn('memory', str(settings.DATABASES['default']['NAME']))
        self.temp = TemporaryDirectory(prefix='odoc-recovery-regression-')
        self.addCleanup(self.temp.cleanup)
        chroma_path = Path(self.temp.name) / 'chroma'
        self.assertTrue(chroma_path.resolve().is_relative_to(Path(self.temp.name).resolve()))
        client = chromadb.PersistentClient(path=str(chroma_path), settings=Settings(anonymized_telemetry=False))
        client_patch = patch.object(RagClient, 'get_client', return_value=client)
        self.model_patch = patch.object(RagClient, 'get_embedding_model', return_value=embedding_model('two-dim'))
        self.http_patch = patch('utils.rag_client.requests.post', side_effect=self.embedding_response)
        client_patch.start()
        self.model = self.model_patch.start()
        self.http = self.http_patch.start()
        self.addCleanup(client_patch.stop)
        self.addCleanup(self.model_patch.stop)
        self.addCleanup(self.http_patch.stop)
        self.anthology = Anthology.objects.create(coll_id='test-recovery', title='恢复测试', user_id='owner')
        self.article = Article.objects.create(
            article_id='recovery-article', title='文章', content='旧正文', coll_id=self.anthology.pk, author='owner',
        )
        self.memo = Memo.objects.create(content='闪念内容', user_id='owner')

    @staticmethod
    def embedding_response(_url, *, json, **_kwargs):
        vector = [1.0, 0.0, 0.0] if json['model'] == 'three-dim' else [1.0, 0.0]
        return SimpleNamespace(status_code=200, json=lambda: {'data': [{'embedding': vector}]})

    def test_model_dimension_switch_rebuilds_articles_and_memos_and_is_idempotent(self):
        self.assertEqual(_refresh_article_vectors_unlocked(5)['indexed'], 1)
        self.assertEqual(_refresh_memo_vectors(5)['indexed'], 1)
        old_articles = RagClient.get_collection()
        old_memos = RagClient.get_memo_collection()
        self.model.return_value = embedding_model('three-dim')
        self.assertEqual(_refresh_article_vectors_unlocked(5)['indexed'], 1)
        self.assertEqual(_refresh_memo_vectors(5)['indexed'], 1)
        for old, current in ((old_articles, RagClient.get_collection()), (old_memos, RagClient.get_memo_collection())):
            self.assertNotEqual(old.name, current.name)
            self.assertEqual(len(old.get(include=['embeddings'])['embeddings'][0]), 2)
            self.assertEqual(len(current.get(include=['embeddings'])['embeddings'][0]), 3)
        documents, sources = RagClient.search_with_sources('查询')
        self.assertEqual(documents, ['旧正文'])
        self.assertEqual(sources[0]['id'], self.article.pk)
        self.http.reset_mock()
        self.assertEqual(_refresh_article_vectors_unlocked(5)['indexed'], 0)
        self.assertEqual(_refresh_memo_vectors(5)['indexed'], 0)
        self.http.assert_not_called()

    def test_same_dimension_models_still_use_different_vector_spaces(self):
        previous = RagClient.get_collection()
        self.model.return_value = embedding_model('another-two-dim')
        self.assertNotEqual(previous.name, RagClient.get_collection().name)
        self.assertEqual(RagClient.get_collection('domain-specific').name, 'domain-specific')

    def test_inflight_model_switch_keeps_embeddings_and_collection_consistent(self):
        previous = RagClient.get_collection()
        def switch_model(url, **kwargs):
            self.model.return_value = embedding_model('three-dim')
            return self.embedding_response(url, **kwargs)
        self.http.side_effect = switch_model
        RagClient.add_article(self.article.pk, self.article.title, self.article.content, self.article.coll_id)
        self.assertEqual(len(previous.get(include=['embeddings'])['embeddings'][0]), 2)
        self.assertEqual(RagClient.get_collection().count(), 0)

    def test_deleted_during_embedding_does_not_leave_vectors(self):
        def delete_article(url, **kwargs):
            Article.objects.filter(pk=self.article.pk).update(is_valid=False)
            RagClient.delete_article(self.article.pk)
            return self.embedding_response(url, **kwargs)
        self.http.side_effect = delete_article
        self.assertEqual(_refresh_article_vectors_unlocked(5), {'indexed': 0, 'failed': 0, 'pending': 0})
        self.assertEqual(RagClient.get_collection().count(), 0)
        self.article.refresh_from_db()
        self.assertFalse(self.article.is_rag_synced)

    def test_edit_during_embedding_removes_stale_vectors_then_retries(self):
        def edit_article(url, **kwargs):
            Article.objects.filter(pk=self.article.pk).update(content='新正文', is_rag_synced=False)
            return self.embedding_response(url, **kwargs)
        self.http.side_effect = edit_article
        self.assertEqual(_refresh_article_vectors_unlocked(5), {'indexed': 0, 'failed': 0, 'pending': 1})
        self.assertEqual(RagClient.get_collection().count(), 0)
        self.http.side_effect = self.embedding_response
        self.assertEqual(_refresh_article_vectors_unlocked(5)['indexed'], 1)
        self.assertEqual(RagClient.get_collection().get()['documents'], ['新正文'])

    def test_stale_cleanup_preserves_a_concurrently_replaced_vector(self):
        original_add = RagClient.add_article
        def replace_article(*args, **kwargs):
            original_add(*args, **kwargs)
            Article.objects.filter(pk=self.article.pk).update(content='更新版本', is_rag_synced=False)
            original_add(self.article.pk, self.article.title, '更新版本', self.article.coll_id)
        with patch.object(RagClient, 'add_article', side_effect=replace_article):
            self.assertEqual(_refresh_article_vectors_unlocked(5)['indexed'], 0)
        self.assertEqual(RagClient.get_collection().get()['documents'], ['更新版本'])

    def test_each_successful_batch_refreshes_anthology_stats(self):
        Article.objects.create(article_id='second-article', title='第二篇', content='正文', coll_id=self.anthology.pk, author='owner')
        self.anthology.update_stats()
        self.assertEqual(self.anthology.rag_not_synced_count, 2)
        self.assertEqual(_refresh_article_vectors_unlocked(1), {'indexed': 1, 'failed': 0, 'pending': 1})
        self.anthology.refresh_from_db()
        self.assertEqual(self.anthology.rag_not_synced_count, 1)
        self.assertEqual(_refresh_article_vectors_unlocked(1), {'indexed': 1, 'failed': 0, 'pending': 0})
        self.anthology.refresh_from_db()
        self.assertEqual(self.anthology.rag_not_synced_count, 0)

    def test_embedding_failure_preserves_old_vectors_and_pending_flag(self):
        RagClient.add_article(self.article.pk, self.article.title, self.article.content, self.article.coll_id)
        self.anthology.update_stats()
        self.http.return_value = SimpleNamespace(status_code=503, text='fake failure')
        self.http.side_effect = None
        with self.assertLogs('system_settings.embedding_recovery', level='ERROR'):
            result = _refresh_article_vectors_unlocked(5)
        self.assertEqual(result, {'indexed': 0, 'failed': 1, 'pending': 1})
        self.assertEqual(RagClient.get_collection().get()['documents'], ['旧正文'])
        self.article.refresh_from_db()
        self.assertFalse(self.article.is_rag_synced)
        self.anthology.refresh_from_db()
        self.assertEqual(self.anthology.rag_not_synced_count, 1)

    def test_rebuilding_previously_synced_article_repairs_stale_stats(self):
        Article.objects.filter(pk=self.article.pk).update(is_rag_synced=True)
        Anthology.objects.filter(pk=self.anthology.pk).update(rag_not_synced_count=1)
        self.assertEqual(_refresh_article_vectors_unlocked(5)['indexed'], 1)
        self.anthology.refresh_from_db()
        self.assertEqual(self.anthology.rag_not_synced_count, 0)

    def test_deletion_cleans_all_model_generations_and_legacy_only(self):
        generations = []
        for model_name in ('two-dim', 'three-dim'):
            self.model.return_value = embedding_model(model_name)
            RagClient.add_article(self.article.pk, self.article.title, self.article.content, self.article.coll_id)
            RagClient.add_memo(self.memo, strict=True)
            generations.extend([RagClient.get_collection(), RagClient.get_memo_collection()])
        legacy_article = RagClient.get_collection(model_signature='')
        legacy_article.add(ids=['legacy-article'], embeddings=[[1.0, 0.0]], metadatas=[{'article_id': self.article.pk}])
        legacy_memo = RagClient.get_memo_collection(model_signature='')
        legacy_memo.add(ids=[str(self.memo.pk)], embeddings=[[1.0, 0.0]])
        unrelated = RagClient.get_collection('domain-specific')
        unrelated.add(ids=['keep'], embeddings=[[1.0, 0.0]])
        RagClient.delete_article(self.article.pk)
        RagClient.delete_memo(self.memo.pk)
        for collection in [*generations, legacy_article, legacy_memo]:
            self.assertEqual(collection.count(), 0)
        self.assertEqual(unrelated.count(), 1)
