from django.urls import path

from .views import ChatView, WhiteboardInsightView

urlpatterns = [
    path('chat/', ChatView.as_view(), name='ai-chat'),
    path('whiteboard/insight/', WhiteboardInsightView.as_view(), name='ai-whiteboard-insight'),
]
