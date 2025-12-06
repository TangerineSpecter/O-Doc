from django.urls import path

from .views import AnthologyCreateView, AnthologyDetailView, AnthologyListView, AnthologySortView

urlpatterns = [
    path('create', AnthologyCreateView.as_view(), name='create-anthology'),
    path('detail/<str:coll_id>', AnthologyDetailView.as_view(), name='anthology-detail'),
    path('list', AnthologyListView.as_view(), name='anthology-list'),
    path('<str:coll_id>/sort', AnthologySortView.as_view(), name='anthology-sort'),
]