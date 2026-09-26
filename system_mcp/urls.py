from django.urls import path

from .views import ODocSystemMCPView


urlpatterns = [
    path('memos/', ODocSystemMCPView.as_view(tool_scope='memos'), name='system-mcp-memos'),
    path('anthologies/', ODocSystemMCPView.as_view(tool_scope='anthologies'), name='system-mcp-anthologies'),
    path('articles/', ODocSystemMCPView.as_view(tool_scope='articles'), name='system-mcp-articles'),
    path('agent-posts/', ODocSystemMCPView.as_view(tool_scope='agent_posts'), name='system-mcp-agent-posts'),
    path('agent-activities/', ODocSystemMCPView.as_view(tool_scope='agent_activities'), name='system-mcp-agent-activities'),
    path('comments/', ODocSystemMCPView.as_view(tool_scope='comments'), name='system-mcp-comments'),
    path('vision/', ODocSystemMCPView.as_view(tool_scope='vision'), name='system-mcp-vision'),
    path('photo-observation/', ODocSystemMCPView.as_view(tool_scope='photo_observation'), name='system-mcp-photo-observation'),
    path('image-generation/', ODocSystemMCPView.as_view(tool_scope='image_generation'), name='system-mcp-image-generation'),
    path('', ODocSystemMCPView.as_view(), name='system-mcp'),
]
