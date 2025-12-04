from django.http import JsonResponse


def success_result(data=None, code=200, msg='成功'):
    """
    统一的成功响应格式化函数
    :param data: 响应数据
    :param code: 状态码，默认200
    :param msg: 消息，默认'成功'
    :return: JsonResponse对象
    """
    return JsonResponse({
        'code': code,
        'msg': msg,
        'data': data
    })


def error_result(msg='系统异常', code=500, data=None):
    """
    统一的错误响应格式化函数
    :param msg: 错误消息，默认'系统异常'
    :param code: 状态码，默认500
    :param data: 错误数据
    :return: JsonResponse对象
    """
    return JsonResponse({
        'code': code,
        'msg': msg,
        'data': data
    })


def list_result(data=None, total=0, page=1, page_size=20, code=200, msg='成功'):
    """
    统一的列表数据响应格式化函数
    :param data: 列表数据
    :param total: 总条数
    :param page: 当前页码
    :param page_size: 每页大小
    :param code: 状态码，默认200
    :param msg: 消息，默认'成功'
    :return: JsonResponse对象
    """
    return JsonResponse({
        'code': code,
        'msg': msg,
        'data': {
            'total': total,
            'page': page,
            'page_size': page_size,
            'list': data
        }
    })