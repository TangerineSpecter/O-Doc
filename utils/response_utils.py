import logging

from rest_framework.response import Response

from .error_codes import ErrorCode


internal_error_logger = logging.getLogger('o_doc.internal_errors')


def success_result(data=None, msg=ErrorCode.SUCCESS.message, ):
    """
    统一的成功响应格式化函数
    :param msg: 响应信息
    :param data: 响应数据
    :return: JsonResponse对象
    """
    return Response({
        'code': ErrorCode.SUCCESS.code,
        'msg': msg,
        'data': data
    })


def valid_result(msg=ErrorCode.PARAM_ERROR.message, data=None):
    """
    统一的错误响应格式化函数
    :param msg: 错误信息
    :param data: 错误附加数据
    :return: JsonResponse
    """
    return Response({
        'code': ErrorCode.PARAM_ERROR.code,
        'msg': msg,
        'data': data
    })


def error_result(error: ErrorCode = ErrorCode.PARAM_ERROR, data=None, status=None):
    """
    统一的错误响应格式化函数
    :param error: ErrorCode 枚举项，如 ErrorCode.TITLE_DUPLICATE
    :param data: 错误附加数据
    :param status: 可选 HTTP 状态码；未指定时保持既有响应行为
    :return: JsonResponse
    """
    if error == ErrorCode.SYSTEM_ERROR and data is not None:
        # Most callers reach this branch from an active ``except`` block. Log the
        # traceback server-side, but never expose database, path, or provider
        # details through the public response contract.
        internal_error_logger.exception('Internal error response generated (code=%s)', error.code)
        data = None

    return Response({
        'code': error.code,
        'msg': error.message,
        'data': data
    }, status=status)


def list_result(data=None, total=0, page=1, page_size=20):
    """
    统一的列表数据响应格式化函数
    :param data: 列表数据
    :param total: 总条数
    :param page: 当前页码
    :param page_size: 每页大小
    :return: JsonResponse对象
    """
    return Response({
        'code': ErrorCode.SUCCESS.code,
        'msg': ErrorCode.SUCCESS.message,
        'data': {
            'total': total,
            'page': page,
            'page_size': page_size,
            'list': data
        }
    })
