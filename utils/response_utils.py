from rest_framework.response import Response

def success_result(data=None):
    """
    统一的成功响应格式化函数
    :param data: 响应数据
    :return: JsonResponse对象
    """
    return Response({
        'code': ErrorCode.SUCCESS.code,
        'msg': ErrorCode.SUCCESS.message,
        'data': data
    })


from .error_codes import ErrorCode


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


def error_result(error: ErrorCode, data=None):
    """
    统一的错误响应格式化函数
    :param error: ErrorCode 枚举项，如 ErrorCode.TITLE_DUPLICATE
    :param data: 错误附加数据
    :return: JsonResponse
    """
    return Response({
        'code': error.code,
        'msg': error.message,
        'data': data
    })


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
