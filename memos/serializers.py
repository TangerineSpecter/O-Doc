from rest_framework import serializers

from utils.drf_utils import get_current_user_identifier
from .models import Memo


class MemoSerializer(serializers.ModelSerializer):
    """闪念备忘序列化器"""

    user_id = serializers.CharField(read_only=True)
    user_name = serializers.SerializerMethodField()
    creator_type = serializers.ChoiceField(choices=Memo.CREATOR_TYPE_CHOICES, read_only=True)
    creator_id = serializers.CharField(read_only=True)
    creator_name = serializers.CharField(read_only=True)

    class Meta:
        model = Memo
        fields = [
            'memo_id',
            'content',
            'tag',
            'is_pinned',
            'user_id',
            'user_name',
            'creator_type',
            'creator_id',
            'creator_name',
            'is_valid',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['memo_id', 'is_valid', 'created_at', 'updated_at']

    def validate_content(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("内容不能为空")
        if len(value) > 2000:
            raise serializers.ValidationError("内容不能超过2000个字符")
        return value.strip()

    def create(self, validated_data):
        request = self.context.get('request')
        user_id = get_current_user_identifier(request)
        creator = self.context.get('creator') or {}

        validated_data['user_id'] = user_id

        if creator.get('type') == Memo.CREATOR_TYPE_AGENT:
            validated_data['creator_type'] = Memo.CREATOR_TYPE_AGENT
            validated_data['creator_id'] = (creator.get('id') or '').strip()
            validated_data['creator_name'] = (creator.get('name') or 'Agent').strip()[:150]
        else:
            validated_data['creator_type'] = Memo.CREATOR_TYPE_USER
            validated_data['creator_id'] = user_id
            validated_data['creator_name'] = ''

        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('creator_type', None)
        validated_data.pop('creator_id', None)
        validated_data.pop('creator_name', None)
        validated_data.pop('user_id', None)
        return super().update(instance, validated_data)

    def get_user_name(self, obj):
        user_id = obj.user_id
        if not hasattr(self, '_user_name_cache'):
            self._user_name_cache = {}

        if user_id in self._user_name_cache:
            return self._user_name_cache[user_id]

        user_name = user_id
        try:
            from user.models import UserProfile

            profile = UserProfile.objects.select_related('user').filter(userid=user_id).first()
            if profile:
                user_name = profile.nickname or profile.user.first_name or profile.user.username or user_id
        except Exception:
            pass

        self._user_name_cache[user_id] = user_name
        return user_name
