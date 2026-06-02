import os
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework.authtoken.models import Token
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from .models import UserProfile
from utils.response_utils import success_result, valid_result


def get_user_role(user):
    if user.is_superuser or user.is_staff:
        return 'admin', '管理员'
    return 'user', '普通用户'


def serialize_user(user):
    role, role_name = get_user_role(user)
    profile, _ = UserProfile.objects.get_or_create(user=user)
    if not profile.userid:
        profile.userid = 'admin' if user.is_superuser and user.username == 'admin' else f'user_{user.id}'
        profile.save(update_fields=['userid', 'updated_at'])
    avatar = profile.avatar or f'https://api.dicebear.com/7.x/avataaars/svg?seed={user.username}'
    return {
        'userid': profile.userid,
        'username': user.username,
        'nickname': profile.nickname or user.first_name or user.username,
        'email': user.email,
        'avatar': avatar,
        'is_superuser': user.is_superuser,
        'is_staff': user.is_staff,
        'role': role,
        'role_name': role_name,
        'is_admin': role == 'admin'
    }


PASSWORD_ERROR_TRANSLATIONS = {
    'This password is too short. It must contain at least 8 characters.': '密码长度不能少于 8 位。',
    'This password is too common.': '这个密码太常见了。',
    'This password is entirely numeric.': '密码不能只包含数字。',
    'The password is too similar to the username.': '密码不能和用户名太相似。',
    'The password is too similar to the email address.': '密码不能和邮箱太相似。',
}


def format_password_errors(messages):
    return ' '.join(PASSWORD_ERROR_TRANSLATIONS.get(message, message) for message in messages)


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
            user_data = serialize_user(user)
            # 获取或创建 Token
            token, _ = Token.objects.get_or_create(user=user)
            return success_result(data={
                'token': token.key,
                **user_data
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
        return success_result(data=serialize_user(request.user))

    def patch(self, request):
        nickname = request.data.get('nickname')
        email = request.data.get('email')

        if nickname is not None:
            nickname = nickname.strip()
            if not nickname:
                return valid_result(msg="昵称不能为空")
            profile, _ = UserProfile.objects.get_or_create(user=request.user)
            profile.nickname = nickname[:150]
            profile.save(update_fields=['nickname', 'updated_at'])

        if email is not None:
            email = email.strip()
            if email and User.objects.exclude(id=request.user.id).filter(email=email).exists():
                return valid_result(msg="邮箱已被其他账号使用")
            request.user.email = email
            request.user.save(update_fields=['email'])

        return success_result(data=serialize_user(request.user), msg="个人资料已更新")


class UserAvatarUploadView(APIView):
    """
    上传当前用户头像
    POST /api/user/avatar
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        avatar = request.FILES.get('avatar')
        if not avatar:
            return valid_result(msg="请选择头像文件")

        if avatar.size > 2 * 1024 * 1024:
            return valid_result(msg="头像文件不能超过 2MB")

        ext = os.path.splitext(avatar.name)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.webp', '.gif']:
            return valid_result(msg="仅支持 jpg、png、webp、gif 格式头像")

        avatar_dir = settings.MEDIA_ROOT / 'avatars'
        avatar_dir.mkdir(parents=True, exist_ok=True)
        file_name = f'user_{request.user.id}_{uuid4().hex}{ext}'
        file_path = avatar_dir / file_name

        with open(file_path, 'wb+') as destination:
            for chunk in avatar.chunks():
                destination.write(chunk)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.avatar = f'{settings.MEDIA_URL}avatars/{file_name}'
        profile.save(update_fields=['avatar', 'updated_at'])

        return success_result(data=serialize_user(request.user), msg="头像已更新")


class ChangePasswordView(APIView):
    """
    修改当前用户密码
    POST /api/user/change-password
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        old_password = request.data.get('old_password')
        new_password = request.data.get('new_password')
        confirm_password = request.data.get('confirm_password')

        if not old_password or not new_password or not confirm_password:
            return valid_result(msg="请完整填写密码信息")

        if not request.user.check_password(old_password):
            return valid_result(msg="当前密码不正确")

        if new_password != confirm_password:
            return valid_result(msg="两次输入的新密码不一致")

        try:
            validate_password(new_password, request.user)
        except ValidationError as exc:
            return valid_result(msg=format_password_errors(exc.messages))

        request.user.set_password(new_password)
        request.user.save(update_fields=['password'])
        Token.objects.filter(user=request.user).delete()

        return success_result(msg="密码已修改，请重新登录")
