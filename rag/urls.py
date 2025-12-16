from django.urls import path

from . import views

app_name = 'rag'

urlpatterns = [
    # 同步知识库
    path('sync', views.SyncArticleView.as_view(), name='rag_sync'),
]
