import logging
from io import BytesIO
from urllib.parse import urlparse

from webdav3.client import Client
from webdav3.exceptions import ResponseErrorCode


logger = logging.getLogger(__name__)
WEBDAV_CONNECTION_TIMEOUT_SECONDS = 8


class WebDavClient:
    def __init__(self, base_url, username, password):
        base_url = self.normalize_base_url(base_url)

        self.options = {
            'webdav_hostname': base_url,
            'webdav_login': username,
            'webdav_password': password,
            'disable_check': True,
            'timeout': 30
        }
        self.client = Client(self.options)

    def _request_with_connection_timeout(self, request, *args, **kwargs):
        """Use a short timeout for connection and directory probes, not file transfers."""
        original_timeout = self.client.timeout
        self.client.timeout = WEBDAV_CONNECTION_TIMEOUT_SECONDS
        try:
            return request(*args, **kwargs)
        finally:
            self.client.timeout = original_timeout

    @staticmethod
    def normalize_base_url(base_url):
        base_url = (base_url or '').strip()
        if not base_url:
            return base_url

        if not urlparse(base_url).scheme:
            base_url = f"http://{base_url}"

        return base_url.rstrip('/')

    def check_connection(self):
        try:
            self._request_with_connection_timeout(self.client.info, '/')
            return True
        except Exception as e:
            logger.warning('WebDAV connection check failed: host=%s, reason=%s', self.options.get('webdav_hostname'), e)
            return False

    def exists(self, remote_path):
        # webdavclient3 returns True unconditionally from check() when
        # disable_check=True. We keep that option because several WebDAV
        # servers are unreliable during the library's implicit preflight
        # checks, but v2 blob deduplication needs a real existence lookup.
        # PROPFIND via info() still performs an actual remote request.
        try:
            self.client.info(self._normalize_remote_path(remote_path))
            return True
        except Exception:
            return False

    @staticmethod
    def _normalize_remote_path(remote_path):
        if not remote_path:
            return '/'
        return remote_path if remote_path.startswith('/') else f'/{remote_path}'

    def ensure_directory(self, remote_dir):
        """
        逐级创建目录。把常见的已存在目录响应（301、302、405）视为成功；
        网络错误或其他响应必须立即向调用方抛出，避免远端不可达时继续请求每一级目录。
        """
        if not remote_dir or remote_dir == '/' or remote_dir == '.':
            return

        # 统一转为以 / 开头的绝对路径
        if not remote_dir.startswith('/'):
            remote_dir = '/' + remote_dir

        parts = remote_dir.split('/')
        current_path = ""

        for part in parts:
            if not part:
                continue

            current_path += "/" + part

            try:
                self._request_with_connection_timeout(self.client.mkdir, current_path)
            except ResponseErrorCode as e:
                if e.code not in {301, 302, 405}:
                    raise

    def try_create_directory(self, remote_dir):
        """仅在目录不存在时创建，用作跨设备同步锁。"""
        try:
            self._request_with_connection_timeout(
                self.client.mkdir,
                self._normalize_remote_path(remote_dir),
            )
            return True
        except ResponseErrorCode as exc:
            if exc.code == 405:
                return False
            raise

    def upload_file(self, local_path, remote_path):
        try:
            # 参数顺序：(remote_path, local_path)
            self.client.upload_sync(remote_path=remote_path, local_path=local_path)
            return True
        except Exception as e:
            logger.exception('WebDAV upload failed: path=%s', remote_path)
            return False

    def download_file(self, remote_path, local_path):
        try:
            self.client.download_sync(remote_path=remote_path, local_path=local_path)
            return True
        except Exception as e:
            logger.exception('WebDAV download failed: path=%s', remote_path)
            return False

    def get_file_content(self, remote_path):
        try:
            buffer = BytesIO()
            self.client.download_from(buffer, remote_path)
            return buffer.getvalue().decode('utf-8')
        except Exception as e:
            logger.exception('WebDAV content read failed: path=%s', remote_path)
            return None

    def list_directory(self, remote_dir):
        try:
            remote_dir = self._normalize_remote_path(remote_dir)
            return self.client.list(remote_dir)
        except Exception as e:
            logger.exception('WebDAV directory listing failed: path=%s', remote_dir)
            return None

    def is_directory(self, remote_path):
        try:
            remote_path = self._normalize_remote_path(remote_path)
            return self.client.is_dir(remote_path)
        except Exception as e:
            logger.exception('WebDAV stat failed: path=%s', remote_path)
            return False

    def delete_path(self, remote_path):
        try:
            remote_path = self._normalize_remote_path(remote_path)
            self.client.clean(remote_path)
            return True
        except Exception as e:
            logger.exception('WebDAV delete failed: path=%s', remote_path)
            return False
