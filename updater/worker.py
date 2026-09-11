import gzip
import json
import os
import re
import shutil
import signal
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path


VERSION_PATTERN = re.compile(r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$')
COMMIT_PATTERN = re.compile(r'^[0-9a-f]{40}$', re.IGNORECASE)
ACTIVE_STATES = {'queued', 'pulling', 'verifyingImage', 'backingUp', 'restarting', 'healthCheck'}


class UpdateWorkerError(Exception):
    pass


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def atomic_write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as file_obj:
            json.dump(value, file_obj, ensure_ascii=False, separators=(',', ':'))
            file_obj.flush()
            os.fsync(file_obj.fileno())
        os.replace(temp_name, path)
        os.chmod(path, 0o600)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def read_json(path):
    with path.open('r', encoding='utf-8') as file_obj:
        value = json.load(file_obj)
    if not isinstance(value, dict):
        raise UpdateWorkerError(f'{path.name} 内容必须是 JSON 对象')
    return value


def parse_env_file(path):
    values = {}
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key.strip()] = value
    return values


def normalize_version(value):
    version = str(value or '').strip().removeprefix('v')
    if not VERSION_PATTERN.fullmatch(version):
        raise UpdateWorkerError('目标版本必须是 X.Y.Z 格式')
    return version


def normalize_commit(value):
    commit = str(value or '').strip().lower()
    if not COMMIT_PATTERN.fullmatch(commit):
        raise UpdateWorkerError('目标 commit 必须是 40 位 Git SHA')
    return commit


def image_with_tag(image, tag):
    image = str(image or '').strip()
    if not image or '@' in image or any(character.isspace() for character in image):
        raise UpdateWorkerError('当前 IMAGE_NAME 不能用于按版本更新')
    last_slash = image.rfind('/')
    last_colon = image.rfind(':')
    repository = image[:last_colon] if last_colon > last_slash else image
    if not repository:
        raise UpdateWorkerError('无法从 IMAGE_NAME 解析镜像仓库')
    return f'{repository}:{tag}'


class UpdateWorker:
    def __init__(self, update_dir, deploy_dir, command_runner=None):
        self.update_dir = Path(update_dir).resolve()
        self.deploy_dir = Path(deploy_dir).resolve()
        self.compose_file = self.deploy_dir / 'compose.prod.yml'
        self.env_file = self.deploy_dir / '.env'
        self.request_path = self.update_dir / 'request.json'
        self.active_path = self.update_dir / 'active.json'
        self.status_path = self.update_dir / 'status.json'
        self.heartbeat_path = self.update_dir / 'heartbeat.json'
        self.backup_dir = self.update_dir / 'backups'
        self.health_url = os.getenv('ODOC_UPDATE_HEALTH_URL', 'http://app:11800/api/health/')
        self.poll_seconds = max(1, int(os.getenv('ODOC_UPDATE_POLL_SECONDS', '2')))
        self.health_timeout_seconds = max(30, int(os.getenv('ODOC_UPDATE_HEALTH_TIMEOUT_SECONDS', '180')))
        self.command_runner = command_runner or self._run_command
        self.stop_event = threading.Event()
        self.current_status = {}

    @staticmethod
    def _run_command(args, *, env=None, timeout=300):
        result = subprocess.run(
            args,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or '').strip()
            raise UpdateWorkerError(detail or f'命令执行失败：{args[0]}')
        return result.stdout.strip()

    def _validate_paths(self):
        if not self.compose_file.is_file() or not self.env_file.is_file():
            raise UpdateWorkerError('未找到 compose.prod.yml 或 .env')
        self.update_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    def _write_status(self, state, progress, message, **extra):
        status = {
            **self.current_status,
            'state': state,
            'progress': progress,
            'message': message,
            **extra,
        }
        self.current_status = status
        atomic_write_json(self.status_path, status)

    def _public_error(self, error):
        message = str(error) or '更新过程中发生未知错误'
        for private_path in (str(self.deploy_dir), str(self.update_dir), '/root/.docker'):
            message = message.replace(private_path, '[受保护路径]')
        return message

    def _heartbeat_loop(self):
        while not self.stop_event.is_set():
            atomic_write_json(self.heartbeat_path, {'updated_at': utc_now_iso(), 'protocol': 1})
            self.stop_event.wait(5)

    def _docker_inspect(self, container_name, template):
        return self.command_runner(
            ['docker', 'inspect', '--format', template, container_name],
            timeout=30,
        )

    def _compose_args(self, project_name, *args):
        return [
            'docker', 'compose',
            '-p', project_name,
            '--env-file', str(self.env_file),
            '-f', str(self.compose_file),
            *args,
        ]

    def _compose_up(self, project_name, image_name):
        command_env = os.environ.copy()
        command_env['IMAGE_NAME'] = image_name
        self.command_runner(
            self._compose_args(project_name, 'up', '-d', '--no-deps', '--force-recreate', 'app'),
            env=command_env,
            timeout=180,
        )

    def _verify_image(self, image_name, target_version, target_commit):
        labels_json = self.command_runner(
            ['docker', 'image', 'inspect', '--format', '{{json .Config.Labels}}', image_name],
            timeout=30,
        )
        try:
            labels = json.loads(labels_json or '{}') or {}
        except json.JSONDecodeError as exc:
            raise UpdateWorkerError('无法读取目标镜像构建标签') from exc

        image_version = normalize_version(labels.get('org.opencontainers.image.version'))
        image_commit = normalize_commit(labels.get('org.opencontainers.image.revision'))
        if image_version != target_version or image_commit != target_commit:
            raise UpdateWorkerError(
                f'目标镜像尚未就绪：期望 v{target_version}/{target_commit[:8]}，'
                f'实际 v{image_version}/{image_commit[:8]}'
            )

    def _create_database_backup(self, project_name, env_values, target_version):
        database_user = env_values.get('POSTGRES_USER') or 'odoc'
        database_name = env_values.get('POSTGRES_DB') or 'odoc'
        timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
        backup_name = f'postgres-before-v{target_version}-{timestamp}.sql.gz'
        final_path = self.backup_dir / backup_name
        temp_path = self.backup_dir / f'.{backup_name}.tmp'
        command = self._compose_args(
            project_name,
            'exec', '-T', 'db',
            'pg_dump', '-U', database_user, '-d', database_name,
        )

        copy_errors = []
        stderr_file = tempfile.TemporaryFile()
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=stderr_file)

        def stream_backup():
            try:
                with gzip.open(temp_path, 'wb') as gzip_file:
                    shutil.copyfileobj(process.stdout, gzip_file)
            except Exception as exc:  # pragma: no cover - 由主线程统一处理。
                copy_errors.append(exc)

        copy_worker = threading.Thread(
            target=stream_backup,
            name='database-backup-stream',
            daemon=True,
        )
        copy_worker.start()
        try:
            return_code = process.wait(timeout=300)
            copy_worker.join(timeout=5)
            if copy_worker.is_alive():
                raise UpdateWorkerError('PostgreSQL 备份流未正常结束')
            if copy_errors:
                raise UpdateWorkerError(f'写入 PostgreSQL 备份失败：{copy_errors[0]}')
            stderr_file.seek(0)
            stderr = stderr_file.read().decode('utf-8', errors='replace').strip()
            if return_code != 0:
                raise UpdateWorkerError(stderr or 'PostgreSQL 备份失败')
            os.replace(temp_path, final_path)
        except subprocess.TimeoutExpired as exc:
            process.kill()
            process.wait(timeout=10)
            copy_worker.join(timeout=5)
            temp_path.unlink(missing_ok=True)
            raise UpdateWorkerError('PostgreSQL 备份超过 300 秒，已终止') from exc
        except Exception:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=10)
            copy_worker.join(timeout=5)
            temp_path.unlink(missing_ok=True)
            raise
        finally:
            if process.stdout:
                process.stdout.close()
            stderr_file.close()

        self._prune_backups()
        return backup_name

    def _prune_backups(self):
        backups = sorted(
            self.backup_dir.glob('postgres-before-v*.sql.gz'),
            key=lambda path: path.stat().st_mtime,
        )
        for old_backup in backups[:-3]:
            if old_backup.parent.resolve() == self.backup_dir.resolve():
                old_backup.unlink(missing_ok=True)

    def _wait_for_health(self, expected_version=None, expected_commit=None):
        deadline = time.monotonic() + self.health_timeout_seconds
        last_error = '服务尚未恢复'
        while time.monotonic() < deadline and not self.stop_event.is_set():
            try:
                with urllib.request.urlopen(self.health_url, timeout=3) as response:
                    payload = json.loads(response.read().decode('utf-8'))
                if not payload.get('ok'):
                    raise UpdateWorkerError('健康接口未返回 ok')
                if expected_version and normalize_version(payload.get('version')) != expected_version:
                    raise UpdateWorkerError('运行版本与目标版本不一致')
                if expected_commit and normalize_commit(payload.get('commit')) != expected_commit:
                    raise UpdateWorkerError('运行 commit 与目标 commit 不一致')
                return
            except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError, UpdateWorkerError) as exc:
                last_error = str(exc)
                time.sleep(3)
        raise UpdateWorkerError(f'健康检查超时：{last_error}')

    def _load_request(self):
        os.replace(self.request_path, self.active_path)
        request_value = read_json(self.active_path)
        if set(request_value) != {'request_id', 'target_version', 'target_commit'}:
            raise UpdateWorkerError('更新请求包含不允许的字段')
        request_id = str(request_value.get('request_id') or '')
        try:
            parsed_request_id = uuid.UUID(request_id)
        except (ValueError, AttributeError) as exc:
            raise UpdateWorkerError('更新请求 ID 无效') from exc
        if str(parsed_request_id) != request_id.lower():
            raise UpdateWorkerError('更新请求 ID 无效')
        request_value['target_version'] = normalize_version(request_value.get('target_version'))
        request_value['target_commit'] = normalize_commit(request_value.get('target_commit'))
        return request_value

    def _persist_active_transaction(self, request_value, previous_image, phase, backup_name=''):
        atomic_write_json(self.active_path, {
            **request_value,
            'previous_image': previous_image,
            'phase': phase,
            'backup_name': backup_name,
        })

    def _recover_interrupted_request(self):
        try:
            active_value = read_json(self.active_path)
        except Exception as exc:
            self.current_status = {}
            self._write_status(
                'failed', 100, self._public_error(exc),
                finished_at=utc_now_iso(), rollback_succeeded=None,
            )
            return

        target_version = str(active_value.get('target_version') or '')
        target_commit = str(active_value.get('target_commit') or '')
        backup_name = str(active_value.get('backup_name') or '')
        if backup_name and not re.fullmatch(r'postgres-before-v[0-9.]+-[0-9]{8}-[0-9]{6}\.sql\.gz', backup_name):
            backup_name = ''
        self.current_status = {
            'request_id': str(active_value.get('request_id') or ''),
            'target_version': target_version,
            'target_commit': target_commit,
            'requested_at': '',
            'started_at': utc_now_iso(),
            'finished_at': '',
            'backup_name': backup_name,
            'rollback_succeeded': None,
        }

        previous_image = str(active_value.get('previous_image') or '').lower()
        phase = active_value.get('phase')
        if phase == 'prepared':
            self._write_status(
                'failed', 100, '更新服务重启，任务在重建应用前中断，原服务未变更',
                finished_at=utc_now_iso(), rollback_succeeded=None,
            )
            return
        if phase not in {'restarting', 'healthy'}:
            self._write_status(
                'failed', 100, '更新服务重启，但任务阶段记录无效，无法自动恢复',
                finished_at=utc_now_iso(), rollback_succeeded=False,
            )
            return
        if not re.fullmatch(r'sha256:[0-9a-f]{64}', previous_image):
            self._write_status(
                'failed', 100, '更新服务重启，但缺少可信的旧镜像 ID，无法自动回退',
                finished_at=utc_now_iso(), rollback_succeeded=False,
            )
            return

        try:
            env_values = parse_env_file(self.env_file)
            container_name = env_values.get('CONTAINER_NAME') or 'o-doc'
            project_name = self._docker_inspect(
                container_name,
                '{{ index .Config.Labels "com.docker.compose.project" }}',
            )
            if not project_name:
                raise UpdateWorkerError('无法识别当前 Docker Compose 项目')
            if phase == 'healthy':
                try:
                    self._wait_for_health(
                        normalize_version(target_version),
                        normalize_commit(target_commit),
                    )
                    self._write_status(
                        'succeeded', 100, f'已更新到 v{target_version}',
                        finished_at=utc_now_iso(), rollback_succeeded=None,
                    )
                    return
                except Exception:
                    pass
            self._write_status('restarting', 90, '检测到中断的更新任务，正在恢复旧镜像')
            self._compose_up(project_name, previous_image)
            self._wait_for_health()
            self._write_status(
                'rolledBack', 100, '更新任务曾意外中断，已恢复旧镜像',
                finished_at=utc_now_iso(), rollback_succeeded=True,
            )
        except Exception as exc:
            self._write_status(
                'failed', 100, f'中断任务自动回退失败：{self._public_error(exc)}',
                finished_at=utc_now_iso(), rollback_succeeded=False,
            )

    def process_request(self):
        request_value = self._load_request()
        target_version = request_value['target_version']
        target_commit = request_value['target_commit']
        self.current_status = {
            'request_id': request_value['request_id'],
            'target_version': target_version,
            'target_commit': target_commit,
            'requested_at': utc_now_iso(),
            'started_at': utc_now_iso(),
            'finished_at': '',
            'backup_name': '',
            'rollback_succeeded': None,
        }

        env_values = parse_env_file(self.env_file)
        current_image_setting = env_values.get('IMAGE_NAME') or 'ghcr.io/tangerinespecter/o-doc:latest'
        target_image = image_with_tag(current_image_setting, f'v{target_version}')
        container_name = env_values.get('CONTAINER_NAME') or 'o-doc'
        project_name = self._docker_inspect(
            container_name,
            '{{ index .Config.Labels "com.docker.compose.project" }}',
        )
        if not project_name:
            raise UpdateWorkerError('无法识别当前 Docker Compose 项目')
        # 使用不可变 image ID。若同名版本 tag 被移动，拉取动作会改写本地 tag，
        # 只有 image ID 能确保失败时真正回退到更新前运行的镜像。
        previous_image = self._docker_inspect(container_name, '{{.Image}}')
        if not re.fullmatch(r'sha256:[0-9a-f]{64}', previous_image.lower()):
            raise UpdateWorkerError('无法读取当前应用的可信镜像 ID')
        self._persist_active_transaction(request_value, previous_image.lower(), 'prepared')

        restarted = False
        try:
            self._write_status('pulling', 10, f'正在拉取 v{target_version} 镜像')
            self.command_runner(['docker', 'pull', target_image], timeout=600)

            self._write_status('verifyingImage', 25, '正在核对镜像版本和构建 commit')
            self._verify_image(target_image, target_version, target_commit)

            self._write_status('backingUp', 40, '正在备份 PostgreSQL 数据库')
            backup_name = self._create_database_backup(project_name, env_values, target_version)
            self.current_status['backup_name'] = backup_name

            self._write_status('restarting', 60, '正在重建应用容器')
            restarted = True
            self._persist_active_transaction(
                request_value,
                previous_image.lower(),
                'restarting',
                backup_name,
            )
            self._compose_up(project_name, target_image)

            self._write_status('healthCheck', 82, '正在等待新版本通过健康检查')
            self._wait_for_health(target_version, target_commit)
            self._persist_active_transaction(
                request_value,
                previous_image.lower(),
                'healthy',
                backup_name,
            )
            self._write_status(
                'succeeded', 100, f'已更新到 v{target_version}',
                finished_at=utc_now_iso(), rollback_succeeded=None,
            )
        except Exception as exc:
            public_error = self._public_error(exc)
            if not restarted:
                self._write_status(
                    'failed', 100, public_error,
                    finished_at=utc_now_iso(), rollback_succeeded=None,
                )
                return

            self._write_status('restarting', 88, f'更新失败，正在回退旧镜像：{public_error}')
            try:
                self._compose_up(project_name, previous_image)
                self._wait_for_health()
                self._write_status(
                    'rolledBack', 100, f'更新失败，已恢复旧镜像：{public_error}',
                    finished_at=utc_now_iso(), rollback_succeeded=True,
                )
            except Exception as rollback_exc:
                self._write_status(
                    'failed', 100,
                    f'更新失败且旧镜像回退失败：{self._public_error(rollback_exc)}；原始错误：{public_error}',
                    finished_at=utc_now_iso(), rollback_succeeded=False,
                )

    def run(self):
        self._validate_paths()
        heartbeat_thread = threading.Thread(target=self._heartbeat_loop, name='update-heartbeat', daemon=True)
        heartbeat_thread.start()
        if self.active_path.exists():
            try:
                self._recover_interrupted_request()
            finally:
                self.active_path.unlink(missing_ok=True)
        while not self.stop_event.is_set():
            if self.request_path.exists():
                try:
                    self.process_request()
                except Exception as exc:
                    self.current_status = {
                        **self.current_status,
                        'target_version': self.current_status.get('target_version', ''),
                        'target_commit': self.current_status.get('target_commit', ''),
                        'requested_at': self.current_status.get('requested_at', ''),
                        'started_at': self.current_status.get('started_at', utc_now_iso()),
                        'backup_name': self.current_status.get('backup_name', ''),
                        'rollback_succeeded': self.current_status.get('rollback_succeeded'),
                    }
                    self._write_status(
                        'failed', 100, self._public_error(exc), finished_at=utc_now_iso(),
                    )
                finally:
                    self.active_path.unlink(missing_ok=True)
            self.stop_event.wait(self.poll_seconds)

    def stop(self, *_args):
        self.stop_event.set()


def main():
    update_dir = os.getenv('ODOC_UPDATE_DIR', '/var/lib/odoc-update')
    deploy_dir = os.getenv('ODOC_DEPLOY_DIR', '/deployment')
    worker = UpdateWorker(update_dir, deploy_dir)
    signal.signal(signal.SIGTERM, worker.stop)
    signal.signal(signal.SIGINT, worker.stop)
    worker.run()


if __name__ == '__main__':
    main()
