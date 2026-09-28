"""农场写入与同步导入/导出互斥；进程内可重入，跨 WSGI 进程用文件锁。"""
import fcntl
import functools
import hashlib
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path
from django.conf import settings

_lock = threading.RLock()
_local = threading.local()


@contextmanager
def farm_gate():
    with _lock:
        if getattr(_local, 'depth', 0):
            _local.depth += 1
            try:
                yield
            finally:
                _local.depth -= 1
            return
        name = hashlib.sha256(str(settings.BASE_DIR).encode()).hexdigest()[:16]
        with (Path(tempfile.gettempdir()) / f'odoc-farm-{name}.lock').open('a') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            _local.depth = 1
            try:
                yield
            finally:
                _local.depth = 0
                fcntl.flock(handle, fcntl.LOCK_UN)


def guarded(fn):
    @functools.wraps(fn)
    def wrapped(*args, **kwargs):
        with farm_gate():
            return fn(*args, **kwargs)
    return wrapped
