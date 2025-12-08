from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from article.models import Article
from article.serializers import ArticleSerializer
from utils.error_codes import ErrorCode
# 导入封装工具
from utils.response_utils import success_result, error_result, valid_result


class ArticleCreateView(APIView):
    """
    创建文章视图
    """
    def post(self, request):
        try:
            # 使用序列化器验证请求数据
            serializer = ArticleSerializer(data=request.data)
            
            if not serializer.is_valid():
                return valid_result(data=serializer.errors)
            
            # 保存文章
            article = serializer.save()
            
            # 序列化响应数据
            response_data = ArticleSerializer(article).data
            
            return success_result(data=response_data)
            
        except IntegrityError as e:
            if 'unique constraint' in str(e).lower() or 'duplicate' in str(e).lower():
                return error_result(error=ErrorCode.TITLE_DUPLICATE, data=str(e))
            else:
                return error_result(error=ErrorCode.DATABASE_ERROR, data=str(e))
        
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))

class ArticleDetailView(APIView):
    """
    文章详情视图
    """
    def get(self, request, article_id):
        try:
            # 查找文章
            article = get_object_or_404(Article, article_id=article_id)
            
            # 更新阅读次数
            article.read_count += 1
            article.save()
            
            # 序列化响应数据
            response_data = ArticleSerializer(article).data
            
            return success_result(data=response_data)
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))

class ArticleUpdateView(APIView):
    """
    更新文章视图
    """
    def put(self, request, article_id):
        try:
            # 查找文章
            article = get_object_or_404(Article, article_id=article_id)
            
            # 使用序列化器验证请求数据并更新文章
            serializer = ArticleSerializer(article, data=request.data, partial=True)
            
            if not serializer.is_valid():
                return valid_result(data=serializer.errors)
            
            # 保存更新
            article = serializer.save()
            
            # 序列化响应数据
            response_data = ArticleSerializer(article).data
            
            return success_result(data=response_data)
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))

class ArticleDeleteView(APIView):
    """
    删除文章视图（软删除）
    """
    def delete(self, request, article_id):
        try:
            # 查找文章
            article = get_object_or_404(Article, article_id=article_id)
            
            # 软删除：更新is_valid为False
            article.is_valid = False
            article.save()
            
            return success_result(data=None)
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))

class ArticleListByAnthologyView(APIView):
    """
    根据文集获取文章列表视图
    """
    def get(self, request, coll_id):
        try:
            # 直接根据coll_id获取该文集下的所有文章
            articles = Article.objects.filter(coll_id=coll_id).order_by('sort', '-updated_at')
            
            # 序列化响应数据
            serializer = ArticleSerializer(articles, many=True)
            
            return success_result(data=serializer.data)
            
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))
