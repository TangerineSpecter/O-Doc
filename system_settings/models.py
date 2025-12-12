# system_settings/models.py
from django.db import models

from utils.id_generator import generate_provider_id, generate_model_id


class AIProvider(models.Model):
    """AI模型提供商配置"""
    PROVIDER_TYPES = [
        ('OpenAi', 'OpenAI'),
        ('Google AI', 'Google AI'),
        ('Qwen', '通义千问 (Qwen)'),
        ('Doubao', '豆包 (Doubao)'),
        ('DeepSeek', 'DeepSeek'),
        ('Ollama', 'Ollama'),
        ('custom', '自定义 (Custom)'),
    ]

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_provider_id,
        verbose_name='提供商ID'
    )

    name = models.CharField(max_length=50, verbose_name='提供商名称')

    type = models.CharField(
        max_length=20,
        choices=PROVIDER_TYPES,
        verbose_name='提供商类型'
    )

    base_url = models.CharField(
        max_length=255,
        verbose_name='API Base URL'
    )

    api_key = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='API Key'
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'sys_ai_provider'
        verbose_name = 'AI提供商'
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.name


class AIModel(models.Model):
    """具体的AI模型"""
    MODEL_TYPES = [
        ('chat', '对话 (Chat)'),
        ('embedding', '向量化 (Embedding)'),
        ('rerank', '重排序 (Rerank)'),
    ]

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_model_id,
        verbose_name='模型ID'
    )

    # 级联删除：删除 Provider 时自动删除关联的 Models
    provider = models.ForeignKey(
        AIProvider,
        related_name='models',
        on_delete=models.CASCADE,
        verbose_name='所属提供商'
    )

    name = models.CharField(max_length=100, verbose_name='模型实际名称 (Model ID)')

    display_name = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name='显示名称'
    )

    type = models.CharField(
        max_length=20,
        choices=MODEL_TYPES,
        verbose_name='模型类型'
    )

    class Meta:
        db_table = 'sys_ai_model'
        verbose_name = 'AI模型'
        verbose_name_plural = verbose_name

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"


class SystemSetting(models.Model):
    """通用系统设置存储 (Key-Value)"""
    key = models.CharField(max_length=50, primary_key=True)
    value = models.JSONField(default=dict)
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = 'sys_setting'
