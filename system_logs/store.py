"""Independent SQLite store. Every operation uses its own bounded-time connection."""
import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

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
        db.executescript('''
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY, created REAL NOT NULL, request_id TEXT NOT NULL,
                fault_key TEXT NOT NULL UNIQUE, module TEXT NOT NULL, title TEXT NOT NULL,
                error_type TEXT NOT NULL, detail TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS events_created ON events(created);
            CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), days INTEGER, max_mb INTEGER);
            INSERT OR IGNORE INTO config VALUES(1,30,100);
        ''')
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


def reclaim(db):
    db.commit()
    db.execute('VACUUM')


def maintain():
    with connection() as db:
        config = policy(db)
        deleted = db.execute('DELETE FROM events WHERE created < ?', (time.time() - config['days'] * 86400,)).rowcount
        if deleted:
            reclaim(db)
        while size() > config['max_mb'] * 1024 * 1024:
            removed = db.execute('DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY created LIMIT 100)').rowcount
            if not removed:
                break
            reclaim(db)


def write(event):
    with connection() as db:
        # Serialize the complete read/merge/write across application workers.
        db.execute('BEGIN IMMEDIATE')
        key = event.get('fault_key') or event['id']
        existing = db.execute('SELECT id,detail FROM events WHERE fault_key=?', (key,)).fetchone()
        if existing:
            merged = json.loads(existing['detail'])
            # Backend diagnosis wins even if browser reporting reaches another worker first.
            authoritative = (event.get('source') == 'backend' and merged.get('source') == 'frontend'
                             or event.get('exception_class') and not merged.get('exception_class'))
            existing_provider_status = merged.get('provider_http_status')
            incoming_provider_status = event.get('provider_http_status')
            for name, value in event.items():
                if name in {'id', 'created', 'fault_key', 'captures'}:
                    continue
                provider_field = name in {'provider_http_status', 'http_status', 'error_type', 'reason', 'provider_code', 'title'}
                if provider_field and existing_provider_status and not incoming_provider_status:
                    continue
                if provider_field and incoming_provider_status and not existing_provider_status:
                    merged[name] = value
                    continue
                if name not in merged or not merged[name] or authoritative and value is not None:
                    merged[name] = value
            merged['captures'] = min(10000, merged.get('captures', 1) + 1)
            db.execute('UPDATE events SET module=?,title=?,error_type=?,detail=? WHERE id=?',
                       (merged['module'], merged['title'], merged['error_type'], json.dumps(merged, ensure_ascii=False), existing['id']))
        else:
            db.execute('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)', (
                event['id'], event['created'], event.get('request_id', ''), key,
                event['module'], event['title'], event['error_type'], json.dumps(event, ensure_ascii=False)))
    maintain()


def list_events(params):
    clauses, args = [], []
    for field in ('module',):
        if params.get(field):
            clauses.append(f'{field}=?')
            args.append(params[field])
    if params.get('q'):
        clauses.append('(title LIKE ? OR error_type LIKE ?)')
        args.extend([f"%{params['q']}%"] * 2)
    for name, op in (('since', '>='), ('until', '<=')):
        if params.get(name) is not None:
            clauses.append(f'created {op} ?')
            args.append(params[name])
    where = ' WHERE ' + ' AND '.join(clauses) if clauses else ''
    page = params.get('page', 1)
    with connection() as db:
        total = db.execute('SELECT COUNT(*) FROM events' + where, args).fetchone()[0]
        rows = db.execute('SELECT id,created,module,title,error_type,request_id FROM events' + where + ' ORDER BY created DESC,id DESC LIMIT 20 OFFSET ?', [*args, (page - 1) * 20]).fetchall()
    return {'list': [dict(row) for row in rows], 'total': total, 'page': page, 'page_size': 20}


def detail(event_id):
    with connection() as db:
        row = db.execute('SELECT detail FROM events WHERE id=?', (event_id,)).fetchone()
    return json.loads(row[0]) if row else None


def overview():
    maintain()
    with connection() as db:
        row = db.execute('SELECT COUNT(*) AS total,MAX(created) AS latest,SUM(created>=?) AS recent FROM events', (time.time() - 86400,)).fetchone()
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


def set_policy(days, max_mb):
    with connection() as db:
        db.execute('UPDATE config SET days=?,max_mb=? WHERE id=1', (days, max_mb))
    maintain()
