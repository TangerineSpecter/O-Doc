from io import BytesIO

from webdav3.client import Client


class WebDavClient:
    def __init__(self, base_url, username, password):
        # webdavclient3 需要的配置格式
        self.options = {
            'webdav_hostname': base_url if not base_url.endswith('/') else base_url[:-1],
            'webdav_login': username,
            'webdav_password': password,
            'disable_check': True,  # 初始化时不立即检查，提高响应速度
            'timeout': 300
        }
        self.client = Client(self.options)

    def check_connection(self):
        """测试连接 (尝试列出根目录)"""
        try:
            # 只有真正的 WebDAV 服务器，且账号密码正确，才能返回正确的 XML 结构。
            self.client.info('/')
            return True
        except Exception as e:
            return False

    def exists(self, remote_path):
        """检查远程路径是否存在"""
        return self.client.check(remote_path)

    def ensure_directory(self, remote_dir):
        """递归创建目录"""
        if not remote_dir or remote_dir == '.' or remote_dir == '/':
            return

        # webdavclient3 的 mkdir 默认不支持递归，所以要一级级检查
        # 也可以直接用 client.mkdir(remote_dir) 捕获父级不存在的异常，但循环更稳妥
        parts = remote_dir.strip('/').split('/')
        current_path = ""
        for part in parts:
            current_path += part + "/"
            if not self.client.check(current_path):
                self.client.mkdir(current_path)

    def upload_file(self, local_path, remote_path):
        """上传文件"""
        try:
            # webdavclient3 的 upload_sync 会自动覆盖
            # 注意参数顺序：webdavclient3 是 (remote_path, local_path)
            self.client.upload_sync(remote_path=remote_path, local_path=local_path)
            return True
        except Exception as e:
            print(f"WebDAV upload failed: {e}")
            return False

    def download_file(self, remote_path, local_path):
        """下载文件"""
        try:
            self.client.download_sync(remote_path=remote_path, local_path=local_path)
            return True
        except Exception as e:
            print(f"WebDAV download failed: {e}")
            return False

    def get_file_content(self, remote_path):
        """直接获取文件内容字符串"""
        try:
            buffer = BytesIO()
            self.client.download_from(buffer, remote_path)
            return buffer.getvalue().decode('utf-8')
        except Exception as e:
            print(f"WebDAV read content failed: {e}")
            return None
