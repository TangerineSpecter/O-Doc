"""Versioned interchange contract for a single research report.

The payload is a reading snapshot, not an executable task or a database backup.
"""
import json
from copy import deepcopy

MAX_BYTES = 5 * 1024 * 1024
MAX_DEPTH = 128
FORMAT = 'odoc.quant.report'
VERSION = 1


class ShareFormatError(ValueError):
    pass


def validate_total_score(data):
    for key in ('total_score', 'totalScore'):
        score = data.get(key)
        if score is not None and (type(score) not in (int, float) or not 0 <= score <= 100):
            raise ShareFormatError('研究评分必须为 0 到 100 的数值或空值')


def _validate_tree(value, depth=0):
    if depth > MAX_DEPTH:
        raise ShareFormatError('报告数据嵌套过深')
    if isinstance(value, str) and '\x00' in value:
        # PostgreSQL JSONB rejects NUL characters, including escaped NULs.
        raise ShareFormatError('报告不能包含空字符')
    if isinstance(value, dict):
        for key, item in value.items():
            _validate_tree(key, depth + 1)
            _validate_tree(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            _validate_tree(item, depth + 1)


def validate_package(package):
    if not isinstance(package, dict) or set(package) != {'format', 'version', 'entry', 'source', 'report'}:
        raise ShareFormatError('报告文件格式无效')
    if package['format'] != FORMAT or type(package['version']) is not int or package['version'] != VERSION:
        raise ShareFormatError('报告文件版本不受支持')
    entry, source, report = package['entry'], package['source'], package['report']
    if not isinstance(entry, dict) or set(entry) != {'title', 'kind'}:
        raise ShareFormatError('研究信息格式无效')
    if not isinstance(entry['title'], str) or not entry['title'].strip() or len(entry['title']) > 255 or entry['kind'] not in ('factor', 'indicator', 'strategy'):
        raise ShareFormatError('研究标题或类型无效')
    if not isinstance(source, dict) or set(source) != {'code', 'description', 'url', 'language', 'files', 'related'}:
        raise ShareFormatError('来源资料格式无效')
    if any(not isinstance(source[key], str) for key in ('code', 'description', 'url', 'language')) or not isinstance(source['files'], list) or not isinstance(source['related'], list):
        raise ShareFormatError('来源资料必须为文本')
    if not isinstance(report, dict) or set(report) != {'markdown', 'data'}:
        raise ShareFormatError('报告内容格式无效')
    if not isinstance(report['markdown'], str) or not isinstance(report['data'], dict):
        raise ShareFormatError('报告正文或结构化数据无效')
    _validate_tree(package)
    try:
        encoded = json.dumps(package, ensure_ascii=False, allow_nan=False).encode('utf-8')
    except (TypeError, ValueError, RecursionError) as exc:
        raise ShareFormatError('报告包含无效数据') from exc
    if len(encoded) > MAX_BYTES:
        raise ShareFormatError('报告文件超过 5 MB')
    try:
        return deepcopy(package)
    except RecursionError as exc:
        raise ShareFormatError('报告数据嵌套过深') from exc
