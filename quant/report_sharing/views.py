import json
from collections.abc import Mapping
from io import BytesIO
from djangorestframework_camel_case.parser import CamelCaseJSONParser
from rest_framework.exceptions import APIException, ParseError, ValidationError
from quant.views import QuantView
from quant.models import ImportedResearchReport
from utils.response_utils import success_result
from .contracts import MAX_BYTES
from .services import export_report, import_report


class ShareRequestTooLarge(APIException):
    status_code = 413
    default_detail = '报告上传请求过大'


class ShareImportParser(CamelCaseJSONParser):
    # Each byte of the file can take up to six bytes in the outer JSON string.
    max_bytes = 6 * MAX_BYTES + 1024

    def parse(self, stream, media_type=None, parser_context=None):
        body = stream.read(self.max_bytes + 1)
        if len(body) > self.max_bytes:
            raise ShareRequestTooLarge()
        try:
            return super().parse(BytesIO(body), media_type, parser_context)
        except RecursionError as exc:
            raise ParseError('报告上传请求嵌套过深') from exc


class ExportShareView(QuantView):
    pure_read_get = True

    def get(self, request, coll_id, entry_id):
        return success_result({'package_json': json.dumps(export_report(self.entry), ensure_ascii=False, allow_nan=False)})


class ImportShareView(QuantView):
    parser_classes = [ShareImportParser]

    def post(self, request, coll_id):
        raw = request.data.get('package_json') if isinstance(request.data, Mapping) else None
        if not isinstance(raw, str):
            raise ValidationError('请选择报告文件')
        try:
            size = len(raw.encode('utf-8'))
        except UnicodeEncodeError:
            raise ValidationError('报告文件编码无效')
        if size > MAX_BYTES:
            raise ValidationError('请选择不超过 5 MB 的报告文件')
        try:
            package = json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        except (ValueError, RecursionError):
            raise ValidationError('报告文件不是有效的 JSON')
        entry = import_report(self.collection, package)
        return success_result({'entry_id': entry.pk})


class ImportedShareView(QuantView):
    pure_read_get = True

    def get(self, request, coll_id, entry_id):
        snapshot = ImportedResearchReport.objects.filter(entry=self.entry).first()
        return success_result({'package_json': json.dumps(snapshot.package, ensure_ascii=False) if snapshot else None})
