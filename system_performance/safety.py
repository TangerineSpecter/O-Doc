"""Do not persist request bodies, SQL literals, URLs, locals or absolute source paths."""
import hashlib
import os
import sys
import threading
from functools import lru_cache
from pathlib import Path
import sqlparse
from sqlparse import tokens as T

ROOT = Path(__file__).resolve().parent.parent
EXCLUDED = ('system_performance/', 'system_logs/', '.venv/', 'site-packages/')
_sql_cache = {}
_sql_cache_lock = threading.Lock()


@lru_cache(maxsize=4096)
def _project_path(filename):
    if filename.startswith('<'):
        return None
    try:
        path = Path(filename).resolve().relative_to(ROOT).as_posix()
        return None if path.startswith(EXCLUDED) else path
    except (ValueError, OSError):
        return None


def location() -> list[dict]:
    frames = []
    frame = sys._getframe(1)
    try:
        while frame and len(frames) < 5:
            path = _project_path(frame.f_code.co_filename)
            if path is not None:
                frames.append(dict(file=path, function=frame.f_code.co_name, line=frame.f_lineno))
            frame = frame.f_back
    finally:
        del frame
    return frames


def sql_identity(sql) -> dict:
    # sqlparse is used only for hashing, never to certify that text is safe to export.
    # Fail closed: exported SQL is a verb and fingerprint, not a reconstructed statement.
    raw = sql if isinstance(sql, str) else ''
    raw_key = hashlib.sha256(raw.encode()).hexdigest()
    with _sql_cache_lock:
        cached = _sql_cache.get(raw_key)
    if cached is not None:
        return dict(cached)
    if not raw or len(raw) > 100000:
        return dict(fingerprint=hashlib.sha256(raw.encode()).hexdigest(), statement='UNKNOWN', template=None)
    try:
        parsed = sqlparse.parse(raw)
        verb = parsed[0].get_type() if len(parsed) == 1 else 'UNKNOWN'
        normalized = []
        for token in parsed[0].flatten() if len(parsed) == 1 else []:
            if token.is_whitespace or token.ttype in T.Comment:
                continue
            normalized.append('?' if token.ttype in T.Literal or token.ttype in T.Name.Placeholder else token.value.lower())
        fingerprint = hashlib.sha256(' '.join(normalized).encode()).hexdigest()
    except Exception:
        verb, fingerprint = 'UNKNOWN', hashlib.sha256(raw.encode()).hexdigest()
    result = dict(fingerprint=fingerprint, statement=verb if verb in {'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE'} else 'UNKNOWN',
                  template=None, template_reason='仅保存结构指纹，未启用可靠的 PostgreSQL 文本脱敏器')
    with _sql_cache_lock:
        if len(_sql_cache) >= 512:
            _sql_cache.pop(next(iter(_sql_cache)))
        _sql_cache[raw_key] = result
    return dict(result)


def build_identity() -> dict:
    from o_doc.health import get_current_app_version, get_current_build_commit
    import django
    return dict(version=get_current_app_version(), commit=get_current_build_commit() or None,
                python=sys.version.split()[0], django=django.get_version(), collector_version=1,
                threads=os.getenv('GUNICORN_THREADS', '4'), workers=os.getenv('WEB_CONCURRENCY', 'unknown'))
