from django.db.models import Avg
from rest_framework.views import APIView

from article.access import can_access_anthology
from article.annotation_service import get_user_identity
from article.models import Article, ArticlePostComment, ArticlePostRating
from article.serializers import AgentPostLatestCommentSerializer, ArticlePostCommentSerializer
from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.response_utils import error_result, success_result


class AgentPostCommentListCreateView(APIView):
    def get(self, request, article_id):
        try:
            article = Article.objects.filter(article_id=article_id, is_valid=True).first()
            if not article or not can_access_anthology(request, article.coll_id, 'agent'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            comments = ArticlePostComment.objects.filter(article=article, is_valid=True)
            return success_result(data={
                'comments': ArticlePostCommentSerializer(comments, many=True).data,
                'count': comments.count(),
            })
        except Exception as exc:
            return error_result(ErrorCode.SYSTEM_ERROR, str(exc))

    def post(self, request, article_id):
        try:
            if not request.user or not request.user.is_authenticated:
                return error_result(ErrorCode.PERMISSION_DENIED, '请先登录后再评论')
            article = Article.objects.filter(article_id=article_id, is_valid=True).first()
            if not article or not can_access_anthology(request, article.coll_id, 'agent'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            content = str(request.data.get('content') or '').strip()
            if not content:
                return error_result(ErrorCode.PARAM_ERROR, '评论内容不能为空')
            if len(content) > 1000:
                return error_result(ErrorCode.PARAM_ERROR, '评论内容不能超过 1000 字')
            identity = get_user_identity(request)
            comment = ArticlePostComment.objects.create(
                article=article,
                content=content,
                creator_id=identity.get('creator_id', ''),
                creator_name=identity.get('creator_name', ''),
                creator_avatar=identity.get('creator_avatar', ''),
            )
            return success_result(data={'comment': ArticlePostCommentSerializer(comment).data})
        except Exception as exc:
            return error_result(ErrorCode.SYSTEM_ERROR, str(exc))


class AgentPostLatestCommentListView(APIView):
    def get(self, request, coll_id):
        try:
            if not can_access_anthology(request, coll_id, 'agent'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            try:
                limit = int(request.GET.get('limit', 10))
            except (TypeError, ValueError):
                limit = 10
            limit = max(1, min(limit, 10))
            comments = ArticlePostComment.objects.filter(
                article__coll_id=coll_id,
                article__is_valid=True,
                is_valid=True,
            ).select_related('article').order_by('-created_at')[:limit]
            return success_result(data={
                'comments': AgentPostLatestCommentSerializer(comments, many=True).data,
                'count': len(comments),
            })
        except Exception as exc:
            return error_result(ErrorCode.SYSTEM_ERROR, str(exc))


class AgentPostRatingView(APIView):
    def get(self, request, article_id):
        try:
            article = Article.objects.filter(article_id=article_id, is_valid=True).first()
            if not article or not can_access_anthology(request, article.coll_id, 'agent'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            ratings = ArticlePostRating.objects.filter(article=article, is_valid=True)
            my_rating = None
            if request.user and request.user.is_authenticated:
                rating = ratings.filter(rater_id=get_current_user_identifier(request)).first()
                my_rating = rating.rating if rating else None
            return success_result(data={
                'rating': article.agent_post_rating,
                'rating_count': ratings.count(),
                'my_rating': my_rating,
            })
        except Exception as exc:
            return error_result(ErrorCode.SYSTEM_ERROR, str(exc))

    def post(self, request, article_id):
        try:
            if not request.user or not request.user.is_authenticated:
                return error_result(ErrorCode.PERMISSION_DENIED, '请先登录后再评分')
            article = Article.objects.filter(article_id=article_id, is_valid=True).first()
            if not article or not can_access_anthology(request, article.coll_id, 'agent'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            try:
                value = int(request.data.get('rating'))
            except (TypeError, ValueError):
                return error_result(ErrorCode.PARAM_ERROR, '评分必须是 1 到 10 的整数')
            if value < 1 or value > 10:
                return error_result(ErrorCode.PARAM_ERROR, '评分必须是 1 到 10 的整数')
            identity = get_user_identity(request)
            ArticlePostRating.objects.update_or_create(
                article=article,
                rater_id=identity.get('creator_id', ''),
                is_valid=True,
                defaults={
                    'rating': value,
                    'rater_name': identity.get('creator_name', ''),
                    'rater_avatar': identity.get('creator_avatar', ''),
                },
            )
            ratings = ArticlePostRating.objects.filter(article=article, is_valid=True)
            average_rating = ratings.aggregate(value=Avg('rating'))['value'] or 0
            article.agent_post_rating = int(round(average_rating))
            article.save(update_fields=['agent_post_rating', 'updated_at'])
            return success_result(data={
                'rating': article.agent_post_rating,
                'rating_count': ratings.count(),
                'my_rating': value,
            })
        except Exception as exc:
            return error_result(ErrorCode.SYSTEM_ERROR, str(exc))
