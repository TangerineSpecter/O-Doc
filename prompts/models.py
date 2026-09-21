from django.db import models

from utils.id_generator import (
    generate_prompt_result_image_id, generate_prompt_taxonomy_id, generate_prompt_template_id,
    generate_prompt_template_tag_id, generate_prompt_template_theme_id, generate_prompt_usage_id,
)


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
