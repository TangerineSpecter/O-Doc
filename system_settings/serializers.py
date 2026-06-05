from rest_framework import serializers
from .models import Agent, AgentLongTermMemory, AgentRunRecord, AgentTask, AIProvider, AIModel, MCPServer, Skill, SystemSetting, GeoLocation

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

class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ['key', 'value']


class AgentSerializer(serializers.ModelSerializer):
    model_detail = AIModelSerializer(source='model', read_only=True)

    class Meta:
        model = Agent
        fields = [
            'id',
            'name',
            'avatar',
            'model',
            'model_detail',
            'prompt',
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
        read_only_fields = ['id', 'model_detail', 'created_at', 'updated_at']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Agent 名称不能为空")
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


class AgentTaskSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source='agent.name', read_only=True)

    class Meta:
        model = AgentTask
        fields = [
            'id',
            'name',
            'agent',
            'agent_name',
            'trigger',
            'schedule',
            'schedule_type',
            'schedule_time',
            'schedule_weekday',
            'schedule_month_day',
            'interval_minutes',
            'output',
            'target_collection_id',
            'target_collection_title',
            'enabled',
            'prompt',
            'notify_enabled',
            'notify_platform',
            'notify_webhook_url',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'agent_name', 'created_at', 'updated_at']

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
        output = attrs.get('output', getattr(self.instance, 'output', 'collection'))
        target_collection_id = attrs.get('target_collection_id', getattr(self.instance, 'target_collection_id', ''))
        if output == 'collection' and not target_collection_id:
            raise serializers.ValidationError({"target_collection_id": "请选择输出文集"})
        notify_enabled = attrs.get('notify_enabled', getattr(self.instance, 'notify_enabled', False))
        notify_webhook_url = attrs.get('notify_webhook_url', getattr(self.instance, 'notify_webhook_url', ''))
        if notify_enabled and not notify_webhook_url:
            raise serializers.ValidationError({"notify_webhook_url": "请填写 Webhook 地址"})
        return attrs


class AgentRunRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentRunRecord
        fields = [
            'id',
            'task',
            'task_name',
            'agent',
            'agent_name',
            'trigger',
            'status',
            'started_at',
            'duration',
            'summary',
            'steps',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


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
