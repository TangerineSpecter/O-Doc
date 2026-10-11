"""Short domain locks coordinate API writes, worker commits and snapshot restore."""
import hashlib
import os
import tempfile
import threading
import fcntl
from pathlib import Path
from contextlib import contextmanager
from functools import wraps

_local = threading.local()


@contextmanager
def domain_lock(exclusive=False):
    if getattr(_local, 'depth', 0):
        yield
        return
    root = Path(tempfile.gettempdir()) / f'odoc-novel-{os.getuid()}'
    root.mkdir(mode=0o700, exist_ok=True)
    with (root / 'snapshot').open('a') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        _local.depth = 1
        try:
            yield
        finally:
            _local.depth = 0
            fcntl.flock(stream, fcntl.LOCK_UN)


@contextmanager
def project_lock(project_id):
    root = Path(tempfile.gettempdir()) / f'odoc-novel-{os.getuid()}'
    with domain_lock(), (root / hashlib.sha256(str(project_id).encode()).hexdigest()).open('a') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def snapshot_guard(fn):
    @wraps(fn)
    def guarded(*args, **kwargs):
        with domain_lock(exclusive=True):
            return fn(*args, **kwargs)
    return guarded
