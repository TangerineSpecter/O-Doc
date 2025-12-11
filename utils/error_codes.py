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
    UPLOAD_RESOURCE_NOT_FOUND = (410, '上传文件不存在')
    UPLOAD_RESOURCE_MORE_THAN_MAX_SIZE = (411, '文件大小超过50MB限制')

    # 系统错误
    SYSTEM_ERROR = (500, '系统异常')
    DATABASE_ERROR = (5001, '数据库错误')
    NETWORK_ERROR = (5002, '网络错误')

    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message

    @property
    def value(self) -> int:
        return self.code

    def __str__(self):
        return self.message
