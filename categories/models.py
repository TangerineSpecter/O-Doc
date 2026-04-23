from django.db import models

from utils.id_generator import generate_category_id


class Category(models.Model):
    """分类模型"""
    # 基本信息
    category_id = models.CharField(
        max_length=36,
        primary_key=True,
        default=generate_category_id,
        editable=False,
        verbose_name='分类专属ID',
        db_comment='分类专属ID'
    )
    name = models.CharField(max_length=50, unique=True, verbose_name='分类名称', db_comment='分类名称')
    description = models.CharField(max_length=200, default='', blank=True, verbose_name='分类描述', db_comment='分类描述')
    user_id = models.CharField(max_length=50, default='admin', verbose_name='创建者ID', db_comment='创建者ID')

    # 新增：UI展示配置
    theme_id = models.CharField(max_length=20, default='blue', verbose_name='颜色主题ID', db_comment='颜色主题ID')
    icon_key = models.CharField(max_length=50, default='Folder', verbose_name='图标Key', db_comment='图标Key')

    # 状态信息
    is_valid = models.BooleanField(default=True, verbose_name='是否有效', db_comment='是否有效')
    sort = models.IntegerField(default=0, verbose_name='排序值，值越小越靠前', db_comment='排序值，值越小越靠前')

    # 时间信息
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        verbose_name = '分类'
        verbose_name_plural = '分类管理'
        ordering = ['sort', '-created_at']
        db_table = 'categories'
        db_table_comment = '分类表'

    def __str__(self):
        return self.name
