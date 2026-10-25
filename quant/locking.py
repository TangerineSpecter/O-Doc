"""Coordinate short API/worker writes with exclusive snapshot restoration."""
import fcntl
import hashlib
import os
import tempfile
import threading
from contextlib import contextmanager
from functools import wraps
from pathlib import Path

_local = threading.local()


@contextmanager
def domain_lock(exclusive=False):
    if getattr(_local, 'depth', 0):
        yield
        return
    root = Path(tempfile.gettempdir()) / f'odoc-quant-{os.getuid()}'
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
def collection_lock(coll_id):
    identity = str(coll_id)
    held = getattr(_local, 'collections', set())
    if identity in held:
        yield
        return
    root = Path(tempfile.gettempdir()) / f'odoc-quant-{os.getuid()}'
    with domain_lock(), (root / hashlib.sha256(identity.encode()).hexdigest()).open('a') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        _local.collections = held | {identity}
        try:
            yield
        finally:
            _local.collections = held
            fcntl.flock(stream, fcntl.LOCK_UN)


def snapshot_guard(fn):
    @wraps(fn)
    def guarded(*args, **kwargs):
        with domain_lock(exclusive=True):
            return fn(*args, **kwargs)
    return guarded
