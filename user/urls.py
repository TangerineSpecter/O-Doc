from django.urls import path

from .views import LoginView, UserProfileView

urlpatterns = [
    # 对应前端 api/user.ts 中的请求路径
    path('auth/login', LoginView.as_view()),  # /api/auth/login
    path('user/profile', UserProfileView.as_view()),  # /api/user/profile
]
