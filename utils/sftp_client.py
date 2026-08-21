import stat
from base64 import decodebytes
from io import StringIO

import paramiko


DEFAULT_NETWORK_TIMEOUT_SECONDS = 30


class SftpClient:
    def __init__(
        self,
        host,
        port,
        username,
        password='',
        private_key='',
        passphrase='',
        known_host_key='',
        timeout=DEFAULT_NETWORK_TIMEOUT_SECONDS,
    ):
        self.host = host
        self.port = int(port or 22)
        self.username = username
        self.password = password or None
        self.private_key = private_key or ''
        self.passphrase = passphrase or None
        self.known_host_key = (known_host_key or '').strip()
        self.last_host_key = ''
        self.timeout = timeout
        self._ssh = None
        self._sftp = None

    @staticmethod
    def _normalize_remote_path(remote_path):
        if not remote_path:
            return '/'
        return remote_path if remote_path.startswith('/') else f'/{remote_path}'

    @staticmethod
    def _load_private_key(key_text, passphrase):
        key_file = StringIO(key_text.strip() + '\n')
        errors = []
        key_classes = [paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey]
        if hasattr(paramiko, 'DSSKey'):
            key_classes.append(paramiko.DSSKey)
        for key_cls in key_classes:
            try:
                key_file.seek(0)
                return key_cls.from_private_key(key_file, password=passphrase or None)
            except Exception as exc:
                errors.append(exc)
        raise ValueError(errors[-1] if errors else '无法解析 SFTP 私钥')

    @staticmethod
    def format_host_key(key):
        return f'{key.get_name()} {key.get_base64()}'

    def _load_known_host_key(self):
        parts = self.known_host_key.split()
        if len(parts) < 2:
            raise ValueError('已保存的 SFTP 主机密钥无效，请重新保存配置')
        return paramiko.PKey.from_type_string(parts[0], decodebytes(parts[1].encode('ascii')))

    def _apply_host_key_policy(self, ssh):
        if not self.known_host_key:
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            return

        known_key = self._load_known_host_key()
        host_keys = ssh.get_host_keys()
        host_keys.add(self.host, known_key.get_name(), known_key)
        host_keys.add(f'[{self.host}]:{self.port}', known_key.get_name(), known_key)
        ssh.set_missing_host_key_policy(paramiko.RejectPolicy())

    def _connect(self):
        if self._sftp is not None:
            try:
                self._sftp.listdir('.')
                return self._sftp
            except Exception:
                self._close()

        ssh = paramiko.SSHClient()
        self._apply_host_key_policy(ssh)
        pkey = None
        if self.private_key.strip():
            pkey = self._load_private_key(self.private_key, self.passphrase)

        ssh.connect(
            hostname=self.host,
            port=self.port,
            username=self.username,
            password=self.password,
            pkey=pkey,
            timeout=self.timeout,
            banner_timeout=self.timeout,
            auth_timeout=self.timeout,
            allow_agent=False,
            look_for_keys=False,
        )
        self._ssh = ssh
        transport = ssh.get_transport()
        if transport is not None and transport.get_remote_server_key() is not None:
            self.last_host_key = self.format_host_key(transport.get_remote_server_key())
        self._sftp = ssh.open_sftp()
        channel = self._sftp.get_channel()
        if channel is not None:
            channel.settimeout(self.timeout)
        return self._sftp

    def _close(self):
        sftp = self._sftp
        ssh = self._ssh
        self._sftp = None
        self._ssh = None
        if sftp:
            try:
                sftp.close()
            except Exception:
                pass
        if ssh:
            try:
                ssh.close()
            except Exception:
                pass

    def close(self):
        self._close()

    def check_connection(self):
        try:
            self._connect().listdir('.')
            return True
        except Exception as e:
            print(f"SFTP connection check failed: {e}")
            self._close()
            return False

    def exists(self, remote_path):
        try:
            self._connect().stat(self._normalize_remote_path(remote_path))
            return True
        except FileNotFoundError:
            return False
        except IOError:
            return False
        except Exception as e:
            print(f"SFTP exists failed: {remote_path}. Error: {e}")
            return False

    def ensure_directory(self, remote_dir):
        if not remote_dir or remote_dir in ('/', '.'):
            return

        sftp = self._connect()
        current_path = ''
        for part in self._normalize_remote_path(remote_dir).split('/'):
            if not part:
                continue
            current_path += '/' + part
            try:
                attr = sftp.stat(current_path)
                if not stat.S_ISDIR(attr.st_mode):
                    raise OSError(f'{current_path} exists and is not a directory')
            except FileNotFoundError:
                sftp.mkdir(current_path)
            except IOError:
                try:
                    sftp.mkdir(current_path)
                except IOError as e:
                    print(f"SFTP mkdir error at {current_path}: {e}")

    def try_create_directory(self, remote_dir):
        try:
            self._connect().mkdir(self._normalize_remote_path(remote_dir))
            return True
        except (IOError, OSError):
            return False

    def upload_file(self, local_path, remote_path):
        try:
            self._connect().put(local_path, self._normalize_remote_path(remote_path))
            return True
        except Exception as e:
            print(f"SFTP upload failed: {remote_path}. Error: {e}")
            self._close()
            return False

    def download_file(self, remote_path, local_path):
        try:
            self._connect().get(self._normalize_remote_path(remote_path), local_path)
            return True
        except Exception as e:
            print(f"SFTP download failed: {e}")
            self._close()
            return False

    def get_file_content(self, remote_path):
        try:
            sftp = self._connect()
            with sftp.open(self._normalize_remote_path(remote_path), 'rb') as remote_file:
                return remote_file.read().decode('utf-8')
        except Exception as e:
            print(f"SFTP read content failed: {e}")
            return None

    def list_directory(self, remote_dir):
        try:
            entries = self._connect().listdir(self._normalize_remote_path(remote_dir))
            return [name for name in entries if name not in ('.', '..')]
        except Exception as e:
            print(f"SFTP list failed: {remote_dir}. Error: {e}")
            return None

    def is_directory(self, remote_path):
        try:
            attr = self._connect().stat(self._normalize_remote_path(remote_path))
            return stat.S_ISDIR(attr.st_mode)
        except Exception as e:
            print(f"SFTP stat failed: {remote_path}. Error: {e}")
            return False

    def delete_path(self, remote_path):
        try:
            sftp = self._connect()
            remote_path = self._normalize_remote_path(remote_path)
            if self.is_directory(remote_path):
                sftp.rmdir(remote_path)
            else:
                sftp.remove(remote_path)
            return True
        except Exception as e:
            print(f"SFTP delete failed: {remote_path}. Error: {e}")
            return False

    def __del__(self):
        try:
            self._close()
        except Exception:
            pass
