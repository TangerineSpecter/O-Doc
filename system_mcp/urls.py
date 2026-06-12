from django.urls import path

from .views import ODocSystemMCPView


urlpatterns = [
    path('memos/', ODocSystemMCPView.as_view(tool_scope='memos'), name='system-mcp-memos'),
    path('anthologies/', ODocSystemMCPView.as_view(tool_scope='anthologies'), name='system-mcp-anthologies'),
    path('articles/', ODocSystemMCPView.as_view(tool_scope='articles'), name='system-mcp-articles'),
    path('comments/', ODocSystemMCPView.as_view(tool_scope='comments'), name='system-mcp-comments'),
    path('', ODocSystemMCPView.as_view(), name='system-mcp'),
]
