"""Atomic archive first: model availability never discards collected material."""
import re
from rest_framework import serializers
from quant.models import Entry, SourceMaterial, SourceRevision
from quant.services import Conflict, ModelUnavailable, queue, touch
from .contracts import digest


class IntakeInput(serializers.Serializer):
    request_key = serializers.RegexField(r'^[a-zA-Z0-9_-]{16,64}$')
    title = serializers.CharField(max_length=255, allow_blank=True, default='')
    code = serializers.CharField(max_length=150000, allow_blank=True, default='', trim_whitespace=False)
    description = serializers.CharField(max_length=30000, allow_blank=True, default='', trim_whitespace=False)
    url = serializers.URLField(max_length=2000, allow_blank=True, default='')
    language = serializers.ChoiceField(choices=['auto', 'python', 'pine', 'mql4', 'tongdaxin', 'text'], default='auto')
    platform = serializers.CharField(max_length=100, allow_blank=True, default='')
    analyze = serializers.BooleanField(default=True)
    model_id = serializers.CharField(max_length=40, allow_blank=True, default='')

    def validate(self, data):
        if not any(data[key].strip() for key in ('code', 'description', 'url')):
            raise serializers.ValidationError('请粘贴代码、说明或来源网址')
        if data['url'] and not data['url'].lower().startswith(('http://', 'https://')):
            raise serializers.ValidationError('来源网址只支持 HTTP/HTTPS')
        return data


def detect_language(code: str) -> str:
    if re.search(r'^\s*//@version=\d+',code,re.MULTILINE):
        return 'pine'
    if re.search(r'^\s*(?:async\s+def|def|import|from)\s+\w+',code,re.MULTILINE):
        return 'python'
    if re.search(r'#property|\b(?:OnTick|OnCalculate|OrderSend)\s*\(|\b(?:extern|input)\s+(?:int|double|bool)\b', code):
        return 'mql4'
    if re.search(r'^\s*(?:indicator|study|strategy)\s*\(',code,re.MULTILINE):
        return 'pine'
    if re.search(r':=|\b(?:DRAWICON|STICKLINE|DRAWTEXT)\s*\(', code):
        return 'tongdaxin'
    return 'text'


def collect(collection, raw: dict) -> tuple[Entry, str]:
    serializer = IntakeInput(data=raw)
    serializer.is_valid(raise_exception=True)
    data = dict(serializer.validated_data)
    fingerprint = digest(data)
    identity = digest(['intake', collection.pk, data['request_key']])[:40]
    existing = SourceRevision.objects.filter(pk=identity).select_related('material__entry').first()
    if existing:
        if existing.payload.get('request_fingerprint') != fingerprint or not existing.material.entry.is_valid:
            raise Conflict('收集请求已存在或已删除，请重新发起')
        return existing.material.entry, ''
    entry = Entry.objects.create(id=identity, anthology=collection, title=data['title'] or '待分析资料',
                                 source_url=data['url'])
    material = SourceMaterial.objects.create(entry=entry, title=entry.title, current_revision_id=identity)
    payload = {key: data[key] for key in ('title', 'code', 'description', 'url', 'platform', 'language')}
    if payload['language'] == 'auto':
        payload['language'] = detect_language(payload['code'])
    payload.update(provenance='intake', fetch_status='not_fetched', request_fingerprint=fingerprint)
    source = SourceRevision.objects.create(id=identity, material=material, payload=payload, content_hash=digest(payload))
    notice = ''
    if data['analyze']:
        try:
            queue(entry, {'kind': 'analyze', 'source_id': source.pk, 'model_id': data['model_id'],
                          'request_key': data['request_key']})
        except (ModelUnavailable, Conflict, serializers.ValidationError) as exc:
            # Archive valid material even if the model was removed or its input
            # budget is smaller than the collected material. Retry is explicit.
            notice = str(exc.detail)
    touch(entry)
    return entry, notice
