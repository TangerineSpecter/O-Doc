from rest_framework import serializers
from .models import AIProvider, AIModel, SystemSetting, GeoLocation

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
