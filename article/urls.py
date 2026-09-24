from django.urls import path
from article.html_note_views import HtmlPreviewView, HtmlConversionView, HtmlDeletionSummaryView
from article.image_search_views import (
    ImageSmartSearchView, ImageReferenceSearchView, ImageSimilarView,
    ImageIndexStatusView, ImageVisualDetailView, ImageIndexJobView,
    ImageIndexJobCancelView, ImageIndexRemoveView,
)
from article.views import (
    ArticleCreateView, ArticleDetailView,
    ArticleUpdateView, ArticleDeleteView,
    ArticleTrashListView, ArticleTrashRestoreView, ArticleTrashPurgeView,
    ArticleAnnotationCommentCreateView, ArticleAnnotationCommentDeleteView,
    ArticleAnnotationDeleteView, ArticleAnnotationListCreateView,
    AgentPostCommentListCreateView, AgentPostLatestCommentListView, AgentPostRatingView,
    ArticleListView, ArticleTreeListView,
    ArticleSaveWebView, ArticleImportFileView, ArticlePolishView,
    ArticleMindMapGenerateView,
    ImageListView, ImageDetailView,
    ImageCreateView, ImageUpdateView, ImageDeleteView, ImageGroupCreateView, ImageGroupUpdateView, ImageGroupDeleteView,
    ImageDescriptionGenerateView
)
from article.version_views import ArticleVersionDetailView, ArticleVersionListView, ArticleVersionRestoreView

urlpatterns = [
    path('image/search', ImageSmartSearchView.as_view()),
    path('image/search-by-image', ImageReferenceSearchView.as_view()),
    path('image/similar/<str:image_id>', ImageSimilarView.as_view()),
    path('image/index-status/<str:coll_id>', ImageIndexStatusView.as_view()),
    path('image/visual/<str:image_id>', ImageVisualDetailView.as_view()),
    path('image/index-jobs', ImageIndexJobView.as_view()),
    path('image/index-jobs/<str:job_id>/cancel', ImageIndexJobCancelView.as_view()),
    path('image/index-remove', ImageIndexRemoveView.as_view()),
    path('html-preview/<str:article_id>', HtmlPreviewView.as_view()),
    path('html-convert/<str:article_id>', HtmlConversionView.as_view()),
    path('html-delete-summary/<str:article_id>', HtmlDeletionSummaryView.as_view()),
    # 创建文章
    path('create', ArticleCreateView.as_view(), name='create-article'),

    # 获取文章详情
    path('detail/<str:article_id>', ArticleDetailView.as_view(), name='article-detail'),

    # 更新文章
    path('update/<str:article_id>', ArticleUpdateView.as_view(), name='update-article'),

    # 删除文章
    path('delete/<str:article_id>', ArticleDeleteView.as_view(), name='delete-article'),

    # 回收站（仅 Markdown 文章）
    path('trash', ArticleTrashListView.as_view(), name='article-trash'),
    path('trash/<str:article_id>/restore', ArticleTrashRestoreView.as_view(), name='article-trash-restore'),
    path('trash/<str:article_id>', ArticleTrashPurgeView.as_view(), name='article-trash-purge'),

    # Markdown article history and restore
    path('<str:article_id>/versions', ArticleVersionListView.as_view(), name='article-version-list'),
    path('<str:article_id>/versions/<str:version_id>', ArticleVersionDetailView.as_view(), name='article-version-detail'),
    path('<str:article_id>/versions/<str:version_id>/restore', ArticleVersionRestoreView.as_view(), name='article-version-restore'),

    # 文章列表，支持多条件查询
    path('list', ArticleListView.as_view(), name='article-list'),

    # 文章划线批注
    path('annotations', ArticleAnnotationListCreateView.as_view(), name='article-annotations'),
    path('annotations/<str:annotation_id>/comments', ArticleAnnotationCommentCreateView.as_view(), name='article-annotation-comments'),
    path('annotations/<str:annotation_id>', ArticleAnnotationDeleteView.as_view(), name='article-annotation-delete'),
    path('annotation-comments/<str:comment_id>', ArticleAnnotationCommentDeleteView.as_view(), name='article-annotation-comment-delete'),

    # Agent 帖子评论
    path('agent-posts/<str:article_id>/comments', AgentPostCommentListCreateView.as_view(), name='agent-post-comments'),
    path('agent-posts/collections/<str:coll_id>/latest-comments', AgentPostLatestCommentListView.as_view(), name='agent-post-latest-comments'),
    path('agent-posts/<str:article_id>/rating', AgentPostRatingView.as_view(), name='agent-post-rating'),

    # 树形结构文章列表，按文集ID返回树形结构的文章列表
    path('tree-list', ArticleTreeListView.as_view(), name='article-tree-list'),
    # 保存网页文章并解析
    path('save-web/', ArticleSaveWebView.as_view(), name='save_web_article'),
    path('import-file/', ArticleImportFileView.as_view(), name='import_article_file'),
    # 文章润色同步API
    path('polish', ArticlePolishView.as_view(), name='polish-article'),

    # 生成或获取文章思维导图
    path('mind-map/<str:article_id>', ArticleMindMapGenerateView.as_view(), name='article-mind-map'),

    # ========== 图片相关 ==========
    # 图片列表（按文集ID）
    path('image/list/<str:coll_id>', ImageListView.as_view(), name='image-list'),

    # 图片详情
    path('image/detail/<str:image_id>', ImageDetailView.as_view(), name='image-detail'),

    # 创建图片
    path('image/create', ImageCreateView.as_view(), name='create-image'),
    path('image/group/create', ImageGroupCreateView.as_view(), name='create-image-group'),
    path('image/group/<str:group_id>', ImageGroupUpdateView.as_view(), name='update-image-group'),
    path('image/group/<str:group_id>/delete', ImageGroupDeleteView.as_view(), name='delete-image-group'),

    # 更新图片
    path('image/update/<str:image_id>', ImageUpdateView.as_view(), name='update-image'),

    # AI 生成图片描述说明
    path('image/generate-description', ImageDescriptionGenerateView.as_view(), name='generate-image-description'),

    # 删除图片
    path('image/delete/<str:image_id>', ImageDeleteView.as_view(), name='delete-image'),
]
