from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from article.access import can_access_anthology
from article.annotation_service import (
    AnnotationError,
    add_comment,
    build_anchor_from_offsets,
    can_delete_annotation,
    can_delete_comment,
    create_annotation_with_comment,
    get_user_identity,
    locate_unique_text,
    serialize_annotation,
    serialize_comment,
)
from article.models import Article, ArticleAnnotation, ArticleAnnotationComment
from utils.error_codes import ErrorCode
from utils.response_utils import error_result, success_result


class ArticleAnnotationListCreateView(APIView):
    def get(self, request):
        try:
            article_id = request.GET.get('articleId') or request.GET.get('article_id')
            if not article_id:
                return error_result(ErrorCode.PARAM_ERROR, 'articleId 不能为空')
            article = get_object_or_404(Article, article_id=article_id, is_valid=True)
            if not can_access_anthology(request, article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            annotations = ArticleAnnotation.objects.filter(article=article, is_valid=True).prefetch_related('comments')
            data = [serialize_annotation(annotation) for annotation in annotations]
            return success_result(data={'annotations': data, 'count': len(data)})
        except Exception as exc:
            return error_result(ErrorCode.SYSTEM_ERROR, str(exc))

    def post(self, request):
        try:
            if not request.user or not request.user.is_authenticated:
                return error_result(ErrorCode.PERMISSION_DENIED, '请先登录后再评论')
            article_id = request.data.get('article_id') or request.data.get('articleId')
            selected_text = request.data.get('selected_text') or request.data.get('selectedText')
            article = get_object_or_404(Article, article_id=article_id, is_valid=True)
            if not can_access_anthology(request, article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            if 'start_offset' in request.data or 'startOffset' in request.data:
                anchor = build_anchor_from_offsets(
                    article,
                    selected_text,
                    request.data.get('start_offset', request.data.get('startOffset')),
                    request.data.get('end_offset', request.data.get('endOffset')),
                )
            else:
                anchor = locate_unique_text(article, selected_text)
                if not anchor:
                    return error_result(ErrorCode.PARAM_ERROR, '未找到选中文本')
            annotation = create_annotation_with_comment(
                article,
                anchor,
                request.data.get('comment'),
                get_user_identity(request),
            )
            return success_result(data={'annotation': serialize_annotation(annotation)})
        except AnnotationError as exc:
            return error_result(ErrorCode.PARAM_ERROR, str(exc))
        except Exception as exc:
            return error_result(ErrorCode.SYSTEM_ERROR, str(exc))


class ArticleAnnotationCommentCreateView(APIView):
    def post(self, request, annotation_id):
        try:
            if not request.user or not request.user.is_authenticated:
                return error_result(ErrorCode.PERMISSION_DENIED, '请先登录后再评论')
            annotation = get_object_or_404(ArticleAnnotation, annotation_id=annotation_id, is_valid=True)
            if not can_access_anthology(request, annotation.article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            comment = add_comment(annotation, request.data.get('comment'), get_user_identity(request))
            return success_result(data={'comment': serialize_comment(comment)})
        except AnnotationError as exc:
            return error_result(ErrorCode.PARAM_ERROR, str(exc))
        except Exception as exc:
            return error_result(ErrorCode.SYSTEM_ERROR, str(exc))


class ArticleAnnotationDeleteView(APIView):
    def delete(self, request, annotation_id):
        try:
            annotation = get_object_or_404(ArticleAnnotation, annotation_id=annotation_id, is_valid=True)
            if not can_access_anthology(request, annotation.article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            if not can_delete_annotation(request, annotation):
                return error_result(ErrorCode.PERMISSION_DENIED)
            annotation.is_valid = False
            annotation.save(update_fields=['is_valid', 'updated_at'])
            return success_result(data={'annotation_id': annotation_id, 'deleted': True})
        except Exception as exc:
            return error_result(ErrorCode.SYSTEM_ERROR, str(exc))


class ArticleAnnotationCommentDeleteView(APIView):
    def delete(self, request, comment_id):
        try:
            comment = get_object_or_404(ArticleAnnotationComment, comment_id=comment_id, is_valid=True)
            if not can_access_anthology(request, comment.annotation.article.coll_id):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            if not can_delete_comment(request, comment):
                return error_result(ErrorCode.PERMISSION_DENIED)
            comment.is_valid = False
            comment.save(update_fields=['is_valid', 'updated_at'])
            return success_result(data={'comment_id': comment_id, 'deleted': True})
        except Exception as exc:
            return error_result(ErrorCode.SYSTEM_ERROR, str(exc))
