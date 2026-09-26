import uuid

from django.db import models

from utils.id_generator import (
    generate_prompt_result_image_id, generate_prompt_taxonomy_id, generate_prompt_template_id,
    generate_prompt_template_tag_id, generate_prompt_template_theme_id, generate_prompt_usage_id,
)


def generate_pending_article_illustration_id() -> str:
    return uuid.uuid4().hex


def generate_agent_post_illustration_id() -> str:
    return uuid.uuid4().hex


class PromptTaxonomyBase(models.Model):
    """提示词页内部使用的可管理词典。"""

    id = models.CharField(max_length=32, primary_key=True, default=generate_prompt_taxonomy_id, editable=False)
    user_id = models.CharField(max_length=50, default='admin', db_index=True)
    name = models.CharField(max_length=50)
    description = models.CharField(max_length=200, blank=True, default='')
    color = models.CharField(max_length=20, blank=True, default='orange')
    sort = models.IntegerField(default=0)
    is_valid = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ['sort', 'name']


class PromptCategory(PromptTaxonomyBase):
    class Meta(PromptTaxonomyBase.Meta):
        db_table = 'prompt_categories'
        constraints = [models.UniqueConstraint(fields=['user_id', 'name'], name='prompt_category_user_name_unique')]


class PromptTheme(PromptTaxonomyBase):
    class Meta(PromptTaxonomyBase.Meta):
        db_table = 'prompt_themes'
        constraints = [models.UniqueConstraint(fields=['user_id', 'name'], name='prompt_theme_user_name_unique')]


class PromptTag(PromptTaxonomyBase):
    class Meta(PromptTaxonomyBase.Meta):
        db_table = 'prompt_tags'
        constraints = [models.UniqueConstraint(fields=['user_id', 'name'], name='prompt_tag_user_name_unique')]


class PendingArticleIllustration(models.Model):
    """A generated image URL kept locally until its bytes can be saved as an Asset."""

    id = models.CharField(max_length=32, primary_key=True, default=generate_pending_article_illustration_id, editable=False)
    user_id = models.CharField(max_length=50, db_index=True)
    task_id = models.CharField(max_length=128)
    model_id = models.CharField(max_length=32, blank=True, default='')
    provider_type = models.CharField(max_length=20, default='Grsai')
    status = models.CharField(max_length=20, default='download_pending')
    image_url = models.URLField(max_length=2048, blank=True, default='')
    preview_allowed = models.BooleanField(default=False)
    error_message = models.CharField(max_length=200, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pending_article_illustrations'
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['user_id', 'task_id'], name='pending_article_illustration_task_unique')]


class AgentPostIllustration(models.Model):
    """本机帖子配图任务。不进入 WebDAV；入库后的资源和帖子正文按原规则同步。"""

    STATUS_QUEUED = 'queued'
    STATUS_GENERATING = 'generating'
    STATUS_DOWNLOAD_PENDING = 'download_pending'
    STATUS_SUCCEEDED = 'succeeded'
    STATUS_FAILED = 'failed'

    id = models.CharField(max_length=32, primary_key=True, default=generate_agent_post_illustration_id, editable=False)
    user_id = models.CharField(max_length=50, db_index=True)
    article_id = models.CharField(max_length=32, db_index=True)
    prompt = models.TextField(blank=True, default='')
    aspect_ratio = models.CharField(max_length=20, blank=True, default='16:9')
    image_size = models.CharField(max_length=8, default='1K')
    status = models.CharField(max_length=20, default=STATUS_QUEUED, db_index=True)
    model_id = models.CharField(max_length=40, blank=True, default='')
    provider_type = models.CharField(max_length=20, blank=True, default='')
    provider_task_id = models.CharField(max_length=128, blank=True, default='')
    image_url = models.URLField(max_length=2048, blank=True, default='')
    asset_id = models.CharField(max_length=32, blank=True, default='')
    error_message = models.CharField(max_length=200, blank=True, default='')
    generate_attempts = models.PositiveSmallIntegerField(default=0)
    download_attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    generating_started_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'agent_post_illustrations'
        ordering = ['created_at']


class PromptTemplate(models.Model):
    TYPE_IMAGE = 'image'
    TYPE_HTML_REPORT = 'html_report'
    TYPE_GENERAL = 'general'
    TYPE_CHOICES = [
        (TYPE_IMAGE, '生图'),
        (TYPE_HTML_REPORT, 'HTML 报告'),
        (TYPE_GENERAL, '通用提示词'),
    ]

    id = models.CharField(max_length=32, primary_key=True, default=generate_prompt_template_id, editable=False)
    user_id = models.CharField(max_length=50, default='admin', db_index=True)
    title = models.CharField(max_length=120)
    description = models.CharField(max_length=500, blank=True, default='')
    prompt_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_IMAGE)
    positive_template = models.TextField()
    negative_template = models.TextField(blank=True, default='')
    field_schema_version = models.PositiveSmallIntegerField(default=1)
    field_schema = models.JSONField(default=list, blank=True)
    category = models.ForeignKey(PromptCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name='templates')
    is_favorite = models.BooleanField(default=False)
    is_valid = models.BooleanField(default=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    themes = models.ManyToManyField(PromptTheme, through='PromptTemplateTheme', related_name='templates')
    tags = models.ManyToManyField(PromptTag, through='PromptTemplateTag', related_name='templates')
    cover_result_image = models.ForeignKey('PromptResultImage', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        db_table = 'prompt_templates'
        ordering = ['-is_favorite', '-updated_at']
        indexes = [models.Index(fields=['user_id', 'is_valid', 'updated_at'])]


class PromptTemplateTheme(models.Model):
    id = models.CharField(max_length=32, primary_key=True, default=generate_prompt_template_theme_id, editable=False)
    template = models.ForeignKey(PromptTemplate, on_delete=models.CASCADE, related_name='theme_links')
    theme = models.ForeignKey(PromptTheme, on_delete=models.CASCADE, related_name='template_links')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'prompt_template_themes'
        constraints = [models.UniqueConstraint(fields=['template', 'theme'], name='prompt_template_theme_unique')]


class PromptTemplateTag(models.Model):
    id = models.CharField(max_length=32, primary_key=True, default=generate_prompt_template_tag_id, editable=False)
    template = models.ForeignKey(PromptTemplate, on_delete=models.CASCADE, related_name='tag_links')
    tag = models.ForeignKey(PromptTag, on_delete=models.CASCADE, related_name='template_links')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'prompt_template_tags'
        constraints = [models.UniqueConstraint(fields=['template', 'tag'], name='prompt_template_tag_unique')]


class PromptUsage(models.Model):
    id = models.CharField(max_length=32, primary_key=True, default=generate_prompt_usage_id, editable=False)
    template = models.ForeignKey(PromptTemplate, on_delete=models.CASCADE, related_name='usages')
    input_values = models.JSONField(default=dict, blank=True)
    rendered_positive = models.TextField()
    rendered_negative = models.TextField(blank=True, default='')
    model_name = models.CharField(max_length=120, blank=True, default='')
    note = models.CharField(max_length=500, blank=True, default='')
    source_url = models.URLField(max_length=500, blank=True, default='')
    is_valid = models.BooleanField(default=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'prompt_usages'
        ordering = ['-created_at']


class PromptResultImage(models.Model):
    id = models.CharField(max_length=32, primary_key=True, default=generate_prompt_result_image_id, editable=False)
    usage = models.ForeignKey(PromptUsage, on_delete=models.CASCADE, related_name='result_images')
    asset = models.ForeignKey('assets.Asset', on_delete=models.PROTECT, related_name='prompt_result_images')
    caption = models.CharField(max_length=300, blank=True, default='')
    sort = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'prompt_result_images'
        ordering = ['sort', 'created_at']
        constraints = [models.UniqueConstraint(fields=['usage', 'asset'], name='prompt_usage_asset_unique')]
