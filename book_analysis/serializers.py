from rest_framework import serializers


class RunInput(serializers.Serializer):
    mode = serializers.ChoiceField(choices=['story', 'knowledge'])
    start = serializers.IntegerField(min_value=1, default=1)
    end = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    force = serializers.BooleanField(default=False)
    kind = serializers.ChoiceField(choices=['analyze', 'index'], default='analyze')


class AskInput(serializers.Serializer):
    question = serializers.CharField(max_length=2000)
    chapter_id = serializers.CharField(max_length=64, required=False, default='')
    node_id = serializers.CharField(max_length=64, required=False, default='')


class GraphInput(serializers.Serializer):
    revision_id = serializers.CharField(max_length=64, required=False, default='')
    chapter_id = serializers.CharField(max_length=64, required=False, default='')
    kind = serializers.CharField(max_length=20, required=False, default='')
    query = serializers.CharField(max_length=100, required=False, default='')
    center = serializers.CharField(max_length=64, required=False, default='')
    thread = serializers.CharField(max_length=120, required=False, default='')
    view = serializers.ChoiceField(choices=['graph', 'flow', 'timeline', 'mindmap'], default='graph')
    order = serializers.ChoiceField(choices=['narrative', 'time'], default='narrative')
    page = serializers.IntegerField(min_value=1, default=1)
    limit = serializers.IntegerField(min_value=1, max_value=200, default=200)


class BoundaryInput(serializers.Serializer):
    action = serializers.ChoiceField(choices=['rename', 'split', 'merge'])
    offset = serializers.IntegerField(min_value=0, default=0)
    title = serializers.CharField(max_length=255, required=False, default='', allow_blank=True)
