from django.db import models
from django.utils import timezone

from utils.id_generator import generate_whiteboard_id


class Whiteboard(models.Model):
    """一张完整白板的可同步聚合。"""

    id = models.CharField(
        max_length=32,
        primary_key=True,
        default=generate_whiteboard_id,
        editable=False,
        verbose_name='白板 ID',
        db_comment='跨设备稳定的白板标识',
    )
    user_id = models.CharField(max_length=50, default='admin', verbose_name='创建者 ID', db_comment='业务用户标识')
    title = models.CharField(max_length=120, default='未命名白板', verbose_name='标题', db_comment='白板标题')
    description = models.TextField(blank=True, default='', verbose_name='描述', db_comment='白板描述')
    nodes = models.JSONField(default=list, verbose_name='节点', db_comment='画布节点快照')
    edges = models.JSONField(default=list, verbose_name='连线', db_comment='画布连线快照')
    view_offset = models.JSONField(default=dict, verbose_name='视图偏移', db_comment='画布视图位置')
    scale = models.FloatField(default=1, verbose_name='缩放比例', db_comment='画布缩放比例')
    insights = models.JSONField(null=True, blank=True, verbose_name='AI 洞察', db_comment='白板 AI 洞察与对话记录')
    is_valid = models.BooleanField(default=True, verbose_name='是否有效', db_comment='软删除标识')
    created_at = models.DateTimeField(default=timezone.now, verbose_name='创建时间', db_comment='白板创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='白板更新时间')

    class Meta:
        db_table = 'whiteboards'
        db_table_comment = '灵感白板表'
        verbose_name = '灵感白板'
        verbose_name_plural = '灵感白板'
        ordering = ['-updated_at']

    def __str__(self):
        return self.title
