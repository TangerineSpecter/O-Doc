from django.conf import settings  # 引用 User 模型
from django.db import models

from utils.id_generator import generate_msg_id


class Notification(models.Model):
    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_msg_id,
        verbose_name='消息 ID',
        db_comment='消息 ID'
    )

    """系统通知模型"""
    TYPE_CHOICES = [
        ('info', '信息'),
        ('success', '成功'),
        ('warning', '警告'),
        ('error', '错误'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications',
                             verbose_name="接收用户", db_comment="接收用户ID")
    title = models.CharField(max_length=100, verbose_name="标题", db_comment="标题")
    content = models.TextField(verbose_name="内容", db_comment="内容")
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='info', verbose_name="类型", db_comment="通知类型")
    link = models.CharField(max_length=255, blank=True, null=True, verbose_name="关联链接", db_comment="关联链接")
    is_read = models.BooleanField(default=False, verbose_name="已读", db_comment="是否已读")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间", db_comment="创建时间")

    class Meta:
        ordering = ['-created_at']
        verbose_name = "系统通知"
        verbose_name_plural = verbose_name
        db_table_comment = "系统通知表"

    def __str__(self):
        return f"{self.title} - {self.user}"
