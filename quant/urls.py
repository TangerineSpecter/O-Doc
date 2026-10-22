from django.urls import path
from . import views

urlpatterns = [
    path('models/', views.ModelsView.as_view()),
    path('<str:coll_id>/entries/', views.EntryView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/', views.EntryView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/implementations/', views.ImplementationView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/implementations/<str:impl_id>/', views.ImplementationView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/implementations/<str:impl_id>/versions/', views.VersionView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/versions/<str:version_id>/verification/', views.VersionView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/backtests/', views.BacktestView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/backtests/<str:backtest_id>/', views.BacktestView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/attachments/', views.AttachmentView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/attachments/<str:reference_id>/', views.AttachmentView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/attachments/<str:reference_id>/text/', views.AttachmentView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/runs/', views.RunView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/runs/<str:run_id>/', views.RunView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/runs/<str:run_id>/<str:action>/', views.RunView.as_view()),
]
