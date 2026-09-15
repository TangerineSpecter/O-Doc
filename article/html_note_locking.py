"""Stable owner lock shared by HTML import/delete/conversion and article writes."""
import hashlib

from django.db import connection


def lock_html_owner(owner):
    # PostgreSQL production: serialize hash dedup and reference changes across collections.
    # SQLite already serializes writers; select_for_update has no effect there.
    if connection.vendor == 'postgresql':
        key = int.from_bytes(hashlib.sha256(f'odoc-html:{owner}'.encode()).digest()[:8], 'big', signed=True)
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(%s)', [key])
