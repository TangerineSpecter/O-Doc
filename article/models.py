import math
import re

from django.db import models
from django.utils import timezone

from utils.id_generator import generate_article_id, generate_image_id


# Create your models here.
class Article(models.Model):
    """
    文章模型
    """

    # 文章唯一标识
    article_id = models.CharField(
        max_length=32,
        unique=True,
        primary_key=True,
        default=generate_article_id,
        editable=False,
        help_text="文章唯一标识",
        db_comment="文章唯一标识"
    )

    # 标题
    title = models.CharField(
        max_length=255,
        help_text="文章标题",
        db_comment="文章标题"
    )

    # 内容
    content = models.TextField(
        help_text="文章内容（Markdown格式）",
        db_comment="文章内容（Markdown格式）"
    )

    # 所属文集ID
    coll_id = models.CharField(
        max_length=32,
        help_text="所属文集ID，与anthologies表的coll_id对应",
        db_comment="所属文集ID"
    )

    # 新增：父级文章字段 (自关联)
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='children',
        verbose_name="父级文章",
        help_text="父级文章ID，用于构建文档树形结构",
        db_comment="父级文章ID"
    )

    # 作者
    author = models.CharField(
        max_length=50,
        default="admin",
        help_text="文章作者",
        db_comment="文章作者"
    )

    source_url = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        help_text="文章来源网址",
        db_comment="文章来源网址"
    )

    is_polishing = models.BooleanField(
        default=False,
        help_text="是否正在进行AI润色",
        db_comment="是否正在进行AI润色"
    )

    # 创建时间
    created_at = models.DateTimeField(
        default=timezone.now,
        help_text="创建时间",
        db_comment="创建时间"
    )

    # 更新时间
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="更新时间",
        db_comment="更新时间"
    )

    # 有效性标记
    is_valid = models.BooleanField(
        default=True,
        help_text="是否有效",
        db_comment="是否有效"
    )

    # 权限设置
    permission = models.CharField(
        max_length=20,
        choices=[
            ('public', '公开'),
            ('private', '私有')
        ],
        default='public',
        help_text="文章权限",
        db_comment="文章权限"
    )

    # 阅读次数
    read_count = models.PositiveIntegerField(
        default=0,
        help_text="阅读次数",
        db_comment="阅读次数"
    )

    # --- 新增字段 ---
    word_count = models.PositiveIntegerField(
        default=0,
        help_text="文章字数",
        db_comment="文章字数"
    )

    read_time = models.PositiveIntegerField(
        default=0,
        help_text="预计阅读时长(分钟)",
        db_comment="预计阅读时长(分钟)"
    )

    total_read_seconds = models.PositiveIntegerField(
        default=0,
        help_text="累计阅读时长(秒)",
        db_comment="累计阅读时长(秒)"
    )

    # 分类（外键）
    category = models.ForeignKey(
        'categories.Category',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='articles',
        verbose_name="所属分类",
        help_text="文章所属分类",
        db_comment="文章所属分类ID"
    )

    # 标签（多对多关系）
    tags = models.ManyToManyField(
        'tags.Tag',
        blank=True,
        related_name='articles',
        verbose_name="文章标签",
        help_text="文章关联的标签"
    )

    # 排序字段
    sort = models.IntegerField(
        default=0,
        help_text="文章排序值，值越小越靠前",
        db_comment="文章排序值，值越小越靠前"
    )

    # --- RAG 同步相关字段 ---
    is_rag_synced = models.BooleanField(
        default=False,
        help_text="是否已同步到RAG知识库",
        db_comment="是否已同步到RAG知识库"
    )

    last_rag_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="上次同步到RAG的时间",
        db_comment="上次同步到RAG的时间"
    )

    class Meta:
        verbose_name = '文章'
        verbose_name_plural = '文章管理'
        ordering = ['sort', '-updated_at']
        # 确保同一个文集中的文章标题唯一
        unique_together = ('author', 'coll_id', 'title')
        db_table = 'articles'
        db_table_comment = '文章表'

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # 如果article_id为空，生成一个新的
        if not self.article_id:
            self.article_id = generate_article_id()

        # 2. 自动计算字数和阅读时长
        if self.content:
            # 简单去除 Markdown 常用符号，尽量与前端算法保持一致
            # 前端逻辑：textContent.replace(/[#*`>~-]/g, '')
            text_content = re.sub(r'[#*`>~-]', '', self.content)
            # 去除首尾空白
            text_content = text_content.strip()

            # 计算字数 (中文通常按字符数统计)
            self.word_count = len(text_content)

            # 计算阅读时长 (按每分钟 400 字计算，向上取整)
            # 防止除以 0，虽然 len 为 0 时分子也是 0
            self.read_time = math.ceil(self.word_count / 400) if self.word_count > 0 else 0
        else:
            self.word_count = 0
            self.read_time = 0

        super().save(*args, **kwargs)


class Image(models.Model):
    """
    图片模型 - 用于存储图片文集中的图片
    """

    # 图片唯一标识
    image_id = models.CharField(
        max_length=32,
        unique=True,
        primary_key=True,
        default=generate_image_id,
        editable=False,
        help_text="图片唯一标识",
        db_comment="图片唯一标识"
    )

    # 标题
    title = models.CharField(
        max_length=255,
        help_text="图片标题",
        db_comment="图片标题"
    )

    # 图片描述
    description = models.TextField(
        blank=True,
        default='',
        help_text="图片描述",
        db_comment="图片描述"
    )

    # 图片URL（存储在资源服务器上的路径）
    image_url = models.CharField(
        max_length=500,
        help_text="图片URL",
        db_comment="图片URL"
    )

    # 所属文集ID
    coll_id = models.CharField(
        max_length=32,
        help_text="所属文集ID，与anthologies表的coll_id对应",
        db_comment="所属文集ID"
    )

    # 拍摄时间
    shooting_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="拍摄时间",
        db_comment="拍摄时间"
    )

    # 拍摄国家
    country = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="拍摄国家",
        db_comment="拍摄国家"
    )

    # 拍摄城市
    city = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="拍摄城市",
        db_comment="拍摄城市"
    )

    # 焦段
    focal_length = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text="焦段",
        db_comment="焦段"
    )

    # 标签（存储为逗号分隔的字符串）
    tags = models.CharField(
        max_length=500,
        blank=True,
        default='',
        help_text="标签，多个标签用逗号分隔",
        db_comment="标签"
    )

    # 作者
    author = models.CharField(
        max_length=50,
        default="admin",
        help_text="图片作者",
        db_comment="图片作者"
    )

    # 创建时间
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="创建时间",
        db_comment="创建时间"
    )

    # 更新时间
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="更新时间",
        db_comment="更新时间"
    )

    # 有效性标记
    is_valid = models.BooleanField(
        default=True,
        help_text="是否有效",
        db_comment="是否有效"
    )

    class Meta:
        verbose_name = '图片'
        verbose_name_plural = '图片管理'
        ordering = ['-created_at']
        db_table = 'images'
        db_table_comment = '图片表'

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # 如果image_id为空，生成一个新的
        if not self.image_id:
            self.image_id = generate_image_id()
        super().save(*args, **kwargs)

    def get_tags_list(self):
        """将逗号分隔的标签字符串转换为列表"""
        if not self.tags:
            return []
        return [tag.strip() for tag in self.tags.split(',') if tag.strip()]
