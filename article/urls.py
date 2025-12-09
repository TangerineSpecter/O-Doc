from django.urls import path
from article.views import (
    ArticleCreateView, ArticleDetailView,
    ArticleUpdateView, ArticleDeleteView,
    ArticleListView, ArticleTreeListView
)

urlpatterns = [
    # 创建文章
    path('create', ArticleCreateView.as_view(), name='create-article'),
    
    # 获取文章详情
    path('detail/<str:article_id>', ArticleDetailView.as_view(), name='article-detail'),
    
    # 更新文章
    path('update/<str:article_id>', ArticleUpdateView.as_view(), name='update-article'),
    
    # 删除文章
    path('delete/<str:article_id>', ArticleDeleteView.as_view(), name='delete-article'),
    
    # 文章列表，支持多条件查询
    path('list', ArticleListView.as_view(), name='article-list'),
    
    # 树形结构文章列表，按文集ID返回树形结构的文章列表
    path('tree-list', ArticleTreeListView.as_view(), name='article-tree-list'),
]
