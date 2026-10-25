"""Collection-scoped immutable vocabulary revisions; reads never create records."""
from django.db import transaction
from rest_framework.exceptions import ValidationError
from quant.models import QuantVocabulary, QuantVocabularyRevision, QuantVocabularyTerm
from quant.research.contracts import digest
from quant.services import Conflict
from .builtins import catalog, DIMENSIONS
from .contracts import validate, reference, validate_ref, core


def book_id(collection_id):
    return digest(['quant-vocabulary-1', str(collection_id)])[:40]


def revision_id(collection_id, request_key):
    return digest(['quant-vocabulary-revision-1', str(collection_id), request_key])[:40]


def current(collection_id) -> tuple[dict, dict]:
    book = QuantVocabulary.objects.filter(anthology_id=collection_id).first()
    if book and book.current_revision_id:
        row = QuantVocabularyRevision.objects.get(pk=book.current_revision_id, vocabulary=book)
        return row.data, reference(row.data, row.pk)
    value = catalog()
    return value, reference(value)


def resolve(collection_id, ref: dict) -> dict:
    ref = validate_ref(ref)
    if ref['revision_id']:
        row = QuantVocabularyRevision.objects.filter(pk=ref['revision_id'], vocabulary__anthology_id=collection_id).first()
        if not row:
            raise ValidationError('分类词表快照缺失或不属于当前文集')
        value = row.data
    else:
        value = catalog()
    if reference(value, ref['revision_id']) != ref:
        raise ValidationError('分类词表快照内容已改变')
    return value


def presentation(collection_id, offset=0, limit=20, selected_revision_id='') -> dict:
    value, ref = current(collection_id)
    if selected_revision_id:
        row = QuantVocabularyRevision.objects.filter(pk=selected_revision_id, vocabulary__anthology_id=collection_id).first()
        if not row: raise ValidationError('未找到该文集的词表版本')
        value, selected_ref = row.data, reference(row.data, row.pk)
    else:
        selected_ref = ref
    revisions = QuantVocabularyRevision.objects.filter(vocabulary__anthology_id=collection_id).order_by('-created_at', '-id')
    from .normalization import ambiguities
    # Sibling revision terms remain inspectable even when the chosen head does
    # not include them. Their stable meanings cannot be reused by another device.
    included = {term['id'] for term in value['terms']}
    archived = [{'id': term.code, 'dimension': term.dimension, 'definition': term.definition}
        for term in QuantVocabularyTerm.objects.filter(vocabulary__anthology_id=collection_id).order_by('code') if term.code not in included]
    return {'catalog': value, 'reference': selected_ref, 'current_reference': ref,
        'dimensions': DIMENSIONS, 'ambiguities': ambiguities(value), 'archived_concepts': archived,
        'history_total': revisions.count(), 'history': [{'id': row.pk, 'parent_id': row.parent_id,
            'content_hash': row.content_hash, 'reason': row.data['reason'], 'created_at': row.created_at.isoformat()}
            for row in revisions[offset:offset + limit]]}


@transaction.atomic
def revise(collection, term: dict, request_key: str, expected_revision_id: str, reason: str):
    identity = revision_id(collection.pk, request_key)
    previous = QuantVocabularyRevision.objects.filter(pk=identity).first()
    if previous:
        stored = next((row for row in previous.data['terms'] if row['id'] == term['id']), None)
        if previous.parent_id != expected_revision_id or stored != term or previous.data['reason'] != reason:
            raise Conflict('请求标识已用于另一份词表修订')
        return previous
    value, ref = current(collection.pk)
    if ref['revision_id'] != expected_revision_id:
        raise Conflict('分类词表已有新版本，请刷新后合并修改')
    old = next((row for row in value['terms'] if row['id'] == term['id']), None)
    if old == term:
        raise ValidationError('词条内容没有变化')
    value = validate({**value, 'reason': reason, 'terms': [row for row in value['terms'] if row['id'] != term['id']] + [term]}, value)
    book, _ = QuantVocabulary.objects.get_or_create(id=book_id(collection.pk), defaults={'anthology': collection})
    for item in value['terms']:
        registered, _ = QuantVocabularyTerm.objects.get_or_create(vocabulary=book, code=item['id'], defaults={
            'id': digest(['quant-vocabulary-term-1', book.pk, item['id']])[:40],
            'dimension': item['dimension'], 'definition': item['definition'], 'content_hash': digest(core(item))})
        if registered.content_hash != digest(core(item)):
            raise Conflict('其他词表分支已定义该编码的含义；请使用新编码')
    row = QuantVocabularyRevision.objects.create(id=identity, vocabulary=book, parent_id=expected_revision_id,
        request_key=request_key, data=value, content_hash=digest(value))
    book.current_revision_id = row.pk
    book.save(update_fields=['current_revision_id', 'updated_at'])
    collection.save(update_fields=['updated_at'])
    return row
