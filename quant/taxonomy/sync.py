"""Reconstruct vocabulary history and stable concepts without model calls."""
import re
from quant.models import QuantVocabulary, QuantVocabularyTerm, QuantVocabularyRevision
from quant.research.contracts import digest
from .builtins import catalog
from .contracts import validate, core, reference, validate_ref
from .services import book_id, revision_id

LABELS = {'quant.quantvocabulary', 'quant.quantvocabularyterm', 'quant.quantvocabularyrevision'}


def resolve_rows(collection_id, ref, rows):
    ref = validate_ref(ref)
    if ref['revision_id']:
        revision = rows.get('quant.quantvocabularyrevision', {}).get(ref['revision_id'], {})
        book = rows.get('quant.quantvocabulary', {}).get(revision.get('vocabulary'), {})
        if str(book.get('anthology')) != str(collection_id):
            raise ValueError('分类词表快照缺失或跨文集')
        value = revision['data']
    else: value = catalog()
    if reference(value, ref['revision_id']) != ref: raise ValueError('分类词表快照引用与内容不一致')
    return value


def validate_vocabularies(rows, anthologies, fail):
    books = rows.get('quant.quantvocabulary', {})
    terms = rows.get('quant.quantvocabularyterm', {})
    revisions = rows.get('quant.quantvocabularyrevision', {})
    registry, used = {}, set()
    for identity, book in books.items():
        coll = str(book.get('anthology'))
        head = revisions.get(book.get('current_revision_id'), {})
        if coll not in anthologies or identity != book_id(coll) or head.get('vocabulary') != identity:
            fail('分类词表归属、稳定身份或当前版本无效')
    for identity, term in terms.items():
        code, book = term.get('code'), term.get('vocabulary')
        key = (book, code)
        value = {'id': code, 'dimension': term.get('dimension'), 'definition': term.get('definition')}
        if (book not in books or key in registry or not isinstance(code, str)
                or identity != digest(['quant-vocabulary-term-1', book, code])[:40]
                or term.get('content_hash') != digest(value)):
            fail('分类词条的稳定身份或含义登记无效')
        registry[key] = value
    validated, pending, keys = {}, set(revisions), set()
    while pending:
        ready = [identity for identity in pending if not revisions[identity].get('parent_id') or revisions[identity].get('parent_id') in validated]
        if not ready: fail('词表修订链存在循环或缺失')
        for identity in ready:
            row = revisions[identity]
            book, parent = row.get('vocabulary'), row.get('parent_id')
            key = (book, row.get('request_key'))
            if (book not in books or not isinstance(parent, str) or key in keys
                    or not isinstance(row.get('request_key'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,64}', row['request_key'])
                    or parent and revisions[parent].get('vocabulary') != book
                    or identity != revision_id(books[book]['anthology'], row['request_key'])):
                fail('词表修订跨文集、请求重复或稳定身份无效')
            value = validate(row.get('data'), validated.get(parent))
            if digest(value) != digest(row['data']) or row.get('content_hash') != digest(value):
                fail('分类词表修订不规范或哈希无效')
            for term in value['terms']:
                if registry.get((book, term['id'])) != core(term):
                    fail('词表分支重用了稳定编码的含义或缺少登记')
                used.add((book, term['id']))
            validated[identity] = value; keys.add(key); pending.remove(identity)
    if used != set(registry): fail('分类词条登记没有对应的不可变修订')
    for model in (QuantVocabulary, QuantVocabularyTerm, QuantVocabularyRevision):
        incoming = rows.get(model._meta.label_lower, {})
        for local in model.objects.filter(pk__in=incoming).values('id', *model.SNAPSHOT_FIELDS):
            if any(digest(local[field]) != digest(incoming[local['id']].get(model._meta.get_field(field).name)) for field in model.SNAPSHOT_FIELDS):
                fail('已有分类词表事实不可覆盖')
