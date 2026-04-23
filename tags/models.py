from django.db import models
from utils.id_generator import generate_tag_id


class Tag(models.Model):
    """标签模型"""
    # 基本信息
    tag_id = models.CharField(
        max_length=36,
        primary_key=True,
        default=generate_tag_id,
        editable=False,
        verbose_name='标签专属ID',
        db_comment='标签专属ID'
    )
    name = models.CharField(max_length=30, verbose_name='标签名称', db_comment='标签名称')
    theme_id = models.CharField(max_length=36, verbose_name='主题ID', default='blue', db_comment='主题ID')
    user_id = models.CharField(max_length=50, default='admin', verbose_name='创建者ID', db_comment='创建者ID')

    # 状态信息
    is_valid = models.BooleanField(default=True, verbose_name='是否有效', db_comment='是否有效')
    sort = models.IntegerField(default=0, verbose_name='排序值，值越小越靠前', db_comment='排序值，值越小越靠前')

    # 时间信息
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        verbose_name = '标签'
        verbose_name_plural = '标签管理'
        ordering = ['sort', '-created_at']
        # 确保同一个 user_id 下的标签名称唯一
        unique_together = ('user_id', 'name')
        db_table = 'tags'
        db_table_comment = '标签表'

    def __str__(self):
        return self.name
