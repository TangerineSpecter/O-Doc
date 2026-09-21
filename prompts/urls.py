from django.urls import path

from .views import (
    PromptTaxonomyDetailView, PromptTaxonomyListView, PromptTemplateCoverView, PromptTemplateDetailView,
    PromptTemplateListView, PromptTemplatePurgeView, PromptTemplateRestoreView, PromptTrashView,
    PromptUsageDetailView, PromptUsagePurgeView, PromptUsageRestoreView, PromptUsageView,
)

urlpatterns = [
    path('templates', PromptTemplateListView.as_view()),
    path('templates/<str:template_id>', PromptTemplateDetailView.as_view()),
    path('templates/<str:template_id>/restore', PromptTemplateRestoreView.as_view()),
    path('templates/<str:template_id>/purge', PromptTemplatePurgeView.as_view()),
    path('templates/<str:template_id>/cover', PromptTemplateCoverView.as_view()),
    path('templates/<str:template_id>/usages', PromptUsageView.as_view()),
    path('usages/<str:usage_id>', PromptUsageDetailView.as_view()),
    path('usages/<str:usage_id>/restore', PromptUsageRestoreView.as_view()),
    path('usages/<str:usage_id>/purge', PromptUsagePurgeView.as_view()),
    path('trash', PromptTrashView.as_view()),
    path('<str:kind>', PromptTaxonomyListView.as_view()),
    path('<str:kind>/<str:item_id>', PromptTaxonomyDetailView.as_view()),
]
