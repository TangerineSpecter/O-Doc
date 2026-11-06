"""Bounded, process-local deadline projection keyed by the existing market checkpoint.

The checkpoint includes all listing fields and changes on writes and restoration.
No cached result authorizes a trade: submission still checks the live listing.
"""
from collections import OrderedDict
from contextlib import closing

from django.db import connection
from django.db.models.expressions import RawSQL

from .farm_gate import guarded
from .life_time import local_time
from .market_listing_expiry import expires_at
from .market_models import MarketIntegrity, MarketListing

_MAX_OWNERS = 16
_MAX_ROWS = 20000
_deadlines = OrderedDict()


@guarded
def active_deadlines(owner: str) -> tuple:
    fingerprint = MarketIntegrity.objects.filter(pk=owner).values_list('hashes__MarketListing', flat=True).first()
    cached = _deadlines.get(owner)
    if fingerprint and cached and cached[0] == fingerprint:
        _deadlines.move_to_end(owner)
        return cached[1]
    rows = MarketListing.objects.filter(owner_id=owner, status='active').order_by('created_at', 'pk')
    with closing(rows.values('pk', 'version', 'created_at', 'history').iterator(chunk_size=200)) as items:
        result = tuple((r['pk'], r['version'], local_time(expires_at(r['created_at'], r['history']))) for r in items)
    _deadlines.pop(owner, None)
    # Missing checkpoints and oversized markets remain readable, without retaining
    # an unbounded cache. Normal asset writers maintain the existing checkpoint.
    if fingerprint and result and len(result) <= _MAX_ROWS:
        _deadlines[owner] = (fingerprint, result)
        while len(_deadlines) > _MAX_OWNERS:
            _deadlines.popitem(last=False)
    return result


def visible_listings(owner, rows, now):
    local_now = local_time(now)
    expired = [identity for identity, _, deadline in active_deadlines(owner) if deadline <= local_now]
    if not expired:
        return rows
    if connection.vendor == 'postgresql':
        # Bind one array instead of expanding a potentially large SQL IN list.
        return rows.exclude(pk__in=RawSQL('SELECT unnest(%s::varchar[])', (expired,)))
    return rows.exclude(pk__in=expired)
