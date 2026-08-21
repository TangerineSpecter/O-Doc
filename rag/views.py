import logging

from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from anthology.models import Anthology
from article.models import Article  # 假设你的文章模型在这里
from utils.rag_client import RagClient, RagSyncError
from utils.response_utils import success_result, error_result, valid_result


logger = logging.getLogger(__name__)


class SyncArticleView(APIView):
    """同步文章到知识库"""

    # 根据你的需求设置权限
    # permission_classes = [IsAuthenticatedOrReadOnly]

    def post(self, request):
        article_id = request.data.get('article_id')
        if not article_id:
            return Response({'error': 'Article ID is required'}, status=400)

        try:
            article = Article.objects.get(article_id=article_id)
            # 调用 RagClient 进行处理
            chunk_count = RagClient.add_article(
                article_id=article.article_id,
                title=article.title,
                content=article.content,
                coll_id=article.coll_id
            )

            # --- 更新同步状态 ---
            article.is_rag_synced = True
            article.last_rag_synced_at = timezone.now()
            article.save(update_fields=['is_rag_synced', 'last_rag_synced_at'])
            # -----------------------

            # 更新文集统计
            Anthology.objects.get(coll_id=article.coll_id).update_stats()

            return success_result({
                'message': '同步成功',
                'chunks_count': chunk_count,
                'last_rag_synced_at': article.last_rag_synced_at
            })

        except Article.DoesNotExist:
            return valid_result(msg='文章不存在')
        except RagSyncError as e:
            return valid_result(msg='同步失败', data=str(e))
        except Exception as e:
            return valid_result(msg='同步失败', data=str(e))


class SyncCollectionView(APIView):
    """同步整个文集到知识库"""

    def post(self, request):
        coll_id = request.data.get('coll_id')
        if not coll_id:
            return Response({'error': 'Collection ID is required'}, status=400)

        try:
            # 1. 获取文集下所有有效文章
            articles = Article.objects.filter(coll_id=coll_id, is_valid=True)
            if not articles.exists():
                return success_result({'message': '文集为空', 'synced_count': 0})

            total_chunks = 0
            synced_count = 0
            failures = []

            # 2. 遍历同步
            for article in articles:
                try:
                    count = RagClient.add_article(
                        article_id=article.article_id,
                        title=article.title,
                        content=article.content,
                        coll_id=article.coll_id  # 确保 RagClient 已更新支持 coll_id
                    )
                    total_chunks += count
                    synced_count += 1
                    article.is_rag_synced = True
                    article.last_rag_synced_at = timezone.now()
                    article.save(update_fields=['is_rag_synced', 'last_rag_synced_at'])
                except Exception as e:
                    message = str(e) or '同步失败'
                    logger.warning('Article vector synchronization failed: article_id=%s, reason=%s', article.article_id, message)
                    failures.append({
                        'article_id': article.article_id,
                        'title': article.title,
                        'message': message,
                    })
                    continue

            Anthology.objects.get(coll_id=coll_id).update_stats()

            if failures:
                return valid_result(
                    msg=f'文集同步未完成：成功 {synced_count} 篇，失败 {len(failures)} 篇',
                    data={
                        'synced_count': synced_count,
                        'failed_count': len(failures),
                        'total_chunks': total_chunks,
                        'failures': failures[:10],
                    }
                )

            return success_result({
                'message': f'成功同步 {synced_count} 篇文章',
                'total_chunks': total_chunks
            })

        except Exception:
            logger.exception('RAG article synchronization failed')
            return error_result(ErrorCode.SYSTEM_ERROR)
