from enum import Enum


class ErrorCode(Enum):
    # 成功
    SUCCESS = (200, '成功')

    # 参数错误
    PARAM_ERROR = (400, '参数错误')
    PARAM_REQUIRED = (401, '缺少必要参数')
    PARAM_INVALID = (402, '参数格式无效')
    TITLE_DUPLICATE = (4003, '该标题已存在，请使用其他标题')
    ARTICLE_HAVE_CHILDREN = (4004, "该文章存在子文章无法删除。")
    ARTICLE_NOT_EXIST = (4005, "文章不存在")

    # 权限错误
    AUTHENTICATION_ERROR = (401, '未认证')
    PERMISSION_DENIED = (403, '权限不足')

    # 资源错误
    RESOURCE_NOT_FOUND = (404, '资源不存在')
    RESOURCE_EXISTED = (409, '资源已存在')
    RESOURCE_IS_LINKED = (4091, '资源已关联文章，无法删除')
    UPLOAD_RESOURCE_NOT_FOUND = (410, '上传文件不存在')
    UPLOAD_RESOURCE_MORE_THAN_MAX_SIZE = (411, '文件大小超过50MB限制')

    # 系统错误
    SYSTEM_ERROR = (500, '系统异常')
    DATABASE_ERROR = (5001, '数据库错误')
    NETWORK_ERROR = (5002, '网络错误')
    AI_SERVICE_ERROR = (5003, 'AI服务错误')

    WEBDEV_ERROR = (600, 'WebDev异常')
    WEBDEV_NOT_CONFIG = (6001, 'WebDAV 未配置或未开启')
    WEBDEV_DOWNLOAD_FAIL = (6002, 'WebDev下载失败')
    WEBDEV_UPLOAD_FAIL = (6003, 'WebDev上传失败')
    WEBDEV_LOGIN_FAIL = (6004, '连接失败: 请检查服务器地址和密码')

    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message

    @property
    def value(self) -> int:
        return self.code

    def __str__(self):
        return self.message
