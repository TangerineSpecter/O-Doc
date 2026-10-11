from rest_framework import serializers
from .models import Chapter, Entity, Outline, Rule, Thread, Relation
from .validation import ids


class ScopedSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        if 'entity_ids' in attrs:
            attrs['entity_ids'] = ids(attrs['entity_ids'], set(Entity.objects.filter(project=self.context['project']).values_list('pk', flat=True)))
        return attrs


class EntitySerializer(ScopedSerializer):
    kind = serializers.ChoiceField(choices=Entity.KINDS, required=False)
    importance = serializers.ChoiceField(choices=Entity.IMPORTANCE, required=False)
    aliases = serializers.ListField(child=serializers.CharField(max_length=100), max_length=30, required=False)
    roles = serializers.ListField(child=serializers.CharField(max_length=100), max_length=20, required=False)

    class Meta:
        model = Entity
        fields = ['id', 'kind', 'name', 'aliases', 'importance', 'roles', 'biography', 'plan', 'initial_state', 'hidden', 'updated_at']
        read_only_fields = ['id', 'updated_at']

    def validate_initial_state(self, value):
        if not isinstance(value, dict) or len(str(value)) > 10000:
            raise serializers.ValidationError('开篇状态格式无效')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance and attrs.get('name', self.instance.name) != self.instance.name:
            aliases = attrs.get('aliases', self.instance.aliases)
            attrs['aliases'] = list(dict.fromkeys([*aliases, self.instance.name]))
        return attrs


class OutlineSerializer(ScopedSerializer):
    level = serializers.ChoiceField(choices=['book', 'volume', 'chapter'], required=False)
    position = serializers.IntegerField(min_value=1, max_value=100000, required=False)

    class Meta:
        model = Outline
        fields = ['id', 'level', 'title', 'content', 'position', 'entity_ids', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class RelationSerializer(ScopedSerializer):
    class Meta:
        model = Relation
        fields = ['id', 'source_id', 'target_id', 'description', 'secret']
        read_only_fields = ['id']

    def validate(self, attrs):
        allowed = set(Entity.objects.filter(project=self.context['project']).values_list('pk', flat=True))
        for key in ('source_id', 'target_id'):
            value = attrs.get(key, getattr(self.instance, key, ''))
            if value not in allowed:
                raise serializers.ValidationError('关系中的人物或实体属于其他小说或不存在')
        return attrs


class ThreadSerializer(ScopedSerializer):
    kind = serializers.ChoiceField(choices=['foreshadowing', 'hook', 'task'], required=False)
    state = serializers.ChoiceField(choices=Thread.STATES, required=False)

    class Meta:
        model = Thread
        fields = ['id', 'kind', 'title', 'description', 'state', 'entity_ids', 'planned_payoff', 'open_ending', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class RuleSerializer(ScopedSerializer):
    kind = serializers.ChoiceField(choices=['literal', 'expression', 'character', 'plot'], required=False)
    strength = serializers.ChoiceField(choices=['forbid', 'avoid'], required=False)

    class Meta:
        model = Rule
        fields = ['id', 'kind', 'instruction', 'strength', 'scope', 'scope_entity_ids', 'scope_chapter_ids', 'example', 'alternative', 'exception', 'source_revision_id', 'enabled', 'updated_at']
        read_only_fields = ['id', 'updated_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        from .models import Revision
        rid = attrs.get('source_revision_id')
        if rid:
            source = Revision.objects.filter(pk=rid, chapter__project=self.context['project']).first()
            if not source:
                raise serializers.ValidationError('规则来源属于其他小说或已不存在')
            if attrs.get('example') and attrs['example'] not in source.content:
                raise serializers.ValidationError('选区反例不在保存的来源版本，请先保存正文')
        project = self.context['project']
        if 'scope_entity_ids' in attrs:
            attrs['scope_entity_ids'] = ids(attrs['scope_entity_ids'], set(Entity.objects.filter(project=project).values_list('pk', flat=True)))
        if 'scope_chapter_ids' in attrs:
            attrs['scope_chapter_ids'] = ids(attrs['scope_chapter_ids'], set(Chapter.objects.filter(project=project).values_list('pk', flat=True)))
        if attrs.get('kind', getattr(self.instance, 'kind', '')) == 'literal' and not attrs.get('example', getattr(self.instance, 'example', '')):
            raise serializers.ValidationError('禁用词句请填写具体词句')
        return attrs


class ChapterSerializer(ScopedSerializer):
    position = serializers.IntegerField(min_value=1, max_value=100000, required=False)

    def validate_position(self, value):
        query = Chapter.objects.filter(project=self.context['project'], is_valid=True, position=value)
        if self.instance:
            query = query.exclude(pk=self.instance.pk)
        if query.exists():
            raise serializers.ValidationError('该目录顺序已有章节，请选择空闲序号')
        return value

    class Meta:
        model = Chapter
        fields = ['id', 'title', 'volume', 'position', 'outline', 'entity_ids', 'story_time', 'time_order', 'pov', 'draft_id', 'adopted_id', 'published_id', 'published_at', 'needs_review', 'updated_at']
        read_only_fields = ['id', 'draft_id', 'adopted_id', 'published_id', 'published_at', 'needs_review', 'updated_at']
