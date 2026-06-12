# system_settings/models.py
from django.db import models
from django.utils import timezone

from utils.id_generator import (
    generate_provider_id,
    generate_model_id,
    generate_agent_id,
    generate_agent_conversation_id,
    generate_agent_im_message_id,
    generate_agent_im_session_id,
    generate_agent_long_term_memory_id,
    generate_agent_short_term_memory_id,
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

    feishu_im_enabled = models.BooleanField(
        default=False,
        verbose_name='启用飞书 IM',
        db_comment='是否启用飞书 IM 消息通道'
    )

    feishu_app_id = models.CharField(
        max_length=80,
        blank=True,
        default='',
        verbose_name='飞书 App ID',
        db_comment='飞书开放平台应用 App ID'
    )

    feishu_app_secret = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='飞书 App Secret',
        db_comment='飞书开放平台应用 App Secret'
    )

    feishu_verification_token = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='飞书 Verification Token',
        db_comment='飞书事件订阅 Verification Token'
    )

    feishu_encrypt_key = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='飞书 Encrypt Key',
        db_comment='飞书事件订阅 Encrypt Key'
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


class AgentIMMessage(models.Model):
    """Agent IM 通道消息处理记录，用于事件幂等和排障"""

    PLATFORM_FEISHU = 'feishu'
    STATUS_RECEIVED = 'received'
    STATUS_REPLIED = 'replied'
    STATUS_FAILED = 'failed'
    STATUS_DUPLICATE = 'duplicate'

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_agent_im_message_id,
        verbose_name='IM 消息记录 ID',
        db_comment='IM 消息记录 ID'
    )

    agent = models.ForeignKey(
        Agent,
        related_name='im_messages',
        on_delete=models.CASCADE,
        verbose_name='Agent',
        db_comment='Agent ID'
    )

    platform = models.CharField(max_length=20, default=PLATFORM_FEISHU, verbose_name='平台', db_comment='IM 平台')
    event_id = models.CharField(max_length=100, blank=True, default='', verbose_name='事件 ID', db_comment='平台事件 ID')
    message_id = models.CharField(max_length=120, verbose_name='消息 ID', db_comment='平台消息 ID')
    chat_id = models.CharField(max_length=120, blank=True, default='', verbose_name='会话 ID', db_comment='平台会话 ID')
    sender_id = models.CharField(max_length=120, blank=True, default='', verbose_name='发送者 ID', db_comment='平台发送者 ID')
    conversation_id = models.CharField(max_length=40, blank=True, default='', verbose_name='对话线程 ID', db_comment='Agent IM 对话线程 ID')
    message_type = models.CharField(max_length=40, blank=True, default='', verbose_name='消息类型', db_comment='平台消息类型')
    content = models.TextField(blank=True, default='', verbose_name='消息内容', db_comment='用户消息内容')
    response = models.TextField(blank=True, default='', verbose_name='Agent 回复', db_comment='Agent 回复内容')
    status = models.CharField(max_length=20, default=STATUS_RECEIVED, verbose_name='处理状态', db_comment='处理状态')
    error = models.TextField(blank=True, default='', verbose_name='错误信息', db_comment='处理失败错误信息')
    raw_event = models.JSONField(default=dict, blank=True, verbose_name='原始事件', db_comment='原始事件体')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'sys_agent_im_message'
        db_table_comment = 'Agent IM 消息处理记录表'
        verbose_name = 'Agent IM 消息'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['platform', 'message_id'],
                name='uniq_agent_im_platform_message',
            )
        ]


class AgentIMSession(models.Model):
    """Agent IM 会话摘要，用于长上下文压缩和恢复"""

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_agent_im_session_id,
        verbose_name='IM 会话 ID',
        db_comment='IM 会话 ID'
    )

    agent = models.ForeignKey(
        Agent,
        related_name='im_sessions',
        on_delete=models.CASCADE,
        verbose_name='Agent',
        db_comment='Agent ID'
    )

    platform = models.CharField(max_length=20, default=AgentIMMessage.PLATFORM_FEISHU, verbose_name='平台', db_comment='IM 平台')
    chat_id = models.CharField(max_length=120, verbose_name='会话 ID', db_comment='平台会话 ID')
    sender_id = models.CharField(max_length=120, blank=True, default='', verbose_name='发送者 ID', db_comment='平台发送者 ID')
    conversation_id = models.CharField(
        max_length=40,
        default=generate_agent_conversation_id,
        verbose_name='当前对话线程 ID',
        db_comment='当前 Agent IM 对话线程 ID'
    )
    summary = models.TextField(blank=True, default='', verbose_name='会话摘要', db_comment='早期历史压缩摘要')
    summary_until = models.DateTimeField(blank=True, null=True, verbose_name='摘要截止时间', db_comment='已压缩摘要覆盖到的消息创建时间')
    summary_token_estimate = models.IntegerField(default=0, verbose_name='摘要 Token 估算', db_comment='摘要 Token 粗略估算')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'sys_agent_im_session'
        db_table_comment = 'Agent IM 会话摘要表'
        verbose_name = 'Agent IM 会话'
        verbose_name_plural = verbose_name
        ordering = ['-updated_at']
        constraints = [
            models.UniqueConstraint(
                fields=['agent', 'platform', 'chat_id', 'sender_id'],
                name='uniq_agent_im_session_user',
            )
        ]


class AgentLongTermMemory(models.Model):
    """Agent 长期记忆，可由系统晋升或用户手动维护"""

    TYPE_PREFERENCE = 'preference'
    TYPE_FACT = 'fact'
    TYPE_PROJECT = 'project'
    TYPE_INSTRUCTION = 'instruction'
    TYPE_OTHER = 'other'
    MEMORY_TYPES = [
        (TYPE_PREFERENCE, '偏好'),
        (TYPE_FACT, '事实'),
        (TYPE_PROJECT, '项目'),
        (TYPE_INSTRUCTION, '指令'),
        (TYPE_OTHER, '其他'),
    ]

    STATUS_ACTIVE = 'active'
    STATUS_ARCHIVED = 'archived'
    STATUS_TYPES = [
        (STATUS_ACTIVE, '有效'),
        (STATUS_ARCHIVED, '已归档'),
    ]

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_agent_long_term_memory_id,
        verbose_name='长期记忆 ID',
        db_comment='长期记忆 ID'
    )
    agent = models.ForeignKey(
        Agent,
        related_name='long_term_memories',
        on_delete=models.CASCADE,
        verbose_name='Agent',
        db_comment='Agent ID'
    )
    scope = models.CharField(max_length=20, default='user', verbose_name='记忆范围', db_comment='记忆范围')
    chat_id = models.CharField(max_length=120, blank=True, default='', verbose_name='会话 ID', db_comment='平台会话 ID')
    sender_id = models.CharField(max_length=120, blank=True, default='', verbose_name='发送者 ID', db_comment='平台发送者 ID')
    memory_type = models.CharField(max_length=20, choices=MEMORY_TYPES, default=TYPE_OTHER, verbose_name='记忆类型', db_comment='记忆类型')
    title = models.CharField(max_length=120, blank=True, default='', verbose_name='标题', db_comment='记忆标题')
    content = models.TextField(verbose_name='内容', db_comment='记忆内容')
    confidence = models.FloatField(default=0.8, verbose_name='置信度', db_comment='记忆置信度')
    source_count = models.PositiveIntegerField(default=1, verbose_name='来源次数', db_comment='来源次数')
    status = models.CharField(max_length=20, choices=STATUS_TYPES, default=STATUS_ACTIVE, verbose_name='状态', db_comment='状态')
    last_recalled_at = models.DateTimeField(blank=True, null=True, verbose_name='最后召回时间', db_comment='最后召回时间')
    metadata = models.JSONField(default=dict, blank=True, verbose_name='元数据', db_comment='元数据')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'sys_agent_long_term_memory'
        db_table_comment = 'Agent 长期记忆表'
        verbose_name = 'Agent 长期记忆'
        verbose_name_plural = verbose_name
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['agent', 'sender_id', 'status'], name='idx_agent_ltm_user_status'),
            models.Index(fields=['agent', 'chat_id', 'status'], name='idx_agent_ltm_chat_status'),
        ]


class AgentShortTermMemory(models.Model):
    """Agent 短期向量记忆元数据，向量内容存储在 ChromaDB"""

    id = models.CharField(
        max_length=40,
        primary_key=True,
        default=generate_agent_short_term_memory_id,
        verbose_name='短期记忆 ID',
        db_comment='短期记忆 ID'
    )
    agent = models.ForeignKey(
        Agent,
        related_name='short_term_memories',
        on_delete=models.CASCADE,
        verbose_name='Agent',
        db_comment='Agent ID'
    )
    chat_id = models.CharField(max_length=120, blank=True, default='', verbose_name='会话 ID', db_comment='平台会话 ID')
    sender_id = models.CharField(max_length=120, blank=True, default='', verbose_name='发送者 ID', db_comment='平台发送者 ID')
    conversation_id = models.CharField(max_length=40, blank=True, default='', verbose_name='对话线程 ID', db_comment='Agent IM 对话线程 ID')
    source_message = models.ForeignKey(
        AgentIMMessage,
        related_name='short_term_memories',
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        verbose_name='来源消息',
        db_comment='来源 IM 消息 ID'
    )
    content = models.TextField(verbose_name='内容', db_comment='短期记忆内容')
    expires_at = models.DateTimeField(verbose_name='过期时间', db_comment='过期时间')
    recall_count = models.PositiveIntegerField(default=0, verbose_name='召回次数', db_comment='召回次数')
    best_score = models.FloatField(default=0, verbose_name='最佳召回分数', db_comment='最佳召回分数')
    query_sources = models.JSONField(default=list, blank=True, verbose_name='查询来源', db_comment='查询来源列表')
    last_recalled_at = models.DateTimeField(blank=True, null=True, verbose_name='最后召回时间', db_comment='最后召回时间')
    promoted_at = models.DateTimeField(blank=True, null=True, verbose_name='晋升时间', db_comment='晋升为长期记忆时间')
    metadata = models.JSONField(default=dict, blank=True, verbose_name='元数据', db_comment='元数据')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间', db_comment='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间', db_comment='更新时间')

    class Meta:
        db_table = 'sys_agent_short_term_memory'
        db_table_comment = 'Agent 短期记忆表'
        verbose_name = 'Agent 短期记忆'
        verbose_name_plural = verbose_name
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['agent', 'sender_id', 'expires_at'], name='idx_agent_stm_user_expire'),
            models.Index(fields=['agent', 'chat_id', 'expires_at'], name='idx_agent_stm_chat_expire'),
            models.Index(fields=['promoted_at', 'expires_at'], name='idx_agent_stm_promote_exp'),
        ]


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
    available_in_chat = models.BooleanField(default=False, verbose_name='提供给 AI 对话', db_comment='是否可在 AI Chat 中装载')
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

    NOTIFY_PLATFORMS = [
        ('feishu', '飞书机器人'),
    ]

    EXECUTION_MODES = [
        ('parallel', '并行执行'),
        ('serial', '串行执行'),
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
    agent_ids = models.JSONField(default=list, blank=True, verbose_name='执行 Agent 列表', db_comment='多 Agent 执行 ID 列表')
    execution_mode = models.CharField(max_length=20, choices=EXECUTION_MODES, default='parallel', verbose_name='执行模式', db_comment='多 Agent 执行模式')
    trigger = models.CharField(max_length=40, default='定时任务', verbose_name='触发方式', db_comment='触发方式')
    schedule = models.CharField(max_length=80, blank=True, default='', verbose_name='执行周期展示', db_comment='执行周期展示')
    schedule_type = models.CharField(max_length=20, choices=SCHEDULE_TYPES, default='daily', verbose_name='执行周期类型', db_comment='执行周期类型')
    schedule_time = models.CharField(max_length=10, blank=True, default='09:00', verbose_name='执行时间', db_comment='执行时间 HH:mm')
    schedule_weekday = models.CharField(max_length=2, blank=True, default='1', verbose_name='执行星期', db_comment='执行星期 0-6')
    schedule_month_day = models.CharField(max_length=2, blank=True, default='1', verbose_name='执行日期', db_comment='每月执行日期')
    interval_minutes = models.PositiveIntegerField(default=60, verbose_name='间隔分钟', db_comment='间隔执行分钟数')
    enabled = models.BooleanField(default=True, verbose_name='是否启用', db_comment='是否启用')
    prompt = models.TextField(blank=True, default='', verbose_name='任务提示词', db_comment='任务提示词')
    notify_enabled = models.BooleanField(default=False, verbose_name='是否通知', db_comment='任务完成后是否发送 Webhook 通知')
    notify_platform = models.CharField(max_length=20, choices=NOTIFY_PLATFORMS, default='feishu', verbose_name='通知平台', db_comment='Webhook 通知平台')
    notify_webhook_url = models.CharField(max_length=500, blank=True, default='', verbose_name='通知 Webhook', db_comment='Webhook 地址')
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
    agent_runs = models.JSONField(default=list, blank=True, verbose_name='Agent 执行明细', db_comment='多 Agent 执行明细')
    trigger = models.CharField(max_length=40, default='定时任务', verbose_name='触发方式', db_comment='触发方式')
    status = models.CharField(max_length=20, choices=STATUS_TYPES, default='running', verbose_name='状态', db_comment='执行状态')
    duration = models.CharField(max_length=40, blank=True, default='', verbose_name='耗时', db_comment='耗时展示')
    summary = models.CharField(max_length=255, blank=True, default='', verbose_name='摘要', db_comment='执行摘要')
    steps = models.JSONField(default=list, blank=True, verbose_name='执行步骤', db_comment='执行步骤')
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
