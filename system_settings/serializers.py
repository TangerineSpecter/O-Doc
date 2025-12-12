from rest_framework import serializers
from .models import AIProvider, AIModel, SystemSetting

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