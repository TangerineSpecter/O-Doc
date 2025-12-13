# init_admin.py
import os
import secrets
import string

import django

# 设置 Django 环境
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "o_doc.settings")
django.setup()

from django.contrib.auth import get_user_model


def create_initial_superuser():
    User = get_user_model()

    # 检查是否已存在超级管理员
    if User.objects.filter(is_superuser=True).exists():
        return

    # 生成随机强密码 (12位)
    alphabet = string.ascii_letters + string.digits
    password = ''.join(secrets.choice(alphabet) for i in range(12))

    username = 'admin'
    email = 'admin@example.com'

    print("=" * 60)
    print("检测到系统暂无管理员，正在初始化默认账号...")

    try:
        # 创建超级管理员
        User.objects.create_superuser(username=username, email=email, password=password)

        print("\033[92m [✔] 超级管理员创建成功！ \033[0m")
        print("-" * 60)
        print(f" 登录账号: {username}")
        print(f" 登录邮箱: {email}")
        print(f" 初始密码: {password}")
        print("-" * 60)
        print(" 请立即登录并在【系统设置】中修改密码！")
        print("=" * 60)

    except Exception as e:
        print(f"\033[91m [✘] 创建失败: {e} \033[0m")


if __name__ == '__main__':
    create_initial_superuser()
