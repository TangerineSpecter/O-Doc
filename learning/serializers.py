from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from rest_framework import serializers
from system_settings.models import AIModel
from .models import Course
from .catalog import subject_definition


class CourseSerializer(serializers.ModelSerializer):
    model_id = serializers.PrimaryKeyRelatedField(source='model', queryset=AIModel.objects.filter(type='chat'))
    level = serializers.ChoiceField(choices=['不确定', '基础', '能简单交流', '中等', '较熟练'], required=False, default='不确定')
    minutes = serializers.IntegerField(min_value=3, max_value=60)
    question_count = serializers.IntegerField(min_value=3, max_value=10)
    pending_limit = serializers.IntegerField(min_value=1, max_value=5)
    goal = serializers.CharField(max_length=1000, allow_blank=False)
    scenarios = serializers.ListField(child=serializers.CharField(max_length=40), min_length=1, max_length=3)
    schedule_time = serializers.RegexField(r'^([01]\d|2[0-3]):[0-5]\d$')

    class Meta:
        model = Course
        fields = ['goal', 'subject', 'scenarios', 'level', 'minutes', 'question_count', 'pending_limit', 'teacher_name', 'model_id', 'style', 'schedule_time', 'timezone']

    def validate(self, attrs):
        subject = attrs.get('subject', self.instance.subject if self.instance else 'english')
        definition = subject_definition(subject)
        if self.instance and subject != self.instance.subject:
            raise serializers.ValidationError('学习文集不能直接更换学科，请新建学习文集以保留独立记录')
        allowed = {goal[1] for goal in definition['goals'].values()}
        if any(value not in allowed for value in attrs.get('scenarios', [])):
            raise serializers.ValidationError('学习方向不属于所选学科')
        return attrs

    def validate_timezone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError('请选择有效时区')
        return value
