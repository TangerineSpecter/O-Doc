from django.urls import path

from .views import ChangePasswordView, LoginView, UserAvatarUploadView, UserProfileView

urlpatterns = [
    # 对应前端 api/user.ts 中的请求路径
    path('auth/login', LoginView.as_view()),  # /api/auth/login
    path('user/profile', UserProfileView.as_view()),  # /api/user/profile
    path('user/avatar', UserAvatarUploadView.as_view()),  # /api/user/avatar
    path('user/change-password', ChangePasswordView.as_view()),  # /api/user/change-password
]
