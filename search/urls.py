from django.urls import path

from .views import GlobalSearchView

urlpatterns = [
    path('global', GlobalSearchView.as_view(), name='global-search'),
]
