from django.http import JsonResponse

class ValidationError(Exception):
    """自定义验证异常类"""
    def __init__(self, message, code=400):
        self.message = message
        self.code = code
        super().__init__(self.message)


def validate_integer(param_name, value, min_value=None, max_value=None):
    """
    验证参数是否为整数，并可选择验证范围
    :param param_name: 参数名
    :param value: 参数值
    :param min_value: 最小值（包含）
    :param max_value: 最大值（包含）
    :return: 验证后的整数值
    :raises: ValidationError 当验证失败时
    """
    try:
        int_value = int(value)
    except (ValueError, TypeError):
        raise ValidationError(f"{param_name}必须是整数")

    if min_value is not None and int_value < min_value:
        raise ValidationError(f"{param_name}必须大于等于{min_value}")

    if max_value is not None and int_value > max_value:
        raise ValidationError(f"{param_name}必须小于等于{max_value}")

    return int_value


def validate_pagination_params(page, page_size, max_page_size=100):
    """
    验证分页参数
    :param page: 页码
    :param page_size: 每页大小
    :param max_page_size: 最大每页大小
    :return: 验证后的(page, page_size)元组
    :raises: ValidationError 当验证失败时
    """
    validated_page = validate_integer('page', page, min_value=1)
    validated_page_size = validate_integer('pageSize', page_size, min_value=1, max_value=max_page_size)
    return validated_page, validated_page_size


def handle_validation_error(e):
    """
    处理验证异常并返回错误响应
    :param e: ValidationError异常实例
    :return: JsonResponse对象
    """
    return JsonResponse({
        'code': e.code,
        'msg': e.message,
        'data': None
    }, status=e.code)