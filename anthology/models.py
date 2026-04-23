from django.db import models
from utils.id_generator import generate_coll_id


class Anthology(models.Model):
    """文集模型"""
    # 基本信息
    coll_id = models.CharField(
        max_length=40,
        primary_key=True,
        unique=True,
        default=generate_coll_id,
        verbose_name='文集唯一标识',
        db_comment='文集唯一标识'
    )

    title = models.CharField(
        max_length=20,
        verbose_name='文集名称',
        db_comment='文集名称'
    )

    description = models.CharField(
        max_length=100,
        default='暂无简介',
        verbose_name='文集简介',
        db_comment='文集简介'
    )

    icon_id = models.CharField(
        max_length=20,
        default='book',
        verbose_name='图标ID',
        db_comment='图标ID'
    )

    user_id = models.CharField(
        max_length=50,
        default='admin',
        verbose_name='创建者ID',
        db_comment='创建者ID'
    )

    type = models.CharField(
        max_length=10,
        choices=[
            ('article', '文章文集'),
            ('image', '图片文集')
        ],
        default='article',
        verbose_name='文集类型',
        db_comment='文集类型'
    )

    permission = models.CharField(
        max_length=10,
        choices=[
            ('public', '公开文集'),
            ('private', '私密文集')
        ],
        default='public',
        verbose_name='访问权限',
        db_comment='访问权限'
    )

    # 状态信息
    is_top = models.BooleanField(
        default=False,
        verbose_name='是否置顶',
        db_comment='是否置顶'
    )

    # 有效性标记
    is_valid = models.BooleanField(
        default=True,
        verbose_name='是否有效',
        db_comment='是否有效'
    )

    count = models.IntegerField(
        default=0,
        verbose_name='文章数量',
        db_comment='文章数量'
    )

    rag_not_synced_count = models.IntegerField(
        default=0,
        verbose_name='未同步RAG文章数量',
        db_comment='未同步RAG文章数量'
    )

    sort = models.IntegerField(
        default=0,
        verbose_name='排序值，值越小越靠前',
        db_comment='排序值，值越小越靠前'
    )

    # 时间信息
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='创建时间',
        db_comment='创建时间'
    )

    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='更新时间',
        db_comment='更新时间'
    )

    class Meta:
        verbose_name = '文集'
        verbose_name_plural = '文集管理'
        ordering = ['-is_top', 'sort', '-updated_at']
        # 确保同一个 user_id 下的文集标题唯一
        unique_together = ('user_id', 'title')
        db_table = 'anthologies'
        db_table_comment = '文集表'

    def save(self, *args, **kwargs):
        # 如果coll_id为空，使用默认生成函数
        if not self.coll_id:
            self.coll_id = generate_coll_id()
        super().save(*args, **kwargs)

    def update_stats(self):
        """
        重新计算统计数据：
        1. 有效文章总数
        2. 未同步RAG的文章数量
        """
        # 延迟导入，避免与 article.models 循环引用
        from article.models import Article

        # 基础查询：当前文集下的所有有效文章
        base_qs = Article.objects.filter(coll_id=self.coll_id, is_valid=True)

        # 1. 统计文章总数
        self.count = base_qs.count()

        # 2. 统计未同步 RAG 的文章数
        self.rag_not_synced_count = base_qs.filter(is_rag_synced=False).count()

        # 原子更新字段，避免覆盖其他并发修改
        self.save(update_fields=['count', 'rag_not_synced_count'])

    def __str__(self):
        return self.title
