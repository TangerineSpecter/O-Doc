from django.urls import path
from .views import PerformanceView

urlpatterns = [
    path('overview/', PerformanceView.as_view(action='overview')),
    path('rankings/', PerformanceView.as_view(action='rankings')),
    path('samples/', PerformanceView.as_view(action='samples')),
    path('samples/<str:sample_id>/', PerformanceView.as_view(action='detail')),
    path('samples/<str:sample_id>/report/', PerformanceView.as_view(action='report')),
    path('database/', PerformanceView.as_view(action='database')),
    path('policy/', PerformanceView.as_view(action='policy')),
    path('clear/', PerformanceView.as_view(action='clear')),
]
