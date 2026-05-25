# system_settings/models.py
from django.db import models

from utils.id_generator import generate_provider_id, generate_model_id, generate_agent_id, generate_location_id


class AIProvider(models.Model):
    """AI模型提供商配置"""
    PROVIDER_TYPES = [
        ('OpenAi', 'OpenAI'),
        ('Google AI', 'Google AI'),
        ('Xiaomi', '小米 (Xiaomi)'),
        ('Qwen', '通义千问 (Qwen)'),
        ('Doubao', '豆包 (Doubao)'),
        ('DeepSeek', 'DeepSeek'),
        ('Ollama', 'Ollama'),
        ('SiliconFlow', 'SiliconFlow (硅基流动)'),
        ('MiniMax', 'MiniMax'),
        ('custom', '自定义 (Custom)'),
    ]

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_provider_id,
        verbose_name='提供商ID',
        db_comment='提供商ID'
    )

    name = models.CharField(max_length=50, verbose_name='提供商名称', db_comment='提供商名称')

    type = models.CharField(
        max_length=20,
        choices=PROVIDER_TYPES,
        verbose_name='提供商类型',
        db_comment='提供商类型'
    )

    base_url = models.CharField(
        max_length=255,
        verbose_name='API Base URL',
        db_comment='API Base URL'
    )

    api_key = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='API Key',
        db_comment='API Key'
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'sys_ai_provider'
        db_table_comment = 'AI 提供商表'
        verbose_name = 'AI提供商'
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.name


class AIModel(models.Model):
    """具体的AI模型"""
    MODEL_TYPES = [
        ('chat', '对话 (Chat)'),
        ('image', '图像识别 (Image Recognition)'),
        ('embedding', '向量化 (Embedding)'),
        ('rerank', '重排序 (Rerank)'),
    ]

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_model_id,
        verbose_name='模型ID',
        db_comment='模型ID'
    )

    # 级联删除：删除 Provider 时自动删除关联的 Models
    provider = models.ForeignKey(
        AIProvider,
        related_name='models',
        on_delete=models.CASCADE,
        verbose_name='所属提供商',
        db_comment='所属提供商ID'
    )

    name = models.CharField(max_length=100, verbose_name='模型实际名称 (Model ID)', db_comment='模型实际名称')

    display_name = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name='显示名称',
        db_comment='显示名称'
    )

    type = models.CharField(
        max_length=20,
        choices=MODEL_TYPES,
        verbose_name='模型类型',
        db_comment='模型类型'
    )

    class Meta:
        db_table = 'sys_ai_model'
        db_table_comment = 'AI 模型表'
        verbose_name = 'AI模型'
        verbose_name_plural = verbose_name

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"


class SystemSetting(models.Model):
    """通用系统设置存储 (Key-Value)"""
    key = models.CharField(max_length=50, primary_key=True, db_comment='设置键')
    value = models.JSONField(default=dict, db_comment='设置值')
    description = models.CharField(max_length=200, blank=True, db_comment='设置说明')

    class Meta:
        db_table = 'sys_setting'
        db_table_comment = '系统设置表'


class Agent(models.Model):
    """可配置的 AI Agent"""

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_agent_id,
        verbose_name='Agent ID',
        db_comment='Agent ID'
    )

    name = models.CharField(max_length=50, verbose_name='Agent 名称', db_comment='Agent 名称')

    avatar = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='头像',
        db_comment='头像，可存储 URL、Emoji 或静态资源路径'
    )

    model = models.ForeignKey(
        AIModel,
        related_name='agents',
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        verbose_name='使用模型',
        db_comment='使用模型ID'
    )

    prompt = models.TextField(blank=True, default='', verbose_name='提示词', db_comment='提示词')

    mcp_servers = models.JSONField(
        default=list,
        blank=True,
        verbose_name='MCP 配置',
        db_comment='MCP 服务配置列表'
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'sys_agent'
        db_table_comment = 'Agent 配置表'
        verbose_name = 'Agent'
        verbose_name_plural = verbose_name
        ordering = ['-updated_at']

    def __str__(self):
        return self.name


class GeoLocation(models.Model):
    """图片拍摄地点配置"""

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_location_id,
        verbose_name='地点ID',
        db_comment='地点ID'
    )

    country = models.CharField(max_length=100, verbose_name='国家', db_comment='国家')
    city = models.CharField(max_length=100, verbose_name='城市', db_comment='城市')
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        verbose_name='纬度',
        db_comment='纬度'
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        verbose_name='经度',
        db_comment='经度'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'sys_geo_location'
        db_table_comment = '地理位置配置表'
        verbose_name = '地理位置'
        verbose_name_plural = verbose_name
        ordering = ['country', 'city']
        unique_together = ('country', 'city')

    def __str__(self):
        return f"{self.country} - {self.city}"
