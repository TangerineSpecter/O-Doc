"""Cross-process short transactions; snapshot exclusive, courses concurrent."""
import hashlib
import os
import tempfile
import threading
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
import fcntl

_local = threading.local()


def lock_root():
    root = Path(tempfile.gettempdir()) / f'odoc-learning-{os.getuid()}'
    root.mkdir(mode=0o700, exist_ok=True)
    return root


@contextmanager
def domain_lock(exclusive=False):
    if getattr(_local, 'depth', 0):
        _local.depth += 1
        try:
            yield
        finally:
            _local.depth -= 1
        return
    with (lock_root() / 'snapshot').open('a') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        _local.depth = 1
        try:
            yield
        finally:
            _local.depth = 0
            fcntl.flock(stream, fcntl.LOCK_UN)


@contextmanager
def course_lock(course_id):
    path = lock_root() / hashlib.sha256(str(course_id).encode()).hexdigest()
    with domain_lock(), path.open('a') as stream:
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
