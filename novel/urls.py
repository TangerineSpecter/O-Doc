from django.urls import path
from . import views

urlpatterns = [
    path('models/', views.ModelsView.as_view()),
    path('<str:coll_id>/', views.ProjectView.as_view()),
    path('<str:coll_id>/read/', views.ReaderView.as_view()),
    path('<str:coll_id>/read/<str:chapter_id>/', views.ReaderView.as_view()),
    path('<str:coll_id>/memory/', views.MemoryView.as_view()),
    path('<str:coll_id>/export/', views.ExportView.as_view()),
    path('<str:coll_id>/chapters/', views.ChapterView.as_view()),
    path('<str:coll_id>/chapters/<str:chapter_id>/', views.ChapterView.as_view()),
    path('<str:coll_id>/chapters/<str:chapter_id>/<str:action>/', views.ChapterActionView.as_view()),
    path('<str:coll_id>/revisions/<str:revision_id>/', views.RevisionView.as_view()),
    path('<str:coll_id>/runs/', views.RunView.as_view()),
    path('<str:coll_id>/runs/<str:run_id>/', views.RunView.as_view()),
    path('<str:coll_id>/runs/<str:run_id>/<str:action>/', views.RunView.as_view()),
]
for resource in views.ResourceView.registry:
    urlpatterns += [path('<str:coll_id>/' + resource + '/', views.ResourceView.as_view(), {'resource': resource}),
                    path('<str:coll_id>/' + resource + '/<str:record_id>/', views.ResourceView.as_view(), {'resource': resource})]
