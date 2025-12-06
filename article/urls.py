from django.urls import path
from article.views import (
    ArticleCreateView, ArticleDetailView,
    ArticleUpdateView, ArticleDeleteView,
    ArticleListByAnthologyView
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
    
    # 根据文集获取文章列表
    path('list/<str:coll_id>', ArticleListByAnthologyView.as_view(), name='article-list-by-anthology'),
]
