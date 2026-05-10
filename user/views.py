from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from utils.response_utils import success_result, valid_result


def get_user_role(user):
    if user.is_superuser or user.is_staff:
        return 'admin', '管理员'
    return 'user', '普通用户'


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

        if not email or not password:
            return valid_result(msg="账号和密码不能为空")

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
            role, role_name = get_user_role(user)
            # 获取或创建 Token
            token, _ = Token.objects.get_or_create(user=user)
            return success_result(data={
                'token': token.key,
                'username': user.username,
                'role': role,
                'role_name': role_name,
                'is_admin': role == 'admin',
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
        role, role_name = get_user_role(user)
        return success_result(data={
            'username': user.username,
            'email': user.email,
            'avatar': f'https://api.dicebear.com/7.x/avataaars/svg?seed={user.username}',
            'is_superuser': user.is_superuser,
            'is_staff': user.is_staff,
            'role': role,
            'role_name': role_name,
            'is_admin': role == 'admin'
        })
