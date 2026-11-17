"""Resolve offline models and prepare a verified ModelScope snapshot on this device."""
import hashlib
import json
import os
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

import requests
from filelock import FileLock, Timeout

from .storage import VideoError, check_space, runtime_root

REPOSITORY = 'pengzhendong/faster-whisper-small'
REVISION = '64d190b68b8763d051c645fb876ee6d41e73637b'
FILES = {
    'config.json': (2370, 'b55496ac7940a7ae47d2c01eab40edfd8701feec1229d9cce3b40014383fb828'),
    'model.bin': (483546902, '3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671'),
    'tokenizer.json': (2203239, 'fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab'),
    'vocabulary.txt': (459861, '34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913'),
}
TOTAL_BYTES = sum(size for size, _ in FILES.values())


def configured_model():
    return os.getenv('ODOC_VIDEO_ASR_MODEL', 'small')


def model_root():
    root = runtime_root() / 'models'
    root.mkdir(exist_ok=True, mode=0o700)
    return root


def resolved_model():
    """Prefer the managed snapshot, retaining existing offline HF and custom paths."""
    model = configured_model()
    root = model_root()
    managed = root / 'modelscope-small'
    if model == 'small' and (managed / '.ready').is_file():
        if all((managed / name).is_file() and (managed / name).stat().st_size == size
               for name, (size, _) in FILES.items()):
            return str(managed)
    if Path(model).is_dir():
        cached = model
    else:
        try:
            from faster_whisper.utils import download_model
            cached = download_model(model, cache_dir=str(root), local_files_only=True)
        except (ImportError, OSError, ValueError):
            return None
    if all((Path(cached) / name).is_file() for name in ('model.bin', 'config.json', 'tokenizer.json')):
        return str(cached)
    return None


def _lock(root):
    return FileLock(root / 'download.lock', timeout=0, thread_local=False)


def _write_state(root, **state):
    path = root / ('status-' + uuid.uuid4().hex + '.tmp')
    try:
        path.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
        path.replace(root / 'download.json')
    finally:
        path.unlink(missing_ok=True)


def model_status():
    root = model_root()
    state = {'state': 'missing', 'downloaded_bytes': 0, 'message': '模型尚未下载'}
    try:
        state.update(json.loads((root / 'download.json').read_text()))
    except (OSError, ValueError):
        pass
    ready = resolved_model()
    if ready:
        state.update(state='ready', downloaded_bytes=TOTAL_BYTES, message='已就绪，可以返回视频任务重试')
    elif state['state'] == 'ready':
        state.update(state='missing', downloaded_bytes=0, message='模型文件缺失，请重新下载')
    elif state['state'] in ('downloading', 'verifying'):
        try:
            with _lock(root):
                state.update(state='failed', message='下载已中断，请重试；已完整下载的文件会复用')
        except Timeout:
            pass
    return {**state, 'model': configured_model(), 'source': 'ModelScope 魔搭',
            'total_bytes': TOTAL_BYTES, 'can_download': configured_model() == 'small'}


def _matches(path, size, digest):
    if not path.is_file() or path.stat().st_size != size:
        return False
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest() == digest


def _download(root):
    staging = root / 'modelscope-small'
    staging.mkdir(exist_ok=True, mode=0o700)
    (staging / '.ready').unlink(missing_ok=True)
    check_space(root, TOTAL_BYTES)
    completed = 0
    started = time.monotonic()
    with requests.Session() as client:
        for name, (size, digest) in FILES.items():
            target = staging / name
            if _matches(target, size, digest):
                completed += size
                continue
            partial = staging / (name + '.part')
            received, last_update = 0, 0
            checksum = hashlib.sha256()
            try:
                url = f'https://modelscope.cn/models/{REPOSITORY}/resolve/{REVISION}/{name}'
                with client.get(url, stream=True, timeout=(15, 45)) as response:
                    response.raise_for_status()
                    with partial.open('wb') as output:
                        for chunk in response.iter_content(1024 * 1024):
                            received += len(chunk)
                            if received > size or time.monotonic() - started > 7200:
                                raise VideoError('模型下载超过大小或时间限制，请重试')
                            output.write(chunk)
                            checksum.update(chunk)
                            if time.monotonic() - last_update >= 1:
                                _write_state(root, state='downloading', downloaded_bytes=completed + received,
                                             message='正在从魔搭下载模型')
                                last_update = time.monotonic()
                if received != size or checksum.hexdigest() != digest:
                    raise VideoError('模型文件校验失败，请重试下载')
                partial.replace(target)
                completed += received
            finally:
                partial.unlink(missing_ok=True)
    _write_state(root, state='verifying', downloaded_bytes=completed, message='下载完成，正在验证模型能否加载')
    try:
        check = subprocess.run([sys.executable, '-m', 'article.video_notes.asr', '--check', str(staging)],
                               capture_output=True, timeout=180)
    except subprocess.TimeoutExpired:
        raise VideoError('模型加载验证超时，请检查服务器内存后重试') from None
    if check.returncode:
        raise VideoError('模型加载失败，请检查转写依赖和服务器内存后重试')
    (staging / '.ready').write_text(REVISION)
    _write_state(root, state='ready', downloaded_bytes=completed, message='已就绪，可以返回视频任务重试')


def _run(root, lock):
    try:
        _download(root)
    except Exception as exc:
        message = str(exc) if isinstance(exc, VideoError) else '模型下载失败，请检查服务器到魔搭的网络与磁盘空间后重试'
        _write_state(root, state='failed', downloaded_bytes=0, message=message)
    finally:
        lock.release()


def prepare_model(background=False):
    if resolved_model():
        return model_status()
    if configured_model() != 'small':
        raise VideoError('魔搭下载支持默认 small 模型，请将 ODOC_VIDEO_ASR_MODEL 设为 small 后重启服务')
    root = model_root()
    lock = _lock(root)
    try:
        lock.acquire()
    except Timeout:
        return model_status()
    try:
        _write_state(root, state='downloading', downloaded_bytes=0, message='正在从魔搭下载模型')
        if background:
            threading.Thread(target=_run, args=(root, lock), name='video-asr-download', daemon=True).start()
        else:
            _run(root, lock)
    except Exception:
        lock.release()
        raise
    return model_status()
