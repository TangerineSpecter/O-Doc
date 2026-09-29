from urllib.parse import urlsplit
from decimal import Decimal
from django.db import transaction

from rest_framework import serializers
from .models import Agent, AgentActivity, AgentLongTermMemory, AgentRunRecord, AgentTask, AIProvider, AIModel, MCPServer, Skill, SystemSetting, GeoLocation
from .agent_world.scope_validation import PostScopeValidation
from .agent_world.farm_gate import guarded as farm_guarded

class AIModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIModel
        fields = ['id', 'name', 'type', 'provider']
        read_only_fields = ['id']
        # provider 字段在嵌套时可选，但在单独创建时必填
        extra_kwargs = {'provider': {'required': False}}

class AIProviderSerializer(serializers.ModelSerializer):
    # 嵌套显示 models，read_only=True 表示更新 Provider 时不直接覆盖整个 models 列表，而是通过单独接口管理
    models = AIModelSerializer(many=True, read_only=True)

    class Meta:
        model = AIProvider
        fields = ['id', 'name', 'type', 'base_url', 'api_key', 'models']
        read_only_fields = ['id']

    def validate(self, attrs):
        provider_type = attrs.get('type', self.instance.type if self.instance else None)
        if provider_type != 'NewAPI':
            return attrs
        base_url = str(attrs.get('base_url', self.instance.base_url if self.instance else '') or '').strip().rstrip('/')
        parsed = urlsplit(base_url)
        if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or (parsed.path and not parsed.path.endswith('/v1'))):
            raise serializers.ValidationError({'baseUrl': 'New API 地址应填写实例地址或以 /v1 结尾的 API 地址'})
        attrs['base_url'] = base_url if parsed.path else f'{base_url}/v1'
        return attrs

class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ['key', 'value']


class AgentSerializer(PostScopeValidation, serializers.ModelSerializer):
    stamina = serializers.SerializerMethodField()
    profession_name = serializers.CharField(source="profession.name", read_only=True, default="")
    model_detail = AIModelSerializer(source='model', read_only=True)

    class Meta:
        model = Agent
        fields = [
            'id',
            'name',
            'avatar',
            'full_body_image',
            'model',
            'model_detail',
            'prompt',
            'money', 'profession', 'profession_name',
            'post_collection_ids', 'post_category_ids', 'stamina',
            'mcp_servers',
            'skills',
            'feishu_im_enabled',
            'feishu_app_id',
            'feishu_app_secret',
            'feishu_verification_token',
            'feishu_encrypt_key',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'model_detail', 'money', 'created_at', 'updated_at']

    def get_stamina(self, obj):
        from .agent_world.execution import stamina
        return str(stamina(obj).quantize(Decimal('0.01')))

    @transaction.atomic
    def create(self, validated_data):
        return super().create(validated_data)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Agent 名称不能为空")
        return value

    def validate_full_body_image(self, value):
        from assets.models import Asset
        from utils.resource_assets import extract_resource_id_from_view_url, get_resource_view_url

        value = value.strip()
        if not value:
            return ''
        resource_id = extract_resource_id_from_view_url(value)
        if not resource_id or value != get_resource_view_url(resource_id):
            raise serializers.ValidationError('请选择已上传的形象参考图')
        request = self.context.get('request')
        if request is None or not request.user.is_authenticated:
            raise serializers.ValidationError('请登录后配置形象参考图')
        from utils.drf_utils import get_current_user_identifier
        if not Asset.objects.filter(pk=resource_id, file_type='image', is_valid=True,
                                    uploader=get_current_user_identifier(request)).exists():
            raise serializers.ValidationError('形象参考图不存在或不属于当前用户')
        return value

    def validate_mcp_servers(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("MCP 配置必须是数组")
        return value

    def validate_skills(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("技能配置必须是数组")
        skill_ids = [item for item in value if isinstance(item, str) and item]
        if len(skill_ids) != len(value):
            raise serializers.ValidationError("技能配置必须是技能 ID 数组")
        existing_ids = set(Skill.objects.filter(id__in=skill_ids).values_list('id', flat=True))
        missing_ids = [skill_id for skill_id in skill_ids if skill_id not in existing_ids]
        if missing_ids:
            raise serializers.ValidationError(f"技能不存在：{', '.join(missing_ids)}")
        return value

    def validate(self, attrs):
        feishu_enabled = attrs.get(
            'feishu_im_enabled',
            getattr(self.instance, 'feishu_im_enabled', False)
        )
        if not feishu_enabled:
            return attrs

        required_fields = {
            'feishu_app_id': '请填写飞书 App ID',
            'feishu_app_secret': '请填写飞书 App Secret',
        }
        errors = {}
        for field, message in required_fields.items():
            value = attrs.get(field, getattr(self.instance, field, ''))
            if not str(value or '').strip():
                errors[field] = message
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class AgentLongTermMemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentLongTermMemory
        fields = [
            'id',
            'agent',
            'scope',
            'chat_id',
            'sender_id',
            'memory_type',
            'title',
            'content',
            'confidence',
            'source_count',
            'status',
            'last_recalled_at',
            'metadata',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'agent', 'source_count', 'last_recalled_at', 'metadata', 'created_at', 'updated_at']

    def validate_memory_type(self, value):
        valid_types = {choice[0] for choice in AgentLongTermMemory.MEMORY_TYPES}
        if value not in valid_types:
            raise serializers.ValidationError("记忆类型无效")
        return value

    def validate_status(self, value):
        valid_statuses = {choice[0] for choice in AgentLongTermMemory.STATUS_TYPES}
        if value not in valid_statuses:
            raise serializers.ValidationError("记忆状态无效")
        return value

    def validate_title(self, value):
        return str(value or '').strip()

    def validate_content(self, value):
        value = str(value or '').strip()
        if not value:
            raise serializers.ValidationError("记忆内容不能为空")
        return value


class MCPServerSerializer(serializers.ModelSerializer):
    class Meta:
        model = MCPServer
        fields = [
            'id',
            'name',
            'transport',
            'command',
            'args',
            'url',
            'headers',
            'env',
            'source',
            'enabled',
            'available_in_chat',
            'description',
            'tools',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("MCP 名称不能为空")
        return value

    def validate_args(self, value):
        if value in (None, ''):
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split('\n') if item.strip()]
        if not isinstance(value, list):
            raise serializers.ValidationError("命令参数必须是数组")
        return value

    def validate_env(self, value):
        if value in (None, ''):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("环境变量必须是对象")
        return value

    def validate_headers(self, value):
        if value in (None, ''):
            return {}
        if isinstance(value, list):
            header_items = []
            for item in value:
                if not isinstance(item, dict) or item.get('enabled') is False:
                    continue
                header_items.append((item.get('key'), item.get('value')))
        elif isinstance(value, dict):
            header_items = value.items()
        else:
            raise serializers.ValidationError("请求头必须是对象")
        normalized = {}
        for key, header_value in header_items:
            header_key = self._normalize_header_key(key)
            if not header_key:
                continue
            normalized_value = str(header_value or '').strip()
            if header_key.lower() == 'authorization':
                if normalized_value.lower().startswith('bearer '):
                    normalized_value = f"Bearer {normalized_value[7:].strip()}"
                elif normalized_value.lower().startswith('tvly-'):
                    normalized_value = f"Bearer {normalized_value}"
            normalized[header_key] = normalized_value
        return normalized

    @staticmethod
    def _normalize_header_key(value):
        raw_key = str(value or '').strip()
        compact_key = raw_key.lower().lstrip('_').replace('_', '')
        if compact_key == 'authorization':
            return 'Authorization'
        if compact_key in ('content-type', 'contenttype'):
            return 'Content-Type'
        if compact_key in ('mcp-protocol-version', 'mcpprotocolversion'):
            return 'MCP-Protocol-Version'
        return raw_key.lstrip('_')

    def validate_tools(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Tool 配置必须是数组")
        normalized = []
        for item in value:
            if not isinstance(item, dict):
                continue
            name = str(item.get('name') or '').strip()
            if not name:
                continue
            normalized.append({
                'name': name,
                'description': str(item.get('description') or '').strip(),
                'enabled': bool(item.get('enabled', True)),
            })
        return normalized


class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = [
            'id',
            'name',
            'description',
            'version',
            'source',
            'skill_key',
            'entry',
            'prompt',
            'enabled',
            'available_in_chat',
            'is_system',
            'manifest',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'is_system', 'created_at', 'updated_at']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("技能名称不能为空")
        return value

    def validate_manifest(self, value):
        if value in (None, ''):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Manifest 必须是对象")
        return value


class AgentRandomAllocationsField(serializers.Field):
    """以列表传输 Agent ID，避免驼峰转换器修改字典中的动态 ID 键。"""

    def to_representation(self, value):
        return [{'agent_id': agent_id, 'count': count} for agent_id, count in value.items()]

    def to_internal_value(self, data):
        if not isinstance(data, list):
            raise serializers.ValidationError('Agent 次数分配必须为列表')
        result = {}
        for item in data:
            if not isinstance(item, dict) or not isinstance(item.get('agent_id'), str) or not item['agent_id']:
                raise serializers.ValidationError('请提供有效的 Agent ID')
            if item['agent_id'] in result or type(item.get('count')) is not int or item['count'] < 0:
                raise serializers.ValidationError('Agent 不可重复，分配次数须为非负整数')
            result[item['agent_id']] = item['count']
        return result


class AgentTaskSerializer(PostScopeValidation, serializers.ModelSerializer):
    world_progress = serializers.SerializerMethodField()
    random_allocations = AgentRandomAllocationsField(required=False)
    random_count = serializers.IntegerField(min_value=1, max_value=10000, required=False)
    random_progress = serializers.SerializerMethodField()
    agent_name = serializers.CharField(source='agent.name', read_only=True)
    agents = serializers.ListField(
        child=serializers.CharField(),
        source='agent_ids',
        required=False,
        allow_empty=False,
    )
    agent_names = serializers.SerializerMethodField()

    class Meta:
        model = AgentTask
        fields = [
            'id',
            'name',
            'task_kind', 'publish_config', 'travel_config', 'farm_config', 'market_config', 'investment_config', 'post_collection_ids', 'post_category_ids', 'world_progress',
            'agent',
            'agent_name',
            'agents',
            'agent_names',
            'execution_mode',
            'trigger',
            'schedule',
            'schedule_type',
            'schedule_mode', 'random_period', 'random_count', 'random_allocations', 'random_progress',
            'schedule_time',
            'schedule_weekday',
            'schedule_month_day',
            'interval_minutes',
            'enabled',
            'prompt',
            'notify_enabled',
            'notify_platform',
            'notify_webhook_url',
            'followup_enabled',
            'followup_agent',
            'followup_action',
            'followup_prompt',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'agent_name', 'agent_names', 'created_at', 'updated_at']

    def get_agent_names(self, obj):
        ids = obj.agent_ids if isinstance(obj.agent_ids, list) else []
        if not ids and obj.agent_id:
            ids = [obj.agent_id]
        if not ids:
            return []
        agents = {agent.id: agent.name for agent in Agent.objects.filter(id__in=ids)}
        return [agents[agent_id] for agent_id in ids if agent_id in agents]

    def get_random_progress(self, obj):
        if obj.task_kind in ('post_interaction', 'post_publish', 'travel', 'farm', 'market', 'investment'):
            return None
        from .agent_random_schedule import progress
        return progress(obj)

    def get_world_progress(self, obj):
        if obj.task_kind not in ('post_interaction', 'post_publish', 'travel', 'farm', 'market', 'investment'):
            return None
        from .agent_world.action_schedule import progress
        return progress(obj)

    @farm_guarded
    @transaction.atomic
    def create(self, validated_data):
        if validated_data.get('task_kind') in ('post_interaction', 'post_publish', 'travel', 'farm', 'market', 'investment'):
            from .agent_world.builtin_tasks import POST_INTERACTION_ID, POST_PUBLISH_ID, TRAVEL_ID, FARM_ID, MARKET_ID, INVESTMENT_ID
            kind = validated_data['task_kind']
            builtin_id = {'post_publish': POST_PUBLISH_ID, 'post_interaction': POST_INTERACTION_ID, 'travel': TRAVEL_ID, 'farm': FARM_ID, 'market': MARKET_ID, 'investment': INVESTMENT_ID}[kind]
            # 兼容此前保存的配置；首次保存采用固定标识，重复提交不创建第二个入口。
            candidates = AgentTask.objects.select_for_update().filter(task_kind=kind)
            if kind == 'investment':
                import hashlib
                owner = validated_data['investment_config']['owner_id']
                # Keep the owner-scoped ID within AgentTask.id's 40-character limit.
                builtin_id = 'builtin-invest:' + hashlib.sha256(owner.encode()).hexdigest()[:24]
                candidates = candidates.filter(investment_config__owner_id=owner)
            if kind == 'market':
                import hashlib
                owner = validated_data['market_config']['owner_id']
                builtin_id = 'builtin-market:' + hashlib.sha256(owner.encode()).hexdigest()[:24]
                candidates = candidates.filter(market_config__owner_id=owner)
            task = candidates.first()
            if task is None:
                task, created = AgentTask.objects.get_or_create(pk=builtin_id, defaults=validated_data)
                if not created:
                    task = super().update(task, validated_data)
            else:
                task = super().update(task, validated_data)
        else:
            task = super().create(validated_data)
        self.initialize_task(task)
        return task

    @farm_guarded
    @transaction.atomic
    def update(self, instance, validated_data):
        task = super().update(instance, validated_data)
        self.initialize_task(task)
        return task

    @staticmethod
    def initialize_task(task):
        if task.task_kind == 'investment':
            from .agent_world.investment_service import validate_agents, account_for
            from .agent_world.investment_sync import checkpoint
            ids = task.agent_ids or [task.agent_id]
            try:
                validate_agents(task.investment_config['owner_id'], ids)
                for agent in Agent.objects.filter(pk__in=ids):
                    account_for(task.investment_config['owner_id'], agent)
                checkpoint(task.investment_config['owner_id'])
            except ValueError as exc:
                raise serializers.ValidationError({'agents':str(exc)}) from exc
        if task.task_kind == 'market':
            from .agent_world.market_sessions import validate_market_agents, cleanup
            try:
                validate_market_agents(task.market_config['owner_id'], task.agent_ids or [task.agent_id])
            except ValueError as exc:
                raise serializers.ValidationError({'agents':str(exc)}) from exc
            cleanup()
        if task.task_kind in ('post_interaction', 'post_publish', 'travel', 'farm', 'market', 'investment'):
            from .agent_world.action_schedule import initialize
            initialize(task)
            if task.task_kind == 'farm':
                from .agent_world.farm_service import ensure_farms
                from .agent_world.investment_service import validate_agents
                try:
                    validate_agents(task.farm_config['owner_id'], task.agent_ids or [task.agent_id])
                except ValueError as exc:
                    raise serializers.ValidationError({'agents':str(exc)}) from exc
                ensure_farms(task)
        else:
            from .agent_random_schedule import initialize_runtime
            initialize_runtime(task)

    def validate_random_count(self, value):
        if value < 1:
            raise serializers.ValidationError('执行次数必须为正整数')
        return value

    def validate_random_allocations(self, value):
        if not isinstance(value, dict) or any(type(count) is not int or count < 0 for count in value.values()):
            raise serializers.ValidationError('Agent 分配次数必须为非负整数')
        return value

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("任务名称不能为空")
        return value

    def validate_interval_minutes(self, value):
        if value < 1:
            raise serializers.ValidationError("间隔分钟必须大于 0")
        return value

    def validate(self, attrs):
        kind = attrs.get('task_kind', getattr(self.instance, 'task_kind', 'custom'))
        if self.instance and kind != self.instance.task_kind:
            raise serializers.ValidationError({'task_kind': '已有任务不能改变类型，请新建任务'})
        if kind in ('post_interaction', 'post_publish', 'travel', 'farm', 'market', 'investment'):
            from .agent_world.builtin_tasks import POST_INTERACTION_NAME, POST_PUBLISH_NAME, TRAVEL_NAME, FARM_NAME, MARKET_NAME, INVESTMENT_NAME
            attrs['name'] = {'post_publish': POST_PUBLISH_NAME, 'post_interaction': POST_INTERACTION_NAME, 'travel': TRAVEL_NAME, 'farm': FARM_NAME, 'market': MARKET_NAME, 'investment': INVESTMENT_NAME}[kind]
            if self.instance is None:
                attrs.setdefault('enabled', False)
            attrs.update(execution_mode='serial', random_allocations={}, followup_enabled=False, followup_agent=None)
            if attrs.get('trigger', getattr(self.instance, 'trigger', '定时任务')) not in ('定时任务', '手动执行'):
                raise serializers.ValidationError({'trigger': '系统任务仅支持自动调度或手动执行'})
            if attrs.get('schedule_mode', getattr(self.instance, 'schedule_mode', 'fixed')) == 'fixed':
                attrs['schedule_type'] = 'interval'
        if kind == 'investment':
            from utils.drf_utils import get_current_user_identifier
            request = self.context.get('request')
            previous = getattr(self.instance, 'investment_config', {})
            owner = get_current_user_identifier(request) if request else previous.get('owner_id')
            if not owner or (previous.get('owner_id') and previous['owner_id'] != owner):
                raise serializers.ValidationError({'investment_config':'投资任务需要有效的所属账号'})
            config = attrs.get('investment_config', previous)
            if not isinstance(config, dict):
                raise serializers.ValidationError({'investment_config':'投资配置必须为对象'})
            server_id = config.get('search_server_id', '')
            if server_id:
                from .agent_world.publish_config import search_server
                try: search_server({'search_server_id':server_id})
                except ValueError as exc: raise serializers.ValidationError({'investment_config':str(exc)}) from exc
            attrs['investment_config'] = {'owner_id':owner,'search_server_id':server_id}
            if self.instance is None: attrs.setdefault('interval_minutes',60)
        if kind == 'farm':
            from utils.drf_utils import get_current_user_identifier
            request = self.context.get('request')
            owner = get_current_user_identifier(request) if request else getattr(self.instance, 'farm_config', {}).get('owner_id')
            if not owner:
                raise serializers.ValidationError({'farm_config': '农场配置需要所属用户'})
            previous = getattr(self.instance, 'farm_config', {}).get('owner_id')
            if previous and owner != previous:
                raise serializers.ValidationError({'farm_config': '无权更改其他用户的农场任务'})
            attrs['farm_config'] = {'owner_id': owner}
            if self.instance is None:
                attrs.setdefault('interval_minutes', 30)
        if kind == 'market':
            from utils.drf_utils import get_current_user_identifier
            request = self.context.get('request')
            previous = getattr(self.instance, 'market_config', {}).get('owner_id')
            owner = get_current_user_identifier(request) if request else previous
            if not owner or (previous and owner != previous):
                raise serializers.ValidationError({'market_config': '市场任务需要有效的所属账号'})
            attrs['market_config'] = {'owner_id': owner}
            if self.instance is None:
                attrs.setdefault('interval_minutes', 60)
        if kind == 'travel' and self.instance is None:
            attrs.setdefault('schedule_mode', 'random')
            attrs.setdefault('random_period', 'weekly')
            attrs.setdefault('random_count', 1)
        if kind == 'post_publish':
            if self.instance is None:
                attrs.setdefault('schedule_mode', 'random')
                attrs.setdefault('random_period', 'daily')
                attrs.setdefault('random_count', 1)
            from .agent_world.publish_config import PublishConfigSerializer
            from utils.drf_utils import get_current_user_identifier
            request = self.context.get('request')
            saved_config = getattr(self.instance, 'publish_config', {})
            config_input = attrs.get('publish_config', saved_config)
            if self.instance and config_input == saved_config and attrs.get('enabled') is False:
                attrs['publish_config'] = saved_config
            else:
                config = PublishConfigSerializer(data=attrs.get('publish_config', getattr(self.instance, 'publish_config', {})),
                    context={'previous': getattr(self.instance, 'publish_config', {}),
                             'owner_id': get_current_user_identifier(request) if request else None})
                try:
                    config.is_valid(raise_exception=True)
                except ValueError as exc:
                    raise serializers.ValidationError({'publish_config': str(exc)}) from exc
                attrs['publish_config'] = config.validated_data
        if self.instance and attrs.get('schedule_mode', self.instance.schedule_mode) != self.instance.schedule_mode:
            attrs['world_state'] = {key: value for key, value in (self.instance.world_state or {}).items() if key != 'schedule'}
        agent_ids = attrs.get('agent_ids')
        selected_agent = attrs.get('agent') or getattr(self.instance, 'agent', None)

        if agent_ids is not None:
            cleaned_agent_ids = []
            for agent_id in agent_ids:
                agent_id = str(agent_id).strip()
                if agent_id and agent_id not in cleaned_agent_ids:
                    cleaned_agent_ids.append(agent_id)
            if not cleaned_agent_ids:
                raise serializers.ValidationError({"agents": "请至少选择一个 Agent"})
            existing_agents = list(Agent.objects.filter(id__in=cleaned_agent_ids))
            existing_ids = {agent.id for agent in existing_agents}
            missing_ids = [agent_id for agent_id in cleaned_agent_ids if agent_id not in existing_ids]
            if missing_ids:
                raise serializers.ValidationError({"agents": f"Agent 不存在：{', '.join(missing_ids)}"})
            attrs['agent_ids'] = cleaned_agent_ids
            first_agent = next(agent for agent in existing_agents if agent.id == cleaned_agent_ids[0])
            attrs['agent'] = first_agent
        elif selected_agent and not getattr(self.instance, 'agent_ids', None):
            attrs['agent_ids'] = [selected_agent.id]

        if kind == 'market':
            from .agent_world.market_sessions import validate_market_agents
            ids = attrs.get('agent_ids', getattr(self.instance, 'agent_ids', [])) or ([selected_agent.id] if selected_agent else [])
            try:
                validate_market_agents(attrs['market_config']['owner_id'], ids)
            except ValueError as exc:
                raise serializers.ValidationError({'agents':str(exc)}) from exc

        mode = attrs.get('schedule_mode', getattr(self.instance, 'schedule_mode', 'fixed'))
        if mode == 'random':
            trigger = attrs.get('trigger', getattr(self.instance, 'trigger', '定时任务'))
            if trigger != '定时任务':
                raise serializers.ValidationError({'schedule_mode': '周期随机仅适用于定时任务'})
            count = attrs.get('random_count', getattr(self.instance, 'random_count', 1))
            allocations = attrs.get('random_allocations', getattr(self.instance, 'random_allocations', {}))
            ids = attrs.get('agent_ids', getattr(self.instance, 'agent_ids', [])) or ([selected_agent.id] if selected_agent else [])
            execution_mode = attrs.get('execution_mode', getattr(self.instance, 'execution_mode', 'parallel'))
            if allocations and execution_mode == 'serial':
                if set(allocations) - set(ids):
                    raise serializers.ValidationError({'random_allocations': '分配包含未选择的 Agent'})
                if not 0 < sum(allocations.values()) <= count:
                    raise serializers.ValidationError({'random_allocations': '分配总次数必须大于 0 且不能超过任务总次数'})

        if kind == 'travel':
            from .agent_world.travel_config import TravelConfigSerializer
            from utils.drf_utils import get_current_user_identifier
            request = self.context.get('request')
            saved = getattr(self.instance, 'travel_config', {})
            if self.instance and attrs.get('enabled') is False and attrs.get('travel_config', saved) == saved:
                attrs['travel_config'] = saved
            else:
                config = TravelConfigSerializer(data=attrs.get('travel_config', saved), context={
                    'previous': saved, 'owner_id': get_current_user_identifier(request) if request else None,
                    'enabled': attrs.get('enabled', getattr(self.instance, 'enabled', False)),
                    'agent_ids': attrs.get('agent_ids', getattr(self.instance, 'agent_ids', []))})
                config.is_valid(raise_exception=True)
                attrs['travel_config'] = config.validated_data
        notify_enabled = attrs.get('notify_enabled', getattr(self.instance, 'notify_enabled', False))
        notify_webhook_url = attrs.get('notify_webhook_url', getattr(self.instance, 'notify_webhook_url', ''))
        if notify_enabled and not notify_webhook_url:
            raise serializers.ValidationError({"notify_webhook_url": "请填写 Webhook 地址"})

        followup_enabled = attrs.get('followup_enabled', getattr(self.instance, 'followup_enabled', False))
        followup_agent = attrs.get('followup_agent', getattr(self.instance, 'followup_agent', None))
        selected_ids = attrs.get('agent_ids', getattr(self.instance, 'agent_ids', [])) or []
        if followup_enabled and not followup_agent:
            raise serializers.ValidationError({'followup_agent': '请选择后续 Agent'})
        if followup_enabled and followup_agent and followup_agent.id in selected_ids:
            raise serializers.ValidationError({'followup_agent': '后续 Agent 不能与主执行 Agent 重复'})
        return attrs


class AgentRunRecordSerializer(serializers.ModelSerializer):
    travel_progress = serializers.SerializerMethodField()

    def get_travel_progress(self, record):
        journey_id = (record.random_context or {}).get('journey_id')
        if not journey_id or getattr(self.context.get('view'), 'action', 'retrieve') != 'retrieve':
            return None
        from .agent_world.travel_models import TravelJourney, TravelRuntime
        journey = TravelJourney.objects.filter(pk=journey_id).first()
        if not journey:
            return None
        runtime = TravelRuntime.objects.filter(pk=journey_id).first()
        return {'journey_id': journey_id, 'status': journey.status, 'phase': journey.phase,
            'updated_at': journey.updated_at, 'next_at': runtime.next_at if runtime else None,
            'attempts': runtime.attempts if runtime else 0, 'authorized': bool(runtime and runtime.authorized)}

    class Meta:
        model = AgentRunRecord
        fields = [
            'id',
            'task',
            'task_name',
            'agent',
            'agent_name',
            'agent_runs',
            'random_context',
            'travel_progress',
            'trigger',
            'status',
            'started_at',
            'duration',
            'summary',
            'output',
            'steps',
            'parent_record',
            'source_agent',
            'followup_depth',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'random_context', 'parent_record', 'source_agent', 'followup_depth', 'created_at', 'updated_at']


class AgentActivitySerializer(serializers.ModelSerializer):
    type = serializers.CharField(source='activity_type', read_only=True)
    agent = serializers.SerializerMethodField()
    run_record_id = serializers.CharField(source='run_record.id', read_only=True, allow_null=True)
    output_preview = serializers.SerializerMethodField()
    artifact = serializers.SerializerMethodField()

    class Meta:
        model = AgentActivity
        fields = [
            'id', 'type', 'status', 'agent', 'title', 'summary', 'current_action',
            'occurred_at', 'run_record_id', 'output_preview', 'artifact',
        ]

    def get_agent(self, obj):
        if not obj.agent:
            from .agent_history import historical_activity_author
            return historical_activity_author(obj)
        return {'id': obj.agent.id, 'name': obj.agent.name, 'avatar': obj.agent.avatar}

    def get_output_preview(self, obj):
        metadata = obj.metadata if isinstance(obj.metadata, dict) else {}
        preview = str(metadata.get('outputPreview') or '').strip()
        if preview:
            return preview
        if not obj.run_record or not obj.agent_id:
            return ''
        runs = obj.run_record.agent_runs if isinstance(obj.run_record.agent_runs, list) else []
        for run in runs:
            if isinstance(run, dict) and run.get('agent') == obj.agent_id:
                return str(run.get('content') or '').strip()[:300]
        return ''

    def get_artifact(self, obj):
        if not obj.artifact_kind or not obj.artifact_article_id:
            return None
        return {
            'kind': obj.artifact_kind,
            'id': obj.artifact_id,
            'articleId': obj.artifact_article_id,
            'collId': obj.artifact_coll_id,
            'title': obj.artifact_title,
        }


class GeoLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = GeoLocation
        fields = ['id', 'country', 'city', 'latitude', 'longitude', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_country(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("国家不能为空")
        return value

    def validate_city(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("城市不能为空")
        return value

    def validate_latitude(self, value):
        if value < -90 or value > 90:
            raise serializers.ValidationError("纬度必须在 -90 到 90 之间")
        return value

    def validate_longitude(self, value):
        if value < -180 or value > 180:
            raise serializers.ValidationError("经度必须在 -180 到 180 之间")
        return value
