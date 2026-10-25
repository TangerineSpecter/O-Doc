"""Append a complete source bundle, preserve prior reports, optionally queue AI."""
from django.db import transaction
from quant.models import SourceMaterial, SourceRevision
from quant.services import Conflict, ModelUnavailable, queue, touch
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from .contracts import SupplementInput, build, identity


@transaction.atomic
def supplement(source: SourceRevision, raw: dict) -> tuple[SourceRevision, str]:
    form = SupplementInput(data=raw)
    form.is_valid(raise_exception=True)
    data = dict(form.validated_data)
    material = SourceMaterial.objects.select_for_update().get(pk=source.material_id)
    entry = material.entry
    if not entry.is_valid:
        raise ValidationError('来源条目已删除')
    key = identity(material.pk,data['request_key'])
    existing = SourceRevision.objects.filter(pk=key).first()
    if existing:
        if existing.payload.get('parent_source_id') != source.pk or existing.payload.get('request_fingerprint') != digest(data):
            raise Conflict('补充请求已用于其他内容，请重新提交')
        return existing, ''
    if material.current_revision_id != source.pk:
        raise Conflict('来源已有新版本，请刷新并选择材料当前快照后补充')
    payload = build(source.pk,source.content_hash,source.payload,data)
    created = SourceRevision.objects.create(id=key,material=material,payload=payload,content_hash=digest(payload))
    material.current_revision_id = created.pk
    material.save(update_fields=['current_revision_id','updated_at'])
    notice = ''
    if data['analyze']:
        try:
            queue(entry,{'kind':'analyze','source_id':created.pk,'model_id':data['model_id'],'request_key':data['request_key']})
        except (ModelUnavailable,Conflict,ValidationError) as error:
            notice = str(error.detail)
    touch(entry)
    return created,notice
