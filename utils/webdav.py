import logging
from io import BytesIO
from urllib.parse import urlparse

from webdav3.client import Client
from webdav3.exceptions import ResponseErrorCode


logger = logging.getLogger(__name__)


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
            self.client.info('/')
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
        递归创建目录（激进模式）
        既然 check() 不可靠，那就直接尝试 mkdir。
        如果目录已存在，mkdir 会失败（通常报 405），我们捕获并忽略这个错误。
        """
        if not remote_dir or remote_dir == '/' or remote_dir == '.':
            return

        # 统一转为以 / 开头的绝对路径
        if not remote_dir.startswith('/'):
            remote_dir = '/' + remote_dir

        parts = remote_dir.split('/')
        current_path = ""

        for part in parts:
            if not part: continue  # 防止空字符串

            current_path += "/" + part

            # --- 核心修改 ---
            # 不再使用 self.client.check(current_path) 进行预判
            # 直接尝试创建
            try:
                self.client.mkdir(current_path)
            except ResponseErrorCode as e:
                # 405 Method Not Allowed: 资源已存在 (标准 WebDAV 行为)
                # 301/302: 有些服务器会对已存在的目录做重定向
                # 我们假设这些错误都意味着“不用创建了”
                if e.code == 405:
                    pass
                else:
                    # 如果是 409 Conflict，说明上一级目录没创建成功（不应该发生，因为我们是循环下来的）
                    # 打印日志方便调试，但不抛出异常中断整个流程，万一服务器抽风呢
                    logger.warning('WebDAV directory creation warning: path=%s, reason=%s', current_path, e)
            except Exception as e:
                # 捕获其他未知异常，防止中断
                logger.exception('WebDAV directory creation failed: path=%s', current_path)

    def try_create_directory(self, remote_dir):
        """仅在目录不存在时创建，用作跨设备同步锁。"""
        try:
            self.client.mkdir(self._normalize_remote_path(remote_dir))
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
