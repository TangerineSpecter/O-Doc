"""Device-local inputs and intermediates, deliberately outside synced media."""
import os
import shutil
import tempfile
import uuid
from pathlib import Path

from django.conf import settings


MAX_BYTES = 512 * 1024**2
MAX_DURATION = 3 * 60 * 60


class VideoError(Exception):
    """An actionable message suitable for a job owner."""


class UploadNeeded(VideoError):
    pass


def validate_runtime_root(path: str | Path) -> Path:
    if not str(path).strip() or not Path(path).is_absolute():
        raise VideoError('视频临时目录必须是非空的绝对路径')
    root = Path(path).resolve()
    protected = [Path(settings.BASE_DIR).resolve(), Path.home().resolve(),
                 Path(settings.MEDIA_ROOT).resolve(), Path(tempfile.gettempdir()).resolve()]
    if any(root == item or root in item.parents for item in protected):
        raise VideoError('视频临时目录不能指向项目、用户、媒体或系统临时根目录及其上级')
    if root.is_relative_to(Path(settings.MEDIA_ROOT).resolve()):
        raise VideoError('视频临时目录必须位于媒体同步目录之外')
    return root


def runtime_root() -> Path:
    root = validate_runtime_root(os.environ.get('ODOC_VIDEO_ROOT', settings.BASE_DIR / 'runtime/video_notes'))
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    return root


def job_directory(root: Path, job_id: uuid.UUID, *, create: bool = False) -> Path:
    root = validate_runtime_root(root)
    directory = root / str(uuid.UUID(str(job_id)))
    if directory.is_symlink() or directory.resolve().parent != root:
        raise VideoError('视频任务目录超出允许的临时目录范围')
    if create:
        directory.mkdir(exist_ok=True, mode=0o700)
    return directory


def remove_job_directory(root: Path, job_id: uuid.UUID) -> None:
    shutil.rmtree(job_directory(root, job_id), ignore_errors=True)


def check_space(path, needed):
    if shutil.disk_usage(path).free < needed + 256 * 1024**2:
        raise VideoError('处理设备磁盘空间不足，请释放空间后重试')


def store_upload(directory, upload):
    """Serialize staging disk reservations; leave headroom for the serial decoder."""
    from filelock import FileLock, Timeout

    root = directory.parent
    try:
        with FileLock(root / 'upload.lock', timeout=4):
            staged = 0
            for path in root.glob('*/upload'):
                try:
                    staged += path.stat().st_size
                except FileNotFoundError:
                    continue  # The worker just finished this job and released its input.
            if staged + upload.size > 4 * 1024**3:
                raise VideoError('本机待处理的视频已达 4 GiB，请在其他任务完成后重试')
            check_space(directory, upload.size + MAX_BYTES)
            tmp = directory / 'upload.tmp'
            try:
                with tmp.open('wb') as out:
                    size = 0
                    for chunk in upload.chunks():
                        size += len(chunk)
                        if size > MAX_BYTES:
                            raise VideoError('视频文件超过 512 MiB')
                        out.write(chunk)
                (directory / 'transcript.json').unlink(missing_ok=True)
                tmp.replace(directory / 'upload')
            finally:
                tmp.unlink(missing_ok=True)
    except Timeout:
        raise VideoError('本机正在接收其他文件，请稍后重试') from None
