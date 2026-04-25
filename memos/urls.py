from django.urls import path

from .views import (
    MemoCreateView,
    MemoDeleteView,
    MemoDetailView,
    MemoListView,
    MemoUpdateView,
)

urlpatterns = [
    path('list', MemoListView.as_view(), name='memo_list'),
    path('create', MemoCreateView.as_view(), name='memo_create'),
    path('detail/<str:memo_id>', MemoDetailView.as_view(), name='memo_detail'),
    path('update/<str:memo_id>', MemoUpdateView.as_view(), name='memo_update'),
    path('delete/<str:memo_id>', MemoDeleteView.as_view(), name='memo_delete'),
]
