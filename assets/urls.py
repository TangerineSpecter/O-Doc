from django.urls import path
from . import views

app_name = 'assets'

urlpatterns = [
    # 资源列表
    path('list', views.ResourceListView.as_view(), name='resource_list'),
    
    # 资源上传
    path('upload', views.ResourceUploadView.as_view(), name='resource_upload'),
    
    # 资源创建（用于手动创建资源记录）
    path('create', views.ResourceCreateView.as_view(), name='resource_create'),
    
    # 资源更新
    path('update/<str:resource_id>', views.ResourceUpdateView.as_view(), name='resource_update'),
    
    # 资源删除
    path('delete/<str:resource_id>', views.ResourceDeleteView.as_view(), name='resource_delete'),
    
    # 资源下载
    path('download/<str:resource_id>', views.ResourceDownloadView.as_view(), name='resource_download'),
    
    # 资源查看（用于浏览器直接显示，如图片预览）
    path('view/<str:resource_id>', views.ResourceDownloadView.as_view(), name='resource_view'),
]