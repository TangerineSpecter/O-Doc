from unittest.mock import patch

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from memos.models import Memo
from memos.vector_sync import _sync_memo


class MemoVectorSyncTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user(username='memo-reader'))

    def test_save_returns_without_calling_embedding(self):
        with patch('memos.vector_sync._executor.submit') as submit, patch('memos.vector_sync.RagClient.add_memo') as embed:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post('/api/memo/create', {'content': '选中的正文'}, format='json')
                self.assertEqual(response.status_code, 200)
                memo = Memo.objects.get(content='选中的正文')
                submit.assert_not_called()
            submit.assert_called_once_with(_sync_memo, str(memo.memo_id))
            embed.assert_not_called()

    def test_update_and_enqueue_failure_keep_saved_content(self):
        # 通过创建接口获得当前用户归属，再验证编辑走同一后台入口。
        with patch('memos.vector_sync._executor.submit'):
            with self.captureOnCommitCallbacks(execute=True):
                self.client.post('/api/memo/create', {'content': '待编辑'}, format='json')
        owned = Memo.objects.get(content='待编辑')
        with patch('memos.vector_sync._executor.submit', side_effect=RuntimeError('queue unavailable')):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.put(f'/api/memo/update/{owned.memo_id}', {'content': '已编辑'}, format='json')
        self.assertEqual(response.status_code, 200)
        owned.refresh_from_db()
        self.assertEqual(owned.content, '已编辑')

    def test_worker_reads_latest_and_skips_deleted_memo(self):
        memo = Memo.objects.create(content='最新内容', user_id='admin')
        with patch('memos.vector_sync.RagClient.add_memo') as embed:
            _sync_memo(str(memo.memo_id))
            self.assertEqual(embed.call_args.args[0].content, '最新内容')
            memo.is_valid = False
            memo.save()
            embed.reset_mock()
            _sync_memo(str(memo.memo_id))
            embed.assert_not_called()

    def test_delete_during_embedding_cannot_reinsert_vector(self):
        memo = Memo.objects.create(content='待删除', user_id='admin')
        def embed_then_delete(_texts):
            Memo.objects.filter(pk=memo.pk).update(is_valid=False)
            return [[0.1, 0.2]]
        with patch('utils.rag_client.RagClient.create_embeddings', side_effect=embed_then_delete), \
                patch('utils.rag_client.RagClient.get_memo_collection') as collection:
            from utils.rag_client import RagClient
            self.assertEqual(RagClient.add_memo(memo), 0)
            collection.assert_not_called()

    def test_delete_between_validation_and_upsert_is_cleaned(self):
        memo = Memo.objects.create(content='待删除', user_id='admin')
        with patch('utils.rag_client.RagClient.create_embeddings', return_value=[[0.1, 0.2]]), \
                patch('utils.rag_client.RagClient.get_memo_collection') as collection:
            def upsert_after_delete(**_kwargs):
                Memo.objects.filter(pk=memo.pk).update(is_valid=False)
            collection.return_value.upsert.side_effect = upsert_after_delete
            from utils.rag_client import RagClient
            self.assertEqual(RagClient.add_memo(memo), 0)
            collection.return_value.delete.assert_called_once_with(ids=[str(memo.memo_id)])
