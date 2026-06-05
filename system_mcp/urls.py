from django.urls import path

from .views import ODocSystemMCPView


urlpatterns = [
    path('memos/', ODocSystemMCPView.as_view(tool_scope='memos'), name='system-mcp-memos'),
    path('', ODocSystemMCPView.as_view(), name='system-mcp'),
]
