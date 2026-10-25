"""Archive-ready deterministic normalization with complete original provenance."""
from decimal import localcontext
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from .common import ADAPTERS, MAX_RECORDS, normalize_options, timestamp, seal


def normalize(document: str, adapter: str, options: dict | None = None) -> dict:
    if (not isinstance(document, str) or not document.strip() or '\x00' in document
            or len(document.encode('utf-8')) > 1024 * 1024):
        raise ValidationError('执行报告为空、含二进制字符或超过 1 MiB UTF-8 文本')
    if adapter not in ADAPTERS:
        raise ValidationError('请明确选择支持的执行报告适配器')
    options = normalize_options(options)
    with localcontext() as context:
        context.prec = 256
        if adapter == 'mt4-tester-html-v1':
            from .mt4 import parse
            meta, records, parameters, reported, warnings, status = parse(document, options)
        else:
            from .standard import parse
            meta, records, parameters, reported, warnings = parse(document, adapter, options)
            status = 'parsed'
        if len(records) > MAX_RECORDS:
            raise ValidationError('执行证据最多 2000 条原始事件，不截断负面记录')
        names = [row['name'] for row in parameters]
        if len(names) != len(set(names)):
            raise ValidationError('报告声明参数重名，不能猜测哪一项为实际配置')
        seen, last = set(), None
        for row in records:
            if row['id'] in seen:
                raise ValidationError('执行记录 ID 重复，不能自动去重或覆盖')
            seen.add(row['id'])
            normalized, clock, warning = timestamp(row['raw_timestamp'], meta['timezone'])
            # Mixed aware/local clocks cannot be reliably ordered against each other.
            if last is not None:
                if (clock.tzinfo is None) != (last.tzinfo is None):
                    raise ValidationError('记录混用无法确定时区的时钟，请声明统一时区')
                if clock < last:
                    raise ValidationError('执行记录时间必须保持原始非递减顺序，不自动排序')
            last, row['timestamp'] = clock, normalized
            if warning:
                warnings.append({'code': 'unknown_timestamp', 'message': warning, 'ref': row['ref']})
        if warnings and status == 'parsed':
            status = 'partial'
        counts = {key: sum(row['kind'] == kind for row in records) for key, kind in
                  (('trades', 'trade'), ('cash_flows', 'cash_flow'), ('equity', 'equity'), ('operations', 'operation'))}
        return seal({'version': 1, 'method': 'execution-evidence-v1', 'adapter': adapter, 'document_hash': digest(document),
            'options': options, 'metadata': meta, 'parser_status': status, 'parameters': parameters,
            'reported_metrics': reported, 'records': records, 'warnings': warnings,
            'counts': {'records': len(records), **counts},
            'limitations': ['原始报告与参数、覆盖及净毛口径均为上传者或报告的声明，未独立验证平台真实性。',
                            '不执行 HTML、脚本或上传策略，不加载图片、链接、include 或远端资源。']})
