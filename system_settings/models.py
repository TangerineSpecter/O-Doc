# system_settings/models.py
from django.db import models
from django.utils import timezone

from utils.id_generator import (
    generate_provider_id,
    generate_model_id,
    generate_agent_id,
    generate_agent_task_id,
    generate_agent_run_id,
    generate_mcp_server_id,
    generate_skill_id,
    generate_location_id,
)


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

    skills = models.JSONField(
        default=list,
        blank=True,
        verbose_name='技能配置',
        db_comment='Skill 配置列表'
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


class MCPServer(models.Model):
    """MCP 服务配置"""

    TRANSPORT_TYPES = [
        ('stdio', 'STDIO'),
        ('sse', 'SSE'),
        ('streamableHttp', 'Streamable HTTP'),
    ]

    SOURCE_TYPES = [
        ('system', '系统扫描'),
        ('external', '外部接入'),
    ]

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_mcp_server_id,
        verbose_name='MCP 服务ID',
        db_comment='MCP 服务ID'
    )

    name = models.CharField(max_length=80, unique=True, verbose_name='MCP 名称', db_comment='MCP 名称')
    transport = models.CharField(max_length=20, choices=TRANSPORT_TYPES, default='stdio', verbose_name='传输方式', db_comment='传输方式')
    command = models.CharField(max_length=255, blank=True, default='', verbose_name='启动命令', db_comment='启动命令')
    args = models.JSONField(default=list, blank=True, verbose_name='命令参数', db_comment='命令参数')
    url = models.CharField(max_length=255, blank=True, default='', verbose_name='服务 URL', db_comment='服务 URL')
    headers = models.JSONField(default=dict, blank=True, verbose_name='请求头', db_comment='请求头')
    env = models.JSONField(default=dict, blank=True, verbose_name='环境变量', db_comment='环境变量')
    source = models.CharField(max_length=20, choices=SOURCE_TYPES, default='external', verbose_name='来源', db_comment='来源')
    enabled = models.BooleanField(default=True, verbose_name='是否启用', db_comment='是否启用')
    description = models.CharField(max_length=200, blank=True, default='', verbose_name='描述', db_comment='描述')
    tools = models.JSONField(default=list, blank=True, verbose_name='Tool 配置', db_comment='MCP Tool 配置列表')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'sys_mcp_server'
        db_table_comment = 'MCP 服务配置表'
        verbose_name = 'MCP 服务'
        verbose_name_plural = verbose_name
        ordering = ['source', 'name']

    def __str__(self):
        return self.name


class Skill(models.Model):
    """SkillHub 或本地技能配置"""

    SOURCE_TYPES = [
        ('skillhub', 'SkillHub'),
        ('local', '本地导入'),
        ('built_in', '内置技能'),
    ]

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_skill_id,
        verbose_name='技能ID',
        db_comment='技能ID'
    )
    name = models.CharField(max_length=80, unique=True, verbose_name='技能名称', db_comment='技能名称')
    description = models.CharField(max_length=255, blank=True, default='', verbose_name='描述', db_comment='技能描述')
    version = models.CharField(max_length=40, blank=True, default='', verbose_name='版本', db_comment='技能版本')
    source = models.CharField(max_length=20, choices=SOURCE_TYPES, default='skillhub', verbose_name='来源', db_comment='技能来源')
    skill_key = models.CharField(max_length=80, blank=True, default='', verbose_name='技能键', db_comment='系统内置技能键')
    entry = models.CharField(max_length=255, blank=True, default='', verbose_name='入口', db_comment='SkillHub URL、本地包路径或 manifest 入口')
    prompt = models.TextField(blank=True, default='', verbose_name='提示词', db_comment='技能提示词')
    enabled = models.BooleanField(default=True, verbose_name='是否启用', db_comment='是否启用')
    available_in_chat = models.BooleanField(default=False, verbose_name='提供给 AI 对话', db_comment='是否可在 AI Chat 中装载')
    is_system = models.BooleanField(default=False, verbose_name='系统技能', db_comment='是否为系统内置技能')
    manifest = models.JSONField(default=dict, blank=True, verbose_name='Manifest', db_comment='技能 manifest')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'sys_skill'
        db_table_comment = '技能配置表'
        verbose_name = '技能'
        verbose_name_plural = verbose_name
        ordering = ['source', 'name']

    def __str__(self):
        return self.name


class AgentTask(models.Model):
    """Agent 任务配置"""

    SCHEDULE_TYPES = [
        ('daily', '每天'),
        ('weekly', '每周'),
        ('monthly', '每月'),
        ('interval', '间隔'),
    ]

    OUTPUT_TYPES = [
        ('collection', '指定文集'),
        ('memos', 'Memos'),
    ]

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_agent_task_id,
        verbose_name='任务ID',
        db_comment='任务ID'
    )
    name = models.CharField(max_length=100, verbose_name='任务名称', db_comment='任务名称')
    agent = models.ForeignKey(
        Agent,
        related_name='tasks',
        on_delete=models.CASCADE,
        verbose_name='执行 Agent',
        db_comment='执行 Agent ID'
    )
    trigger = models.CharField(max_length=40, default='定时任务', verbose_name='触发方式', db_comment='触发方式')
    schedule = models.CharField(max_length=80, blank=True, default='', verbose_name='执行周期展示', db_comment='执行周期展示')
    schedule_type = models.CharField(max_length=20, choices=SCHEDULE_TYPES, default='daily', verbose_name='执行周期类型', db_comment='执行周期类型')
    schedule_time = models.CharField(max_length=10, blank=True, default='09:00', verbose_name='执行时间', db_comment='执行时间 HH:mm')
    schedule_weekday = models.CharField(max_length=2, blank=True, default='1', verbose_name='执行星期', db_comment='执行星期 0-6')
    schedule_month_day = models.CharField(max_length=2, blank=True, default='1', verbose_name='执行日期', db_comment='每月执行日期')
    interval_minutes = models.PositiveIntegerField(default=60, verbose_name='间隔分钟', db_comment='间隔执行分钟数')
    output = models.CharField(max_length=20, choices=OUTPUT_TYPES, default='collection', verbose_name='输出位置', db_comment='输出位置')
    target_collection_id = models.CharField(max_length=40, blank=True, default='', verbose_name='目标文集ID', db_comment='目标文集ID')
    target_collection_title = models.CharField(max_length=100, blank=True, default='', verbose_name='目标文集名称', db_comment='目标文集名称')
    enabled = models.BooleanField(default=True, verbose_name='是否启用', db_comment='是否启用')
    prompt = models.TextField(blank=True, default='', verbose_name='任务提示词', db_comment='任务提示词')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'sys_agent_task'
        db_table_comment = 'Agent 任务配置表'
        verbose_name = 'Agent 任务'
        verbose_name_plural = verbose_name
        ordering = ['-updated_at']

    def __str__(self):
        return self.name


class AgentRunRecord(models.Model):
    """Agent 任务执行记录"""

    STATUS_TYPES = [
        ('success', '成功'),
        ('failed', '失败'),
        ('running', '执行中'),
    ]

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_agent_run_id,
        verbose_name='执行记录ID',
        db_comment='执行记录ID'
    )
    task = models.ForeignKey(
        AgentTask,
        related_name='run_records',
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        verbose_name='任务',
        db_comment='任务ID'
    )
    task_name = models.CharField(max_length=100, verbose_name='任务名称', db_comment='任务名称快照')
    agent = models.ForeignKey(
        Agent,
        related_name='run_records',
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        verbose_name='执行 Agent',
        db_comment='执行 Agent ID'
    )
    agent_name = models.CharField(max_length=50, blank=True, default='', verbose_name='Agent 名称', db_comment='Agent 名称快照')
    trigger = models.CharField(max_length=40, default='定时任务', verbose_name='触发方式', db_comment='触发方式')
    status = models.CharField(max_length=20, choices=STATUS_TYPES, default='running', verbose_name='状态', db_comment='执行状态')
    duration = models.CharField(max_length=40, blank=True, default='', verbose_name='耗时', db_comment='耗时展示')
    summary = models.CharField(max_length=255, blank=True, default='', verbose_name='摘要', db_comment='执行摘要')
    started_at = models.DateTimeField(default=timezone.now, verbose_name='开始时间', db_comment='开始时间')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'sys_agent_run_record'
        db_table_comment = 'Agent 任务执行记录表'
        verbose_name = 'Agent 执行记录'
        verbose_name_plural = verbose_name
        ordering = ['-started_at', '-created_at']

    def __str__(self):
        return f"{self.task_name} - {self.status}"


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
