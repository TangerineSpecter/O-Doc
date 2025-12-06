import uuid
import hashlib
import time
from django.db import models


def generate_coll_id():
    """生成唯一的coll_id"""
    unique_str = f"{uuid.uuid4()}{time.time()}"
    return hashlib.md5(unique_str.encode('utf-8')).hexdigest()


class Anthology(models.Model):
    """文集模型"""
    # 基本信息
    coll_id = models.CharField(max_length=32, unique=True, default=generate_coll_id, verbose_name='文集唯一标识')
    title = models.CharField(max_length=20, verbose_name='文集名称')
    description = models.CharField(max_length=100, default='暂无简介', verbose_name='文集简介')
    icon_id = models.CharField(max_length=20, default='book', verbose_name='图标ID')
    userid = models.CharField(max_length=50, default='admin', verbose_name='创建者ID')
    permission = models.CharField(max_length=10, choices=[
        ('public', '公开文集'),
        ('private', '私密文集')
    ], default='public', verbose_name='访问权限')
    
    # 状态信息
    is_top = models.BooleanField(default=False, verbose_name='是否置顶')
    count = models.IntegerField(default=0, verbose_name='文章数量')
    
    # 时间信息
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')
    
    class Meta:
        verbose_name = '文集'
        verbose_name_plural = '文集管理'
        ordering = ['-is_top', '-updated_at']
        # 确保同一个userid下的文集标题唯一
        unique_together = ('userid', 'title')
        # 核心：自定义表名（推荐用小写，符合数据库惯例）
        db_table = 'anthology'  # 直接指定表名为 anthology
    
    def save(self, *args, **kwargs):
        # 如果coll_id为空，使用默认生成函数
        if not self.coll_id:
            self.coll_id = generate_coll_id()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return self.title
