from django.urls import path
from .diary_views import DiaryView
from .diary_library import DiaryPhotoLibraryView

urlpatterns = [path('photo-library', DiaryPhotoLibraryView.as_view()), path('', DiaryView.as_view()), path('<str:diary_id>', DiaryView.as_view())]
