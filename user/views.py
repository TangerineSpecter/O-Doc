from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from utils.response_utils import success_result, valid_result


class LoginView(APIView):
    """
    用户登录接口
    POST /api/auth/login
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        email = request.data.get('email')
        password = request.data.get('password')

        # 尝试通过邮箱查找用户（兼容 Django 默认的 username 体系）
        # 如果你的超级管理员是通过 username='admin' 创建的，这里做个简单的兼容逻辑
        user_obj = None
        if '@' in email:
            try:
                user_obj = User.objects.get(email=email)
                username = user_obj.username
            except User.DoesNotExist:
                return valid_result(msg="账号或密码错误")
        else:
            username = email

        # 验证账号密码
        user = authenticate(username=username, password=password)

        if user:
            # 获取或创建 Token
            token, _ = Token.objects.get_or_create(user=user)
            return success_result(data={
                'token': token.key,
                'username': user.username,
                # 使用 DiceBear 生成一个基于用户名的随机头像
                'avatar': f'https://api.dicebear.com/7.x/avataaars/svg?seed={user.username}'
            })
        else:
            return valid_result(msg="账号或密码错误")


class UserProfileView(APIView):
    """
    获取当前用户信息
    GET /api/user/profile
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return success_result(data={
            'username': user.username,
            'email': user.email,
            'avatar': f'https://api.dicebear.com/7.x/avataaars/svg?seed={user.username}',
            'is_superuser': user.is_superuser
        })
