from django.urls import path

from .ask_views import AskView
from .mutation_views import BoundaryView, NodeMutationView, ProfileMutationView, RelationMutationView, RelationView, RunActionView, RunView
from .views import BiographyDetailView, BiographyOutlineView, BiographyView, ChapterView, ChaptersView, ExecutionEventsView, GraphView, InspectView, NodeView, StatusView

urlpatterns = [
    path('books/<str:book_id>', StatusView.as_view()),
    path('books/<str:book_id>/inspect', InspectView.as_view()),
    path('books/<str:book_id>/chapters', ChaptersView.as_view()),
    path('books/<str:book_id>/chapters/<str:chapter_id>', ChapterView.as_view()),
    path('books/<str:book_id>/chapters/<str:chapter_id>/boundary', BoundaryView.as_view()),
    path('books/<str:book_id>/runs', RunView.as_view()),
    path('books/<str:book_id>/runs/<str:run_id>/events', ExecutionEventsView.as_view()),
    path('books/<str:book_id>/runs/<str:run_id>/<str:action>', RunActionView.as_view()),
    path('books/<str:book_id>/graph', GraphView.as_view()),
    path('books/<str:book_id>/biography', BiographyView.as_view()),
    path('books/<str:book_id>/biography/outline', BiographyOutlineView.as_view()),
    path('books/<str:book_id>/biography/detail', BiographyDetailView.as_view()),
    path('books/<str:book_id>/nodes/<str:node_id>', NodeView.as_view()),
    path('books/<str:book_id>/nodes/<str:node_id>/profile', ProfileMutationView.as_view()),
    path('books/<str:book_id>/nodes/<str:node_id>/correction', NodeMutationView.as_view()),
    path('books/<str:book_id>/relations', RelationView.as_view()),
    path('books/<str:book_id>/relations/<str:relation_id>', RelationMutationView.as_view()),
    path('books/<str:book_id>/ask', AskView.as_view()),
]
