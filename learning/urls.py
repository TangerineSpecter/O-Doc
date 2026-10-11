from django.urls import path
from .views import CatalogView, AttemptView, ChatView, CourseView, ExerciseView, GenerateView, GoalView, ModelsView, PlanView, ProfileView
from .lesson_views import SessionStartView, SessionView, RevisionView, ItemsView, ItemView

urlpatterns = [
    path('catalog/', CatalogView.as_view()),
    path('models/', ModelsView.as_view()),
    path('<str:coll_id>/', CourseView.as_view()),
    path('<str:coll_id>/goals/', GoalView.as_view()),
    path('<str:coll_id>/generate/', GenerateView.as_view()),
    path('<str:coll_id>/exercises/<str:exercise_id>/', ExerciseView.as_view()),
    path('<str:coll_id>/attempts/<str:attempt_id>/', AttemptView.as_view()),
    path('<str:coll_id>/plan/', PlanView.as_view()),
    path('<str:coll_id>/chat/', ChatView.as_view()),
    path('<str:coll_id>/profile/', ProfileView.as_view()),
    path('<str:coll_id>/exercises/<str:exercise_id>/sessions/', SessionStartView.as_view()),
    path('<str:coll_id>/sessions/<str:session_id>/', SessionView.as_view()),
    path('<str:coll_id>/attempts/<str:attempt_id>/revisions/', RevisionView.as_view()),
    path('<str:coll_id>/items/', ItemsView.as_view()),
    path('<str:coll_id>/items/<str:item_id>/', ItemView.as_view()),
]
