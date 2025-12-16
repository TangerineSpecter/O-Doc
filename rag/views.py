from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.views import APIView

from article.models import Article  # 假设你的文章模型在这里
from utils.rag_client import RagClient
from utils.response_utils import success_result, error_result


class SyncArticleView(APIView):
    """同步文章到知识库"""
    # 根据你的需求设置权限
    permission_classes = [IsAuthenticatedOrReadOnly]

    def post(self, request):
        article_id = request.data.get('article_id')
        if not article_id:
            return Response({'error': 'Article ID is required'}, status=400)

        try:
            article = Article.objects.get(id=article_id)
            # 调用 RagClient 进行处理
            chunk_count = RagClient.add_article(
                article_id=article.id,
                title=article.title,
                content=article.content  # 假设文章内容字段叫 content
            )

            return success_result({
                'message': '同步成功',
                'chunks_count': chunk_count
            })

        except Article.DoesNotExist:
            return error_result()
        except Exception as e:
            return error_result()
