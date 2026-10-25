"""Acquire outside transactions, then publish an immutable source under its lease."""
from django.db import transaction
from django.utils import timezone
from quant.locking import collection_lock
from quant.models import SourceRevision
from .contracts import digest
from .web_source import fetch_source, SourceFetchError


def acquire_source(run, check_cancel) -> SourceRevision:
    original = run.source
    data = original.payload
    if not data.get('url') or data.get('fetch_status') == 'fetched' or data.get('provenance') == 'source_supplement':
        return original
    check_cancel()
    payload = {key: data.get(key, '') for key in ('title', 'code', 'description', 'url', 'language', 'platform')}
    payload['language'] = payload['language'] or 'text'
    payload.update(provenance='web_fetch', origin_source_id=original.pk, run_id=run.pk,
        fetched_at=timezone.now().isoformat(), fetch_status='failed', fetch_error='', final_url='',
        web_markdown='', extraction_method='', extraction_confidence='', code_origin='submitted' if payload['code'] else 'none')
    try:
        fetched = fetch_source(data['url'], check_cancel)
        payload.update({key: fetched[key] for key in ('final_url', 'web_markdown', 'extraction_method', 'extraction_confidence')})
        payload['title'] = payload['title'] or fetched['title']
        if not payload['code'] and fetched['extracted_code']:
            payload.update(code=fetched['extracted_code'], language=fetched['language'], code_origin='web_extracted')
        payload['fetch_status'] = 'fetched'
    except SourceFetchError as exc:
        payload['fetch_error'] = str(exc)
    with collection_lock(run.entry.anthology_id), transaction.atomic():
        check_cancel()
        source = SourceRevision.objects.create(material=original.material, payload=payload, content_hash=digest(payload))
        # Requests retain their original source and idempotency hash. The resolved
        # snapshot says exactly what was sent to the model, including failures.
        run.resolved_source = source
        run.save(update_fields=['resolved_source', 'updated_at'])
        material = original.material
        if material.current_revision_id == original.pk:
            material.current_revision_id = source.pk
            material.save(update_fields=['current_revision_id', 'updated_at'])
    if payload['fetch_status'] == 'failed' and not (payload['code'].strip() or payload['description'].strip()):
        raise SourceFetchError(payload['fetch_error'])
    return source
