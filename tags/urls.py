from django.urls import path
from .views import (
    TagCreateView,
    TagDetailView,
    TagListView,
    TagSortView,
    TagUpdateView,
    TagDeleteView
)

urlpatterns = [
    # 创建标签
    path('create', TagCreateView.as_view(), name='tag_create'),
    # 标签详情
    path('detail/<str:tag_id>', TagDetailView.as_view(), name='tag_detail'),
    # 标签列表
    path('list', TagListView.as_view(), name='tag_list'),
    # 标签排序
    path('<str:tag_id>/sort', TagSortView.as_view(), name='tag_sort'),
    # 更新标签
    path('update/<str:tag_id>', TagUpdateView.as_view(), name='tag_update'),
    # 删除标签
    path('delete/<str:tag_id>', TagDeleteView.as_view(), name='tag_delete'),
]