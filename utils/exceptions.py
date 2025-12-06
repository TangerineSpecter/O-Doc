from rest_framework import serializers
from rest_framework.views import exception_handler

from utils.error_codes import ErrorCode
from utils.response_utils import valid_result


def custom_exception_handler(exc, context):
    if isinstance(exc, serializers.ValidationError):
        detail = exc.detail
        msg = ErrorCode.PARAM_ERROR.message

        # 如果是非字段错误，优先用它
        if isinstance(detail, dict) and 'non_field_errors' in detail:
            msg = detail['non_field_errors'][0]
        elif isinstance(detail, dict):
            # 取第一个字段的错误
            for errors in detail.values():
                if errors:
                    msg = errors[0]
                    break
        elif isinstance(detail, list) and detail:
            msg = detail[0]

        return valid_result(msg)

    return exception_handler(exc, context)
