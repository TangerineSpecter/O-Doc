from django.urls import path

from .views import (
    WhiteboardCreateView, WhiteboardDeleteView, WhiteboardDetailView, WhiteboardLegacyImportView,
    WhiteboardListView, WhiteboardUpdateView,
)

urlpatterns = [
    path('list', WhiteboardListView.as_view(), name='whiteboard_list'),
    path('create', WhiteboardCreateView.as_view(), name='whiteboard_create'),
    path('import_legacy', WhiteboardLegacyImportView.as_view(), name='whiteboard_import_legacy'),
    path('detail/<str:whiteboard_id>', WhiteboardDetailView.as_view(), name='whiteboard_detail'),
    path('update/<str:whiteboard_id>', WhiteboardUpdateView.as_view(), name='whiteboard_update'),
    path('delete/<str:whiteboard_id>', WhiteboardDeleteView.as_view(), name='whiteboard_delete'),
]
