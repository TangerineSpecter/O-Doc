"""同步时间编码：沿用 Django 毫秒精度，省略全零小数，不改写业务字符串。"""
import datetime
import re

from django.core.serializers.json import DjangoJSONEncoder


def normalize_datetime_fraction(value: str) -> str:
    """仅供已识别的日期列使用，保留有效小数及原有时区。"""
    return re.sub(r'(?<=\d{2}:\d{2}:\d{2})\.0+(?=Z?$|[+-]\d{2}:\d{2}$)', '', value)


class SyncJSONEncoder(DjangoJSONEncoder):
    def default(self, value):
        encoded = super().default(value)
        if isinstance(value, (datetime.datetime, datetime.time)):
            return normalize_datetime_fraction(encoded)
        return encoded
