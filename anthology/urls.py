from django.urls import path

from .views import AnthologyCreateView, AnthologyDetailView, AnthologyListView, AnthologySortView, AnthologyUpdateView, AnthologyDeleteView
from .book_views import BookListView, BookUploadView, BookFileView, BookCoverView, BookProgressView, BookReleaseView, BookRestoreView, BookDeleteView

urlpatterns = [
    path('<str:coll_id>/books', BookListView.as_view()),
    path('<str:coll_id>/books/upload', BookUploadView.as_view()),
    path('book/<str:book_id>/file', BookFileView.as_view()),
    path('book/<str:book_id>/cover', BookCoverView.as_view()),
    path('book/<str:book_id>/progress', BookProgressView.as_view()),
    path('book/<str:book_id>/release', BookReleaseView.as_view()),
    path('book/<str:book_id>/restore', BookRestoreView.as_view()),
    path('book/<str:book_id>/delete', BookDeleteView.as_view()),
    path('create', AnthologyCreateView.as_view(), name='create-anthology'),
    path('detail/<str:coll_id>', AnthologyDetailView.as_view(), name='anthology-detail'),
    path('list', AnthologyListView.as_view(), name='anthology-list'),
    path('<str:coll_id>/sort', AnthologySortView.as_view(), name='anthology-sort'),
    path('update/<str:coll_id>', AnthologyUpdateView.as_view(), name='update-anthology'),
    path('delete/<str:coll_id>', AnthologyDeleteView.as_view(), name='delete-anthology'),
]
