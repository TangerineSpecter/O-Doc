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
from django.views.generic import TemplateView

urlpatterns = [
    path('', TemplateView.as_view(template_name='index.html')),
    path('api/anthology/', include('anthology.urls')),  # 文集接口
    path('api/article/', include('article.urls')),  # 文章接口
    path('api/category/', include('categories.urls')),  # 分类接口
    path('api/tag/', include('tags.urls')),  # 标签接口
    path('api/', include('assets.urls')),  # 资源管理接口
]

urlpatterns += [
    re_path(r'^(?!api/|static/).*$', TemplateView.as_view(template_name='index.html')),
]

# 添加静态文件URL配置
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
