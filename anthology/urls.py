from django.urls import path

from .views import AnthologyCreateView, AnthologyDetailView

urlpatterns = [
    path('create', AnthologyCreateView.as_view(), name='create-anthology'),
    path('detail/<str:coll_id>', AnthologyDetailView.as_view(), name='anthology-detail'),
]