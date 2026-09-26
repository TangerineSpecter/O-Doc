from django.urls import path
from .views import LogsView, OverviewView, DetailView, DeleteView, ClearView, PolicyView, DownloadView, ReportView

urlpatterns = [
    path('', LogsView.as_view()),
    path('overview/', OverviewView.as_view()),
    path('delete/', DeleteView.as_view()),
    path('clear/', ClearView.as_view()),
    path('policy/', PolicyView.as_view()),
    path('download/', DownloadView.as_view()),
    path('report/', ReportView.as_view()),
    path('<str:event_id>/', DetailView.as_view()),
]
