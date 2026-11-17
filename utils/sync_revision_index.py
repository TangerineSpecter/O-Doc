"""Bounded database reads and writes for the v2 revision manifest."""
import hashlib
import json
from itertools import groupby, islice

from django.db import connection, transaction
from django.db.models import Value
from django.db.models.functions import Collate, Concat
from django.utils import timezone

from system_settings.models import SyncEntityState
from system_settings.sync_state import LOCAL_ONLY_SYSTEM_SETTING_KEYS
from .sync_merge import revision_key


def digest_entries(entries):
    digest = hashlib.sha256()
    count = 0
    for key, revision in entries:
        payload = json.dumps([key, revision], ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)
        digest.update(payload.encode('utf-8'))
        digest.update(b'\n')
        count += 1
    return count, digest.hexdigest()


def local_revision_rows(*, ordered=False):
    states = SyncEntityState.objects.exclude(
        model_label='system_settings.systemsetting', object_pk__in=LOCAL_ONLY_SYSTEM_SETTING_KEYS)
    if ordered:
        # The protocol sorts the entire "model:identity" string by Unicode code point.
        # A prefix model name sorts differently as a tuple (e.g. "a1:" before "a:").
        collation = 'C' if connection.vendor == 'postgresql' else 'BINARY'
        states = states.order_by(Collate(Concat('model_label', Value(':'), 'object_pk'), collation))
    return states.values_list('model_label', 'object_pk', 'content_hash', 'revision_at',
                              'origin_device', 'is_deleted').iterator(chunk_size=2000)


def local_manifest_entries(device):
    for label, pk, content_hash, at, origin, deleted in local_revision_rows(ordered=True):
        yield revision_key(label, pk), {
            'hash': content_hash or '', 'revision_at': at.isoformat(),
            'origin_device': origin or device, 'deleted': bool(deleted),
        }


@transaction.atomic
def apply_revision_rows(revisions, normalize_time):
    fields = ['content_hash', 'revision_at', 'origin_device', 'is_deleted']
    for label, keys in groupby(sorted(revisions), key=lambda key: key.split(':', 1)[0]):
        while batch := list(islice(keys, 500)):
            incoming = {}
            for key in batch:
                _, pk = key.split(':', 1)
                row = revisions[key]
                incoming[pk] = (row.get('hash', ''), normalize_time(row.get('revision_at')) or timezone.now(),
                                row.get('origin_device', ''), bool(row.get('deleted')))
            existing = (SyncEntityState.objects.select_for_update().filter(model_label=label, object_pk__in=incoming)
                        .order_by('object_pk').values_list('object_pk', *fields))
            for pk, *values in existing:
                if tuple(values) == incoming[pk]:
                    del incoming[pk]
            if incoming:
                SyncEntityState.objects.bulk_create(
                    [SyncEntityState(model_label=label, object_pk=pk, **dict(zip(fields, values)))
                     for pk, values in incoming.items()],
                    batch_size=500, update_conflicts=True, unique_fields=['model_label', 'object_pk'],
                    update_fields=[*fields, 'updated_at'],
                )
