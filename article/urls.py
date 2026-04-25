from django.urls import path
from article.views import (
    ArticleCreateView, ArticleDetailView,
    ArticleUpdateView, ArticleDeleteView,
    ArticleListView, ArticleTreeListView,
    ArticleSaveWebView, ArticlePolishView,
    ImageListView, ImageDetailView,
    ImageCreateView, ImageUpdateView, ImageDeleteView
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
    # 保存网页文章并解析
    path('save-web/', ArticleSaveWebView.as_view(), name='save_web_article'),
    # 文章润色同步API
    path('polish', ArticlePolishView.as_view(), name='polish-article'),

    # ========== 图片相关 ==========
    # 图片列表（按文集ID）
    path('image/list/<str:coll_id>', ImageListView.as_view(), name='image-list'),

    # 图片详情
    path('image/detail/<str:image_id>', ImageDetailView.as_view(), name='image-detail'),

    # 创建图片
    path('image/create', ImageCreateView.as_view(), name='create-image'),

    # 更新图片
    path('image/update/<str:image_id>', ImageUpdateView.as_view(), name='update-image'),

    # 删除图片
    path('image/delete/<str:image_id>', ImageDeleteView.as_view(), name='delete-image'),
]
