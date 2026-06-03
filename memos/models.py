from django.db import models
from django.utils import timezone

from utils.id_generator import generate_memo_id


class Memo(models.Model):
    """闪念碎片信息记录"""

    CREATOR_TYPE_USER = 'user'
    CREATOR_TYPE_AGENT = 'agent'
    CREATOR_TYPE_CHOICES = [
        (CREATOR_TYPE_USER, '用户'),
        (CREATOR_TYPE_AGENT, 'Agent'),
    ]

    memo_id = models.CharField(
        max_length=32,
        primary_key=True,
        unique=True,
        default=generate_memo_id,
        editable=False,
        verbose_name='备忘ID',
        db_comment='备忘ID'
    )
    content = models.TextField(verbose_name='内容', db_comment='闪念内容')
    tag = models.CharField(
        max_length=120,
        default='',
        blank=True,
        verbose_name='标签',
        db_comment='闪念标签'
    )
    is_pinned = models.BooleanField(default=False, verbose_name='是否置顶', db_comment='是否置顶')
    user_id = models.CharField(max_length=50, default='admin', verbose_name='创建者ID', db_comment='创建者ID')
    creator_type = models.CharField(
        max_length=20,
        choices=CREATOR_TYPE_CHOICES,
        default=CREATOR_TYPE_USER,
        verbose_name='来源类型',
        db_comment='来源类型：user/agent'
    )
    creator_id = models.CharField(
        max_length=80,
        default='',
        blank=True,
        verbose_name='来源ID',
        db_comment='用户ID或Agent ID'
    )
    creator_name = models.CharField(
        max_length=150,
        default='',
        blank=True,
        verbose_name='来源名称',
        db_comment='Agent名称快照；用户来源可为空'
    )
    is_valid = models.BooleanField(default=True, verbose_name='是否有效', db_comment='是否有效')
    created_at = models.DateTimeField(default=timezone.now, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        verbose_name = '闪念备忘'
        verbose_name_plural = '闪念备忘'
        ordering = ['-is_pinned', '-created_at']
        db_table = 'memos'
        db_table_comment = '闪念备忘表'

    def __str__(self):
        return self.content[:30]
