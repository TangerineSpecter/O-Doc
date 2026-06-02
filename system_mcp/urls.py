from django.urls import path

from .views import ODocSystemMCPView


urlpatterns = [
    path('', ODocSystemMCPView.as_view(), name='system-mcp'),
]
