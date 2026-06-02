# utils/notification_service.py
from django.contrib.auth import get_user_model

from message.models import Notification
from user.models import UserProfile

User = get_user_model()


class NotificationService:
    @staticmethod
    def send(user, title, content, level='info', link=None):
        """
        发送系统通知的统一接口
        :param user: 接收用户对象 (可以是 User 实例或 username 字符串，如果是 'admin' 会自动查找)
        :param title: 标题
        :param content: 内容
        :param level: 类型 ('info', 'success', 'warning', 'error')
        :param link: 跳转链接
        """
        try:
            target_user = user
            if isinstance(user, str):
                if user == 'admin':
                    target_user = User.objects.filter(username='admin').first()
                else:
                    profile = UserProfile.objects.filter(userid=user).select_related('user').first()
                    target_user = profile.user if profile else User.objects.filter(username=user).first()

            if not target_user:
                return

            Notification.objects.create(
                user=target_user,
                title=title,
                content=content,
                type=level,
                link=link
            )
        except Exception as e:
            # 这里使用 logging 防止通知系统崩溃影响主业务，暂用 print 示意，实际应记录日志
            print(f"Failed to send notification: {e}")
