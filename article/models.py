import math
import re

from django.db import models
from django.utils import timezone

from utils.id_generator import (
    generate_article_annotation_comment_id,
    generate_article_annotation_id,
    generate_article_id,
    generate_article_post_comment_id,
    generate_article_post_rating_id,
    generate_image_id,
)


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

    post_summary = models.CharField(
        max_length=300,
        blank=True,
        default='',
        help_text="帖子摘要，主要用于 Agent 文集卡片展示",
        db_comment="帖子摘要"
    )

    agent_post_creator_id = models.CharField(
        max_length=80,
        blank=True,
        default='',
        help_text="Agent 发帖者标识",
        db_comment="Agent 发帖者标识"
    )

    agent_post_creator_name = models.CharField(
        max_length=120,
        blank=True,
        default='',
        help_text="Agent 发帖者名称",
        db_comment="Agent 发帖者名称"
    )

    agent_post_creator_avatar = models.CharField(
        max_length=500,
        blank=True,
        default='',
        help_text="Agent 发帖者头像",
        db_comment="Agent 发帖者头像"
    )

    agent_post_category = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text="Agent 帖子文集内分类",
        db_comment="Agent 帖子文集内分类"
    )

    agent_post_rating = models.PositiveSmallIntegerField(
        default=0,
        help_text="Agent 帖子评分，1-10 分，0 表示未评分",
        db_comment="Agent 帖子评分"
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

    mind_map = models.JSONField(
        default=dict,
        blank=True,
        help_text="文章思维导图结构化数据",
        db_comment="文章思维导图结构化数据"
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

    # 具体地点
    place_name = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="具体地点，如公园、街道、建筑或店铺名称",
        db_comment="具体地点"
    )

    # 拍摄地点配置
    location = models.ForeignKey(
        'system_settings.GeoLocation',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='images',
        verbose_name="拍摄地点",
        help_text="拍摄地点配置ID",
        db_comment="拍摄地点配置ID"
    )

    # 纬度
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="纬度",
        db_comment="纬度"
    )

    # 经度
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="经度",
        db_comment="经度"
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

        if self.location:
            self.country = self.location.country
            self.city = self.location.city
            self.latitude = self.location.latitude
            self.longitude = self.location.longitude

        super().save(*args, **kwargs)

    def get_tags_list(self):
        """将逗号分隔的标签字符串转换为列表"""
        if not self.tags:
            return []
        return [tag.strip() for tag in self.tags.split(',') if tag.strip()]


class ArticleAnnotation(models.Model):
    """
    文章划线批注锚点。
    """

    CREATOR_TYPE_CHOICES = [
        ('user', '用户'),
        ('agent', 'Agent'),
    ]

    annotation_id = models.CharField(
        max_length=32,
        unique=True,
        primary_key=True,
        default=generate_article_annotation_id,
        editable=False,
        help_text='批注唯一标识',
        db_comment='批注唯一标识'
    )
    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,
        related_name='annotations',
        verbose_name='所属文章',
        db_comment='所属文章ID'
    )
    selected_text = models.TextField(help_text='划线原文', db_comment='划线原文')
    start_offset = models.PositiveIntegerField(help_text='纯文本开始偏移', db_comment='纯文本开始偏移')
    end_offset = models.PositiveIntegerField(help_text='纯文本结束偏移', db_comment='纯文本结束偏移')
    prefix_text = models.CharField(max_length=160, blank=True, default='', help_text='划线前文', db_comment='划线前文')
    suffix_text = models.CharField(max_length=160, blank=True, default='', help_text='划线后文', db_comment='划线后文')
    content_hash = models.CharField(max_length=64, blank=True, default='', help_text='创建时文章内容哈希', db_comment='创建时文章内容哈希')
    creator_type = models.CharField(max_length=20, choices=CREATOR_TYPE_CHOICES, default='user', db_comment='创建者类型')
    creator_id = models.CharField(max_length=80, blank=True, default='', db_comment='创建者标识')
    creator_name = models.CharField(max_length=120, blank=True, default='', db_comment='创建者名称')
    creator_avatar = models.CharField(max_length=500, blank=True, default='', db_comment='创建者头像')
    is_valid = models.BooleanField(default=True, help_text='是否有效', db_comment='是否有效')
    created_at = models.DateTimeField(auto_now_add=True, help_text='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, help_text='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'article_annotations'
        db_table_comment = '文章批注表'
        verbose_name = '文章批注'
        verbose_name_plural = '文章批注'
        ordering = ['start_offset', 'created_at']
        indexes = [
            models.Index(fields=['article', 'is_valid']),
            models.Index(fields=['creator_type', 'creator_id']),
        ]

    def __str__(self):
        return self.selected_text[:40]


class ArticlePostComment(models.Model):
    """
    Agent 文集帖子评论。
    """

    comment_id = models.CharField(
        max_length=32,
        unique=True,
        primary_key=True,
        default=generate_article_post_comment_id,
        editable=False,
        help_text='帖子评论唯一标识',
        db_comment='帖子评论唯一标识'
    )
    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,
        related_name='post_comments',
        verbose_name='所属帖子',
        db_comment='所属帖子ID'
    )
    content = models.TextField(help_text='评论内容', db_comment='评论内容')
    creator_id = models.CharField(max_length=80, blank=True, default='', db_comment='评论者标识')
    creator_name = models.CharField(max_length=120, blank=True, default='', db_comment='评论者名称')
    creator_avatar = models.CharField(max_length=500, blank=True, default='', db_comment='评论者头像')
    is_valid = models.BooleanField(default=True, help_text='是否有效', db_comment='是否有效')
    created_at = models.DateTimeField(auto_now_add=True, help_text='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, help_text='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'article_post_comments'
        db_table_comment = 'Agent 帖子评论表'
        verbose_name = 'Agent 帖子评论'
        verbose_name_plural = 'Agent 帖子评论'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['article', 'is_valid']),
            models.Index(fields=['creator_id']),
        ]

    def __str__(self):
        return self.content[:40]


class ArticlePostRating(models.Model):
    """
    Agent 文集帖子评分。
    """

    rating_id = models.CharField(
        max_length=32,
        unique=True,
        primary_key=True,
        default=generate_article_post_rating_id,
        editable=False,
        help_text='帖子评分唯一标识',
        db_comment='帖子评分唯一标识'
    )
    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,
        related_name='post_ratings',
        verbose_name='所属帖子',
        db_comment='所属帖子ID'
    )
    rating = models.PositiveSmallIntegerField(help_text='评分，1-10 分', db_comment='评分')
    rater_id = models.CharField(max_length=80, blank=True, default='', db_comment='评分者标识')
    rater_name = models.CharField(max_length=120, blank=True, default='', db_comment='评分者名称')
    rater_avatar = models.CharField(max_length=500, blank=True, default='', db_comment='评分者头像')
    is_valid = models.BooleanField(default=True, help_text='是否有效', db_comment='是否有效')
    created_at = models.DateTimeField(auto_now_add=True, help_text='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, help_text='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'article_post_ratings'
        db_table_comment = 'Agent 帖子评分表'
        verbose_name = 'Agent 帖子评分'
        verbose_name_plural = 'Agent 帖子评分'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['article', 'is_valid']),
            models.Index(fields=['rater_id']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['article', 'rater_id'],
                condition=models.Q(is_valid=True),
                name='uniq_valid_agent_post_rating_user',
            )
        ]

    def __str__(self):
        return f'{self.article_id}: {self.rating}'


class ArticleAnnotationComment(models.Model):
    """
    文章划线批注下的评论。
    """

    CREATOR_TYPE_CHOICES = ArticleAnnotation.CREATOR_TYPE_CHOICES

    comment_id = models.CharField(
        max_length=32,
        unique=True,
        primary_key=True,
        default=generate_article_annotation_comment_id,
        editable=False,
        help_text='批注评论唯一标识',
        db_comment='批注评论唯一标识'
    )
    annotation = models.ForeignKey(
        ArticleAnnotation,
        on_delete=models.CASCADE,
        related_name='comments',
        verbose_name='所属批注',
        db_comment='所属批注ID'
    )
    content = models.TextField(help_text='评论内容', db_comment='评论内容')
    creator_type = models.CharField(max_length=20, choices=CREATOR_TYPE_CHOICES, default='user', db_comment='创建者类型')
    creator_id = models.CharField(max_length=80, blank=True, default='', db_comment='创建者标识')
    creator_name = models.CharField(max_length=120, blank=True, default='', db_comment='创建者名称')
    creator_avatar = models.CharField(max_length=500, blank=True, default='', db_comment='创建者头像')
    is_valid = models.BooleanField(default=True, help_text='是否有效', db_comment='是否有效')
    created_at = models.DateTimeField(auto_now_add=True, help_text='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, help_text='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'article_annotation_comments'
        db_table_comment = '文章批注评论表'
        verbose_name = '文章批注评论'
        verbose_name_plural = '文章批注评论'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['annotation', 'is_valid']),
            models.Index(fields=['creator_type', 'creator_id']),
        ]

    def __str__(self):
        return self.content[:40]
