"""Strong-ETag conditional writes for a future recoverable archive protocol.

These primitives are not a complete archive lock or fencing protocol. The
archive remains disabled until the remote server and all participating
clients satisfy the full preparation, recovery and cutover requirements.
"""
import posixpath
import uuid

from webdav3.exceptions import RemoteResourceNotFound, ResponseErrorCode
from webdav3.urn import Urn

from .sync_policy import SyncError

MAX_CONTENT_BYTES = 1024 * 1024


def _strong_etag(value):
    if (not isinstance(value, str) or len(value) < 2 or len(value) > 256 or value.startswith('W/')
            or not value.startswith('"') or not value.endswith('"')
            or any(char == '"' or ord(char) < 33 or ord(char) == 127 or ord(char) > 255
                   for char in value[1:-1])):
        raise SyncError('WebDAV 未提供可用于条件写入的强 ETag')
    return value


class WebDavConditional:
    """Use the configured WebDAV client's existing authentication and TLS policy."""

    def __init__(self, adapter):
        self.adapter = adapter

    def read(self, path):
        try:
            response = self.adapter.client.execute_request('download', Urn(path).quote())
        except RemoteResourceNotFound:
            return None
        except Exception as exc:
            raise SyncError('WebDAV 条件读取失败') from exc
        try:
            tag = _strong_etag(response.headers.get('ETag'))
            chunks, size = [], 0
            for chunk in response.iter_content(chunk_size=65536):
                size += len(chunk)
                if size > MAX_CONTENT_BYTES:
                    raise SyncError('WebDAV 条件读取内容超出上限')
                chunks.append(chunk)
            return b''.join(chunks), tag
        finally:
            response.close()

    def _write(self, path, content, header):
        try:
            response = self.adapter.client.execute_request('upload', Urn(path).quote(), data=content,
                                                           headers_ext=[header])
        except ResponseErrorCode as exc:
            if exc.code == 412:
                return False
            raise SyncError(f'WebDAV 条件写入失败（状态 {exc.code}）') from exc
        except Exception as exc:
            raise SyncError('WebDAV 条件写入失败') from exc
        try:
            return True
        finally:
            response.close()

    def create(self, path, content):
        return self._write(path, content, 'If-None-Match: *')

    def replace(self, path, content, expected_etag):
        return self._write(path, content, 'If-Match: ' + _strong_etag(expected_etag))

    def probe(self, directory):
        """Exercise preconditions on one unique temporary object and remove it.

        This is an explicit remote write, not run automatically. Passing the
        probe alone does not prove locking, multi-device fencing or recovery.
        """
        if (not isinstance(directory, str) or not directory.startswith('/') or directory.strip('/') == ''
                or any(part in ('.', '..') for part in directory.split('/'))):
            raise SyncError('WebDAV 条件写入测试需要明确的非根目录')
        path = posixpath.join(directory.rstrip('/'), '.odoc-cas-probe-' + uuid.uuid4().hex)
        created = False
        try:
            try:
                created_now = self.create(path, b'first')
            except SyncError as exc:
                raise SyncError(f'WebDAV 测试文件创建结果不明，请检查：{path}') from exc
            if not created_now:
                raise SyncError('WebDAV 条件写入测试文件已存在，未修改或删除它')
            created = True
            first = self.read(path)
            if not first or first[0] != b'first':
                raise SyncError('WebDAV 条件写入测试无法回读原内容')
            invalid_tag = '"odoc-probe-' + uuid.uuid4().hex + '"'
            if invalid_tag == first[1]:
                raise SyncError('WebDAV 测试 ETag 无法安全区分')
            if self.create(path, b'unexpected') or self.replace(path, b'unexpected', invalid_tag):
                raise SyncError('WebDAV 没有正确执行条件写入，不能用于安全归档')
            if self.read(path) != first:
                raise SyncError('WebDAV 拒绝条件写入后内容发生变化')
            if not self.replace(path, b'second', first[1]):
                raise SyncError('WebDAV 拒绝了有效 ETag 的条件写入')
            second = self.read(path)
            if not second or second[0] != b'second' or second[1] == first[1]:
                raise SyncError('WebDAV 未提供可验证变化的强 ETag')
            if self.replace(path, b'unexpected', first[1]) or self.read(path) != second:
                raise SyncError('WebDAV 接受了过期 ETag，不能用于安全归档')
            return True
        finally:
            if created:
                if not self.adapter.delete_path(path):
                    raise SyncError(f'WebDAV 条件写入测试文件未能清理：{path}')
                if self.read(path) is not None:
                    raise SyncError(f'WebDAV 条件写入测试文件删除后仍存在：{path}')
