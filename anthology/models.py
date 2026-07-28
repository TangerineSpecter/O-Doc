from django.db import models
from utils.id_generator import generate_coll_id, generate_book_id


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
            ('image', '图片文集'),
            ('agent', 'Agent 文集'),
            ('book', '图书文集'),
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

    hide_cover_content = models.BooleanField(
        default=False,
        verbose_name='是否隐藏封面内容',
        db_comment='是否隐藏文集列表封面内容'
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
        # 确保同一个 user_id 下的同类型文集标题唯一
        unique_together = ('user_id', 'title', 'type')
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


class Book(models.Model):
    """图书书架条目；正文和封面继续复用统一 Asset 存储与同步机制。"""
    BOOK_FORMATS = [('pdf', 'PDF'), ('txt', 'TXT'), ('epub', 'EPUB'), ('mobi', 'MOBI')]
    LOCAL_STATES = [('local', '本地可用'), ('cloud_only', '仅云端'), ('restoring', '恢复中')]

    book_id = models.CharField(max_length=40, primary_key=True, default=generate_book_id)
    anthology = models.ForeignKey(Anthology, on_delete=models.CASCADE, related_name='books')
    asset = models.ForeignKey('assets.Asset', on_delete=models.PROTECT, related_name='book_files')
    cover_asset = models.ForeignKey('assets.Asset', on_delete=models.SET_NULL, null=True, blank=True, related_name='book_covers')
    title = models.CharField(max_length=255)
    author = models.CharField(max_length=255, blank=True, default='')
    book_format = models.CharField(max_length=10, choices=BOOK_FORMATS)
    local_state = models.CharField(max_length=20, choices=LOCAL_STATES, default='local')
    remote_available = models.BooleanField(default=False)
    remote_hash = models.CharField(max_length=64, blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    is_valid = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'books'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['anthology', 'is_valid'], name='books_antholo_5e8e5a_idx'),
            models.Index(fields=['local_state'], name='books_local_s_9e1b7f_idx'),
        ]


class BookReadingProgress(models.Model):
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='reading_progresses')
    user_id = models.CharField(max_length=50)
    location = models.TextField(blank=True, default='')
    progress = models.FloatField(default=0)
    last_read_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'book_reading_progresses'
        unique_together = ('book', 'user_id')
