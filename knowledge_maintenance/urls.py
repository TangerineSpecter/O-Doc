from django.urls import path

from .views import DailyReviewItemView, DailyReviewRefreshView, DailyReviewView, HealthCheckView, HealthIgnoreView, MaintenanceOverviewView


urlpatterns = [
    path('overview', MaintenanceOverviewView.as_view()),
    path('reviews', DailyReviewView.as_view()),
    path('reviews/items/<uuid:item_id>', DailyReviewItemView.as_view()),
    path('reviews/refresh', DailyReviewRefreshView.as_view()),
    path('health', HealthCheckView.as_view()),
    path('health/ignore', HealthIgnoreView.as_view()),
]

