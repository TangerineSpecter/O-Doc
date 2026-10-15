"""Independent SQLite store. Every operation uses its own bounded-time connection."""
import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from django.conf import settings


def directory():
    configured = str(settings.SYSTEM_LOG_DIR).strip()
    if not configured:
        raise ValueError('SYSTEM_LOG_DIR must be a dedicated nonempty directory')
    root = Path(configured).resolve()
    forbidden = {Path('/'), Path.home().resolve(), Path('/private/tmp'), Path('/tmp').resolve()}
    if hasattr(settings, 'BASE_DIR'):
        forbidden.add(Path(settings.BASE_DIR).resolve())
    if root in forbidden:
        raise ValueError('SYSTEM_LOG_DIR must not be a shared root directory')
    database = root / 'events.sqlite3'
    if database.is_symlink():
        raise ValueError('Diagnostic database must not be a symlink')
    return root


@contextmanager
def connection():
    root = directory()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    db = sqlite3.connect(root / 'events.sqlite3', timeout=3)
    db.row_factory = sqlite3.Row
    try:
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript('''
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY, created REAL NOT NULL, last_seen REAL NOT NULL,
                occurrence_key TEXT, request_id TEXT NOT NULL,
                fault_key TEXT NOT NULL UNIQUE, module TEXT NOT NULL, title TEXT NOT NULL,
                error_type TEXT NOT NULL, detail TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS events_created ON events(created);
            CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), days INTEGER, max_mb INTEGER);
            INSERT OR IGNORE INTO config VALUES(1,30,100);
        ''')
        # The log database is local and can outlive application versions. Add the
        # roll-up columns in place, then compact legacy duplicates exactly once.
        columns = {row['name'] for row in db.execute('PRAGMA table_info(events)')}
        schema_version = db.execute('PRAGMA user_version').fetchone()[0]
        if schema_version < 2 or not {'last_seen', 'occurrence_key'} <= columns:
            db.execute('BEGIN IMMEDIATE')
            columns = {row['name'] for row in db.execute('PRAGMA table_info(events)')}
            if 'last_seen' not in columns:
                db.execute('ALTER TABLE events ADD COLUMN last_seen REAL')
            if 'occurrence_key' not in columns:
                db.execute('ALTER TABLE events ADD COLUMN occurrence_key TEXT')
            _migrate_occurrences(db)
            db.execute('CREATE UNIQUE INDEX IF NOT EXISTS events_occurrence_key ON events(occurrence_key)')
            # Keep every correlation addressable after daily roll-up. Cascading
            # deletion prevents stale mappings from outliving retained logs.
            db.execute('''CREATE TABLE IF NOT EXISTS event_correlations (
                day TEXT NOT NULL, fingerprint TEXT NOT NULL,
                event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                PRIMARY KEY(day,fingerprint)
            )''')
            db.execute('CREATE INDEX IF NOT EXISTS event_correlations_event ON event_correlations(event_id)')
            for row in db.execute('SELECT id,occurrence_key,detail FROM events ORDER BY created,id').fetchall():
                fingerprints = json.loads(row['detail']).get('seen_fault_keys', [])
                db.executemany(
                    'INSERT OR IGNORE INTO event_correlations(day,fingerprint,event_id) VALUES(?,?,?)',
                    [(row['occurrence_key'].split(':', 1)[0], fingerprint, row['id'])
                     for fingerprint in fingerprints],
                )
            db.execute('PRAGMA user_version=2')
            db.commit()
        yield db
        db.commit()
    finally:
        db.close()


def size():
    root = directory()
    return sum(p.stat().st_size for p in root.glob('events.sqlite3*') if p.is_file()) if root.exists() else 0


def policy(db):
    row = db.execute('SELECT days,max_mb FROM config WHERE id=1').fetchone()
    return {'days': row['days'], 'max_mb': row['max_mb']}


_IDENTITY_FIELDS = (
    'module', 'title', 'error_type', 'exception_class', 'http_status',
    'provider_http_status', 'business_status', 'provider_code', 'business_code',
    'reason', 'logger', 'operation', 'path', 'provider_name', 'model_name',
    'model_id', 'model_role', 'provider_endpoint', 'provider_task_status', 'source',
)


def _occurrence_key(event, timestamp):
    zone = ZoneInfo(getattr(settings, 'TIME_ZONE', 'UTC'))
    local_day = datetime.fromtimestamp(float(timestamp), tz=timezone.utc).astimezone(zone).date().isoformat()
    identity = {key: event.get(key) for key in _IDENTITY_FIELDS if event.get(key) not in (None, '')}
    stack = event.get('stack')
    if stack:
        identity['stack'] = hashlib.sha256(str(stack).encode('utf-8')).hexdigest()
    encoded_identity = json.dumps(identity, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    digest = hashlib.sha256(encoded_identity).hexdigest()
    return f'{local_day}:{digest}'


def _merge_details(existing, incoming):
    merged = dict(existing)
    authoritative = (incoming.get('source') == 'backend' and merged.get('source') == 'frontend'
                     or incoming.get('exception_class') and not merged.get('exception_class'))
    existing_provider_status = merged.get('provider_http_status')
    incoming_provider_status = incoming.get('provider_http_status')
    for name, value in incoming.items():
        if name in {
            'id', 'created', 'first_seen', 'last_seen', 'fault_key', 'occurrence_key',
            'captures', 'occurrence_count', 'seen_fault_keys',
        }:
            continue
        provider_field = name in {'provider_http_status', 'http_status', 'error_type', 'reason', 'provider_code', 'title'}
        if provider_field and existing_provider_status and not incoming_provider_status:
            continue
        if provider_field and incoming_provider_status and not existing_provider_status:
            merged[name] = value
            continue
        if name not in merged or not merged[name] or authoritative and value is not None:
            merged[name] = value
    existing_first = float(existing.get('first_seen', existing.get('created', 0)) or 0)
    incoming_first = float(incoming.get('first_seen', incoming.get('created', existing_first)) or existing_first)
    existing_last = float(existing.get('last_seen', existing.get('created', existing_first)) or existing_first)
    incoming_last = float(incoming.get('last_seen', incoming.get('created', existing_last)) or existing_last)
    first_seen = min(existing_first, incoming_first)
    last_seen = max(existing_last, incoming_last)
    merged['created'] = first_seen
    merged['first_seen'] = first_seen
    merged['last_seen'] = last_seen
    merged['captures'] = int(existing.get('captures', 1) or 1) + int(incoming.get('captures', 1) or 1)
    seen_fault_keys = list(dict.fromkeys([
        *existing.get('seen_fault_keys', []), *incoming.get('seen_fault_keys', []),
    ]))
    merged['seen_fault_keys'] = seen_fault_keys
    merged['occurrence_count'] = len(seen_fault_keys) or 1
    return merged


def _migrate_occurrences(db):
    rows = db.execute('SELECT id,created,detail FROM events WHERE occurrence_key IS NULL ORDER BY created,id').fetchall()
    for row in rows:
        detail = json.loads(row['detail'])
        created = float(detail.get('first_seen', row['created']) or row['created'])
        last_seen = float(detail.get('last_seen', detail.get('created', row['created'])) or row['created'])
        detail.update({'created': created, 'first_seen': created, 'last_seen': last_seen})
        detail.setdefault('captures', 1)
        if not detail.get('seen_fault_keys'):
            correlation = detail.get('fault_key') or detail.get('id') or row['id']
            detail['seen_fault_keys'] = [hashlib.sha256(str(correlation).encode('utf-8')).hexdigest()[:16]]
        detail['occurrence_count'] = len(set(detail['seen_fault_keys']))
        occurrence_key = _occurrence_key(detail, created)
        duplicate = db.execute(
            'SELECT id,created,last_seen,detail FROM events WHERE occurrence_key=?', (occurrence_key,)
        ).fetchone()
        if duplicate:
            combined = _merge_details(json.loads(duplicate['detail']), detail)
            db.execute(
                'UPDATE events SET created=?,last_seen=?,module=?,title=?,error_type=?,detail=? WHERE id=?',
                (combined['first_seen'], combined['last_seen'], combined.get('module', ''),
                 combined.get('title', ''), combined.get('error_type', ''),
                 json.dumps(combined, ensure_ascii=False), duplicate['id']),
            )
            db.execute('DELETE FROM events WHERE id=?', (row['id'],))
        else:
            db.execute(
                'UPDATE events SET created=?,last_seen=?,occurrence_key=?,detail=? WHERE id=?',
                (created, last_seen, occurrence_key, json.dumps(detail, ensure_ascii=False), row['id']),
            )


def reclaim(db):
    db.commit()
    db.execute('VACUUM')


def maintain():
    with connection() as db:
        config = policy(db)
        deleted = db.execute('DELETE FROM events WHERE last_seen < ?', (time.time() - config['days'] * 86400,)).rowcount
        if deleted:
            reclaim(db)
        while size() > config['max_mb'] * 1024 * 1024:
            removed = db.execute('DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY last_seen LIMIT 100)').rowcount
            if not removed:
                break
            reclaim(db)


def write(event):
    with connection() as db:
        # Serialize the complete read/merge/write across application workers.
        db.execute('BEGIN IMMEDIATE')
        created = float(event.get('created', time.time()))
        event = dict(event)
        event.setdefault('first_seen', created)
        event.setdefault('last_seen', created)
        event.setdefault('captures', 1)
        occurrence_key = _occurrence_key(event, created)
        correlation_key = str(event.get('fault_key') or event['id'])
        event['fault_key'] = correlation_key
        correlation_fingerprint = hashlib.sha256(correlation_key.encode('utf-8')).hexdigest()[:16]
        event['seen_fault_keys'] = [correlation_fingerprint]
        event['occurrence_count'] = 1
        day_prefix = occurrence_key.split(':', 1)[0]
        stored_fault_key = f'{day_prefix}:{correlation_key}'
        # A delayed capture may have a different signature from its backend
        # diagnosis; resolve its original correlation before comparing signatures.
        existing = db.execute(
            'SELECT e.id,e.created,e.last_seen,e.occurrence_key,e.detail FROM events e '
            'JOIN event_correlations c ON c.event_id=e.id WHERE c.day=? AND c.fingerprint=?',
            (day_prefix, correlation_fingerprint),
        ).fetchone()
        if not existing:
            existing = db.execute(
                'SELECT id,created,last_seen,occurrence_key,detail FROM events WHERE occurrence_key=?',
                (occurrence_key,),
            ).fetchone()
        if existing:
            existing_detail = json.loads(existing['detail'])
            merged = _merge_details(existing_detail, event)
            merged_key = _occurrence_key(merged, merged['first_seen'])
            key_owner = db.execute(
                'SELECT id FROM events WHERE occurrence_key=? AND id<>?', (merged_key, existing['id'])
            ).fetchone()
            if not key_owner:
                existing_key = merged_key
            else:
                existing_key = existing['occurrence_key']
            db.execute(
                'UPDATE events SET created=?,last_seen=?,occurrence_key=?,module=?,title=?,error_type=?,detail=? WHERE id=?',
                (merged['first_seen'], merged['last_seen'], existing_key,
                 merged['module'], merged['title'], merged['error_type'],
                 json.dumps(merged, ensure_ascii=False), existing['id']),
            )
        else:
            event['created'] = created
            event['first_seen'] = created
            event['last_seen'] = created
            db.execute(
                'INSERT INTO events(id,created,last_seen,occurrence_key,request_id,fault_key,module,title,error_type,detail) '
                'VALUES(?,?,?,?,?,?,?,?,?,?)',
                (event['id'], created, created, occurrence_key, event.get('request_id', ''), stored_fault_key,
                 event['module'], event['title'], event['error_type'], json.dumps(event, ensure_ascii=False)),
            )
        db.execute(
            'INSERT OR IGNORE INTO event_correlations(day,fingerprint,event_id) VALUES(?,?,?)',
            (day_prefix, correlation_fingerprint, existing['id'] if existing else event['id']),
        )
    maintain()


def _filter_clause(params):
    clauses, args = [], []
    for field in ('module',):
        if params.get(field):
            clauses.append(f'{field}=?')
            args.append(params[field])
    if params.get('q'):
        clauses.append('(title LIKE ? OR error_type LIKE ?)')
        args.extend([f"%{params['q']}%"] * 2)
    if params.get('since') is not None:
        clauses.append('last_seen >= ?')
        args.append(params['since'])
    if params.get('until') is not None:
        clauses.append('created <= ?')
        args.append(params['until'])
    where = ' WHERE ' + ' AND '.join(clauses) if clauses else ''
    return where, args


def list_events(params):
    where, args = _filter_clause(params)
    page = params.get('page', 1)
    with connection() as db:
        total = db.execute('SELECT COUNT(*) FROM events' + where, args).fetchone()[0]
        rows = db.execute(
            'SELECT id,created,last_seen,module,title,error_type,request_id,detail FROM events'
            + where + ' ORDER BY last_seen DESC,id DESC LIMIT 20 OFFSET ?',
            [*args, (page - 1) * 20],
        ).fetchall()
    result = []
    for row in rows:
        detail = json.loads(row['detail'])
        summary = {key: row[key] for key in ('id', 'created', 'last_seen', 'module', 'title', 'error_type', 'request_id')}
        summary.update({
            'captures': detail.get('captures', 1),
            'occurrence_count': detail.get('occurrence_count', 1),
        })
        result.append(summary)
    return {'list': result, 'total': total, 'page': page, 'page_size': 20}


def detail(event_id):
    with connection() as db:
        row = db.execute('SELECT detail FROM events WHERE id=?', (event_id,)).fetchone()
    if not row:
        return None
    result = json.loads(row[0])
    result.pop('seen_fault_keys', None)
    return result


def overview():
    maintain()
    with connection() as db:
        row = db.execute('SELECT COUNT(*) AS total,MAX(last_seen) AS latest,SUM(last_seen>=?) AS recent FROM events', (time.time() - 86400,)).fetchone()
        modules = [r[0] for r in db.execute('SELECT DISTINCT module FROM events ORDER BY module')]
        config = policy(db)
    return {'total': row['total'], 'latest': row['latest'], 'recent': row['recent'] or 0, 'bytes': size(), 'policy': config, 'modules': modules}


def delete(ids=None):
    with connection() as db:
        if ids is None:
            db.execute('DELETE FROM events')
        elif ids:
            db.execute('DELETE FROM events WHERE id IN (' + ','.join('?' for _ in ids) + ')', ids)
        reclaim(db)


def delete_matching(params):
    where, args = _filter_clause(params)
    if not where:
        raise ValueError('At least one system log filter is required')
    with connection() as db:
        deleted = db.execute('DELETE FROM events' + where, args).rowcount
        reclaim(db)
    return deleted


def set_policy(days, max_mb):
    with connection() as db:
        db.execute('UPDATE config SET days=?,max_mb=? WHERE id=1', (days, max_mb))
    maintain()
