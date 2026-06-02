"""
URL configuration for o_doc project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include, re_path
from django.views.static import serve
from django.views.generic import TemplateView

urlpatterns = [
    path('', TemplateView.as_view(template_name='index.html')),
    path('api/', include('user.urls')),
    path('api/anthology/', include('anthology.urls')),  # 文集接口
    path('api/article/', include('article.urls')),  # 文章接口
    path('api/category/', include('categories.urls')),  # 分类接口
    path('api/tag/', include('tags.urls')),  # 标签接口
    path('api/resource/', include('assets.urls')),  # 资源管理接口
    path('api/settings/', include('system_settings.urls')),  # 系统设置接口
    path('api/ai/', include('ai_assistant.urls')),  # ai对话接口
    path('api/stats/', include('stats.urls')),  # 统计接口
    path('api/rag/', include('rag.urls')),  # RAG接口
    path('api/message/', include('message.urls')),  # 消息模块接口
    path('api/memo/', include('memos.urls')),  # 闪念备忘接口
    path('api/system-mcp/', include('system_mcp.urls')),  # 外部系统 MCP 接口
]

# 提供媒体文件服务（内网部署场景下需要直接访问上传文件）。
# 这里不能依赖 django.conf.urls.static.static；DEBUG=false 时它不会注册路由，
# /media 请求会落到下面的 SPA fallback，浏览器拿到 index.html 后头像就会加载失败。
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]

urlpatterns += [
    re_path(r'^(?!api/|static/).*$', TemplateView.as_view(template_name='index.html')),
]

# 添加静态文件URL配置
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
