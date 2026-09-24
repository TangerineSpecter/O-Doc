from django.urls import path

from .views import (
    MemoCreateView,
    MemoDeleteView,
    MemoDetailView,
    MemoKnowledgeGraphView,
    MemoListView,
    MemoTrashListView,
    MemoTrashRestoreView,
    MemoTrashPurgeView,
    MemoUpdateView,
    MemoVectorSyncView,
)

urlpatterns = [
    path('trash', MemoTrashListView.as_view(), name='memo-trash'),
    path('trash/<str:memo_id>/restore', MemoTrashRestoreView.as_view(), name='memo-trash-restore'),
    path('trash/<str:memo_id>', MemoTrashPurgeView.as_view(), name='memo-trash-purge'),
    path('list', MemoListView.as_view(), name='memo_list'),
    path('knowledge_graph', MemoKnowledgeGraphView.as_view(), name='memo_knowledge_graph'),
    path('sync_vectors', MemoVectorSyncView.as_view(), name='memo_sync_vectors'),
    path('create', MemoCreateView.as_view(), name='memo_create'),
    path('detail/<str:memo_id>', MemoDetailView.as_view(), name='memo_detail'),
    path('update/<str:memo_id>', MemoUpdateView.as_view(), name='memo_update'),
    path('delete/<str:memo_id>', MemoDeleteView.as_view(), name='memo_delete'),
]
