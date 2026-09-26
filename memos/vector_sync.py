"""便签索引在提交后串行更新，外部 embedding 请求不阻塞保存接口。"""
import logging
from concurrent.futures import ThreadPoolExecutor

from django.db import close_old_connections, transaction

from memos.models import Memo
from utils.rag_client import RagClient

logger = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='memo-vector-sync')


def _sync_memo(memo_id: str) -> None:
    close_old_connections()
    try:
        # 排队时可能被编辑或删除，执行时读取最新的有效记录。
        memo = Memo.objects.filter(memo_id=memo_id, is_valid=True).first()
        if memo is not None:
            RagClient.add_memo(memo)
    except Exception:
        logger.exception('Failed to synchronize memo vector: memo_id=%s', memo_id)
    finally:
        close_old_connections()


def schedule_memo_vector_sync(memo_id: str) -> None:
    def enqueue():
        try:
            _executor.submit(_sync_memo, memo_id)
        except Exception:
            # 向量属于可重建索引，排队失败不能改变已落库内容的保存结果。
            logger.exception('Failed to enqueue memo vector synchronization: memo_id=%s', memo_id)

    transaction.on_commit(enqueue)
