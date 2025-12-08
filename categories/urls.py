from django.urls import path
from .views import (
    CategoryCreateView,
    CategoryDetailView,
    CategoryListView,
    CategorySortView,
    CategoryUpdateView,
    CategoryDeleteView
)

urlpatterns = [
    # 创建分类
    path('create', CategoryCreateView.as_view(), name='category_create'),
    # 获取分类详情
    path('detail/<str:category_id>', CategoryDetailView.as_view(), name='category_detail'),
    # 获取分类列表
    path('list', CategoryListView.as_view(), name='category_list'),
    # 分类排序
    path('sort/<str:category_id>', CategorySortView.as_view(), name='category_sort'),
    # 更新分类
    path('update/<str:category_id>', CategoryUpdateView.as_view(), name='category_update'),
    # 删除分类
    path('delete/<str:category_id>', CategoryDeleteView.as_view(), name='category_delete'),
]
