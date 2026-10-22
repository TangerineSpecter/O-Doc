"""Process-owned queue markers; an exited executor cannot leave a live marker."""
import fcntl
import hashlib
import logging
import os
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

logger = logging.getLogger(__name__)


def _path(run_id: str, token: str) -> Path:
    name = hashlib.sha256(f'{run_id}:{token}'.encode()).hexdigest()
    return Path(tempfile.gettempdir()) / f'odoc-quant-{os.getuid()}' / 'queue' / name


@contextmanager
def _registry():
    root = _path('', '').parent
    root.parent.mkdir(mode=0o700, exist_ok=True)
    root.mkdir(mode=0o700, exist_ok=True)
    # Keep this one path stable. Serializing marker opens and removals prevents
    # a waiter on an unlinked inode from claiming or deleting a newer marker.
    with os.fdopen(os.open(root / 'registry', os.O_CREAT | os.O_RDWR, 0o600), 'a+b') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


@dataclass
class PendingLease:
    path: Path
    stream: BinaryIO

    def close(self) -> None:
        if self.stream.closed:
            return
        with _registry():
            if self.stream.closed:
                return
            try:
                self.path.unlink(missing_ok=True)
            except OSError:
                logger.warning('Failed to remove completed quant queue marker')
            finally:
                self.stream.close()


def claim(run_id: str, token: str) -> PendingLease | None:
    with _registry():
        path = _path(run_id, token)
        stream = os.fdopen(os.open(path, os.O_CREAT | os.O_RDWR, 0o600), 'a+b')
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            stream.close()
            return None
        except BaseException:
            stream.close()
            raise
        return PendingLease(path, stream)


def alive(run_id: str, token: str) -> bool:
    # Readers never create markers. This works across application processes,
    # unlike a Python dictionary of Futures in the request's current process.
    with _registry():
        try:
            stream = _path(run_id, token).open('rb')
        except FileNotFoundError:
            return False
        with stream:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return True
            fcntl.flock(stream, fcntl.LOCK_UN)
            return False
