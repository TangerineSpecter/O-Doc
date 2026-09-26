"""Reject oversized client diagnostics before JSON decoding."""
import io
from djangorestframework_camel_case.parser import CamelCaseJSONParser
from rest_framework.exceptions import ParseError


class DiagnosticReportParser(CamelCaseJSONParser):
    def parse(self, stream, media_type=None, parser_context=None):
        body = stream.read(65537)
        if len(body) > 65536:
            raise ParseError('诊断事件不能超过 64 KB')
        return super().parse(io.BytesIO(body), media_type=media_type, parser_context=parser_context)
