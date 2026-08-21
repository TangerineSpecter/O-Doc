from unittest import TestCase
from unittest.mock import patch

from utils.error_codes import ErrorCode
from utils.response_utils import error_result


class ErrorResponseSafetyTest(TestCase):
    def test_system_error_does_not_expose_exception_detail(self):
        with patch('utils.response_utils.internal_error_logger.exception') as log_exception:
            try:
                raise RuntimeError('database password leaked')
            except RuntimeError as exc:
                response = error_result(ErrorCode.SYSTEM_ERROR, str(exc))

        self.assertEqual(response.data, {
            'code': ErrorCode.SYSTEM_ERROR.code,
            'msg': ErrorCode.SYSTEM_ERROR.message,
            'data': None,
        })
        log_exception.assert_called_once()

    def test_expected_business_error_keeps_safe_detail(self):
        response = error_result(ErrorCode.PARAM_ERROR, '文章内容不能为空')

        self.assertEqual(response.data['data'], '文章内容不能为空')
        self.assertEqual(response.data['msg'], ErrorCode.PARAM_ERROR.message)
