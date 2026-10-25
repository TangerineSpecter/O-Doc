"""HTTP input validation and typed, camel-case-rendered research resources."""
from datetime import date
from rest_framework import serializers
from .models import Attachment, Backtest, CodeVersion, Entry, Implementation

CODE_LIMIT = 1024 * 1024
NOTES_LIMIT = 100000


class EntrySerializer(serializers.ModelSerializer):
    coll_id = serializers.CharField(source='anthology_id', read_only=True)
    title = serializers.CharField(max_length=255, trim_whitespace=True)
    kind = serializers.ChoiceField(choices=Entry.KINDS, required=False)
    content = serializers.CharField(max_length=NOTES_LIMIT, allow_blank=True, required=False, trim_whitespace=False)
    source_url = serializers.URLField(max_length=2000, allow_blank=True, required=False)
    tags = serializers.ListField(child=serializers.CharField(max_length=64, allow_blank=False), max_length=30, required=False)

    class Meta:
        model = Entry
        fields = ['id', 'coll_id', 'title', 'kind', 'content', 'source_url', 'tags', 'is_valid', 'created_at', 'updated_at']
        read_only_fields = ['id', 'is_valid', 'created_at', 'updated_at']

    def validate_source_url(self, value):
        if value and not value.lower().startswith(('https://', 'http://')):
            raise serializers.ValidationError('来源仅支持 HTTP 或 HTTPS 链接')
        return value

    def validate_tags(self, value):
        return list(dict.fromkeys(value))


class CodeVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodeVersion
        fields = ['id', 'implementation_id', 'code', 'note', 'language', 'language_version', 'dependencies',
                  'parameters', 'compile_check', 'run_check', 'result_check', 'verification_notes',
                  'source_version_id', 'strategy_artifact_id', 'created_at']
        read_only_fields = fields


class VersionInputSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=CODE_LIMIT, allow_blank=True, trim_whitespace=False)
    note = serializers.CharField(max_length=2000, allow_blank=True, required=False, default='')
    language = serializers.ChoiceField(choices=Implementation.LANGUAGES, required=False)
    language_version = serializers.CharField(max_length=100, allow_blank=True, required=False)
    dependencies = serializers.CharField(max_length=10000, allow_blank=True, required=False)
    parameters = serializers.CharField(max_length=10000, allow_blank=True, required=False)
    source_version_id = serializers.CharField(max_length=40, allow_null=True, allow_blank=False, required=False)

    def validate_code(self, value):
        if len(value.encode('utf-8')) > CODE_LIMIT:
            raise serializers.ValidationError('单个代码版本最多 1 MiB，请拆分实现或作为附件归档')
        return value


class ImplementationInputSerializer(VersionInputSerializer):
    name = serializers.CharField(max_length=255)
    language = serializers.ChoiceField(choices=Implementation.LANGUAGES)


class ImplementationSerializer(serializers.ModelSerializer):
    versions = CodeVersionSerializer(many=True, read_only=True)

    class Meta:
        model = Implementation
        fields = ['id', 'entry_id', 'name', 'language', 'language_version', 'dependencies', 'parameters',
                  'current_version_id', 'versions', 'created_at', 'updated_at']
        read_only_fields = fields


class VerificationSerializer(serializers.ModelSerializer):
    compile_check = serializers.ChoiceField(choices=CodeVersion.CHECKS, required=False)
    run_check = serializers.ChoiceField(choices=CodeVersion.CHECKS, required=False)
    result_check = serializers.ChoiceField(choices=CodeVersion.CHECKS, required=False)
    verification_notes = serializers.CharField(max_length=10000, allow_blank=True, required=False)

    class Meta:
        model = CodeVersion
        fields = ['compile_check', 'run_check', 'result_check', 'verification_notes']


class MetricSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    value = serializers.CharField(max_length=500, allow_blank=True)


class BacktestSerializer(serializers.ModelSerializer):
    version_id = serializers.CharField(max_length=40, allow_null=True, required=False)
    name = serializers.CharField(max_length=255)
    symbol = serializers.CharField(max_length=255, allow_blank=True, required=False)
    timeframe = serializers.CharField(max_length=100, allow_blank=True, required=False)
    start_date = serializers.CharField(max_length=10, allow_blank=True, required=False)
    end_date = serializers.CharField(max_length=10, allow_blank=True, required=False)
    parameters = serializers.CharField(max_length=10000, allow_blank=True, required=False)
    fees = serializers.CharField(max_length=10000, allow_blank=True, required=False)
    conclusion = serializers.CharField(max_length=30000, allow_blank=True, required=False)
    metrics = MetricSerializer(many=True, required=False)

    class Meta:
        model = Backtest
        fields = ['id', 'entry_id', 'name', 'version_id', 'symbol', 'timeframe', 'start_date', 'end_date',
                  'parameters', 'fees', 'metrics', 'conclusion', 'created_at', 'updated_at']
        read_only_fields = ['id', 'entry_id', 'created_at', 'updated_at']

    def validate_version_id(self, value):
        if value and not CodeVersion.objects.filter(pk=value, implementation__entry=self.context['entry']).exists():
            raise serializers.ValidationError('代码版本不属于当前研究')
        # Keep explicit attachment evidence intact when a backtest is reassigned.
        # Unspecified backtest/attachment versions remain valid snapshot states.
        if value and self.instance and Attachment.objects.filter(
                backtest=self.instance, version__isnull=False).exclude(version_id=value).exists():
            raise serializers.ValidationError('该回测的附件已关联其他代码版本，请先移除冲突的附件关联')
        return value

    def validate_metrics(self, value):
        if len(value) > 100:
            raise serializers.ValidationError('每条回测最多记录 100 项指标')
        return value

    def validate(self, attrs):
        start, end = (attrs.get(field, getattr(self.instance, field, '')) for field in ('start_date', 'end_date'))
        for value in (start, end):
            if value:
                try:
                    if date.fromisoformat(value).isoformat() != value:
                        raise ValueError
                except ValueError as exc:
                    raise serializers.ValidationError('日期使用 YYYY-MM-DD 格式') from exc
        if start and end and start > end:
            raise serializers.ValidationError('结束日期不能早于开始日期')
        return attrs


class AttachmentSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='asset.original_name', read_only=True)
    file_type = serializers.CharField(source='asset.file_type', read_only=True)
    file_extension = serializers.CharField(source='asset.file_extension', read_only=True)
    mime_type = serializers.CharField(source='asset.mime_type', read_only=True)
    file_size = serializers.IntegerField(source='asset.file_size', read_only=True)
    url = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ['id', 'entry_id', 'asset_id', 'name', 'file_type', 'file_extension', 'mime_type', 'file_size',
                  'url', 'download_url', 'implementation_id', 'version_id', 'backtest_id', 'created_at']
        read_only_fields = fields

    def get_url(self, obj):
        return f'/api/resource/view/{obj.asset_id}' if obj.asset.file_type == 'image' else self.get_download_url(obj)

    def get_download_url(self, obj):
        return f'/api/resource/download/{obj.asset_id}'


class AttachmentInputSerializer(serializers.Serializer):
    asset_id = serializers.CharField(max_length=32)
    implementation_id = serializers.CharField(max_length=40, allow_null=True, required=False)
    version_id = serializers.CharField(max_length=40, allow_null=True, required=False)
    backtest_id = serializers.CharField(max_length=40, allow_null=True, required=False)
