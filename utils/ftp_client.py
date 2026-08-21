import ftplib
import logging
import posixpath
from io import BytesIO


logger = logging.getLogger(__name__)


class FtpClient:
    def __init__(self, host, port, username, password, use_tls=False, passive=True, timeout=30):
        self.host = host
        self.port = int(port or 21)
        self.username = username
        self.password = password
        self.use_tls = bool(use_tls)
        self.passive = True if passive is None else bool(passive)
        self.timeout = timeout
        self._ftp = None

    @staticmethod
    def _normalize_remote_path(remote_path):
        if not remote_path:
            return '/'
        return remote_path if remote_path.startswith('/') else f'/{remote_path}'

    def _connect(self):
        if self._ftp is not None:
            try:
                self._ftp.voidcmd('NOOP')
                return self._ftp
            except Exception:
                self._close()

        ftp_cls = ftplib.FTP_TLS if self.use_tls else ftplib.FTP
        ftp = ftp_cls()
        ftp.connect(self.host, self.port, timeout=self.timeout)
        ftp.login(self.username, self.password)
        if self.use_tls and hasattr(ftp, 'prot_p'):
            ftp.prot_p()
        ftp.set_pasv(self.passive)
        ftp.encoding = 'utf-8'
        self._ftp = ftp
        return ftp

    def _close(self):
        ftp = self._ftp
        self._ftp = None
        if not ftp:
            return
        try:
            ftp.quit()
        except Exception:
            try:
                ftp.close()
            except Exception:
                pass

    def close(self):
        self._close()

    def check_connection(self):
        try:
            self._connect().voidcmd('NOOP')
            return True
        except Exception as e:
            logger.warning('FTP connection check failed: host=%s, port=%s, reason=%s', self.host, self.port, e)
            self._close()
            return False

    def exists(self, remote_path):
        try:
            ftp = self._connect()
            remote_path = self._normalize_remote_path(remote_path)
            if remote_path == '/':
                return True
            parent = posixpath.dirname(remote_path) or '/'
            name = posixpath.basename(remote_path)
            entries = self.list_directory(parent)
            return bool(entries is not None and name in entries) or self.is_directory(remote_path)
        except Exception as e:
            logger.warning('FTP existence check failed: path=%s, reason=%s', remote_path, e)
            return False

    def ensure_directory(self, remote_dir):
        if not remote_dir or remote_dir in ('/', '.'):
            return

        ftp = self._connect()
        remote_dir = self._normalize_remote_path(remote_dir)
        current_path = ''
        for part in remote_dir.split('/'):
            if not part:
                continue
            current_path += '/' + part
            try:
                ftp.mkd(current_path)
            except ftplib.error_perm:
                pass
            except Exception as e:
                logger.warning('FTP directory creation failed: path=%s, reason=%s', current_path, e)

    def try_create_directory(self, remote_dir):
        try:
            self._connect().mkd(self._normalize_remote_path(remote_dir))
            return True
        except ftplib.error_perm:
            return False

    def upload_file(self, local_path, remote_path):
        try:
            ftp = self._connect()
            remote_path = self._normalize_remote_path(remote_path)
            with open(local_path, 'rb') as file_obj:
                ftp.storbinary(f'STOR {remote_path}', file_obj)
            return True
        except Exception as e:
            logger.exception('FTP upload failed: path=%s', remote_path)
            self._close()
            return False

    def download_file(self, remote_path, local_path):
        try:
            ftp = self._connect()
            remote_path = self._normalize_remote_path(remote_path)
            with open(local_path, 'wb') as file_obj:
                ftp.retrbinary(f'RETR {remote_path}', file_obj.write)
            return True
        except Exception as e:
            logger.exception('FTP download failed: path=%s', remote_path)
            self._close()
            return False

    def get_file_content(self, remote_path):
        try:
            ftp = self._connect()
            remote_path = self._normalize_remote_path(remote_path)
            buffer = BytesIO()
            ftp.retrbinary(f'RETR {remote_path}', buffer.write)
            return buffer.getvalue().decode('utf-8')
        except Exception as e:
            logger.exception('FTP content read failed: path=%s', remote_path)
            return None

    def list_directory(self, remote_dir):
        try:
            ftp = self._connect()
            remote_dir = self._normalize_remote_path(remote_dir)
            names = []
            try:
                for name, _facts in ftp.mlsd(remote_dir):
                    if name in ('.', '..'):
                        continue
                    names.append(name)
            except (ftplib.error_perm, AttributeError):
                for item in ftp.nlst(remote_dir):
                    name = item.rstrip('/').split('/')[-1]
                    if name in ('.', '..', ''):
                        continue
                    names.append(name)
            return names
        except Exception as e:
            logger.exception('FTP directory listing failed: path=%s', remote_dir)
            return None

    def is_directory(self, remote_path):
        try:
            ftp = self._connect()
            remote_path = self._normalize_remote_path(remote_path)
            current = ftp.pwd()
            try:
                ftp.cwd(remote_path)
                return True
            except ftplib.error_perm:
                return False
            finally:
                try:
                    ftp.cwd(current)
                except Exception:
                    pass
        except Exception as e:
            logger.exception('FTP stat failed: path=%s', remote_path)
            return False

    def delete_path(self, remote_path):
        try:
            ftp = self._connect()
            remote_path = self._normalize_remote_path(remote_path)
            try:
                ftp.delete(remote_path)
                return True
            except ftplib.error_perm:
                ftp.rmd(remote_path)
                return True
        except Exception as e:
            logger.exception('FTP delete failed: path=%s', remote_path)
            return False

    def __del__(self):
        try:
            self._close()
        except Exception:
            pass
