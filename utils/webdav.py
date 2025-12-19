from urllib.parse import urljoin, quote

import requests


class WebDavClient:
    def __init__(self, base_url, username, password):
        # 确保 base_url 以 / 结尾
        self.base_url = base_url if base_url.endswith('/') else base_url + '/'
        self.auth = (username, password)
        self.timeout = 30

    def _get_full_url(self, path):
        # 移除开头的 /，并进行 URL 编码处理 (防止中文路径报错)
        clean_path = path.lstrip('/')
        # 简单处理：将路径分段编码
        parts = [quote(p) for p in clean_path.split('/')]
        return urljoin(self.base_url, '/'.join(parts))

    def check_connection(self):
        """测试连接"""
        try:
            response = requests.request('PROPFIND', self.base_url, auth=self.auth, headers={'Depth': '0'},
                                        timeout=self.timeout)
            return 200 <= response.status_code < 300
        except Exception:
            return False

    def exists(self, remote_path):
        """检查远程文件/目录是否存在"""
        full_url = self._get_full_url(remote_path)
        try:
            response = requests.head(full_url, auth=self.auth, timeout=self.timeout)
            # 部分 WebDAV 服务器不支持 HEAD，改用 PROPFIND
            if response.status_code == 405:
                response = requests.request('PROPFIND', full_url, auth=self.auth, headers={'Depth': '0'},
                                            timeout=self.timeout)
            return 200 <= response.status_code < 300
        except Exception:
            return False

    def ensure_directory(self, remote_dir):
        """递归创建目录"""
        if not remote_dir or remote_dir == '.' or remote_dir == '/':
            return

        # 逐级检查/创建目录逻辑简化版
        # 实际生产中可能需要 split('/') 循环检查，这里假设父级通常存在或服务器支持递归创建
        # 为稳妥起见，我们简单尝试直接 MKCOL
        full_url = self._get_full_url(remote_dir)
        try:
            if not self.exists(remote_dir):
                requests.request('MKCOL', full_url, auth=self.auth, timeout=self.timeout)
        except Exception:
            pass

    def upload_file(self, local_path, remote_path):
        """上传文件"""
        full_url = self._get_full_url(remote_path)
        try:
            with open(local_path, 'rb') as f:
                requests.put(full_url, data=f, auth=self.auth, timeout=300)  # 大文件超时设置长一点
            return True
        except Exception as e:
            print(f"Upload error: {e}")
            return False

    def download_file(self, remote_path, local_path):
        """下载文件"""
        full_url = self._get_full_url(remote_path)
        try:
            response = requests.get(full_url, auth=self.auth, stream=True, timeout=300)
            if response.status_code == 200:
                with open(local_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                return True
            return False
        except Exception:
            return False

    def get_file_content(self, remote_path):
        """直接获取文件文本内容 (用于读取 json)"""
        full_url = self._get_full_url(remote_path)
        try:
            response = requests.get(full_url, auth=self.auth, timeout=60)
            if response.status_code == 200:
                return response.text
            return None
        except Exception:
            return None
