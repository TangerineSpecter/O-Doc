"""A bounded AI view with all metrics, negative-first examples and legal refs."""
from collections import Counter
import copy
from quant.research.contracts import digest
from rest_framework.exceptions import ValidationError
from .common import decimal
from .accounting import net_value


def model_projection(evidence: dict, accounting: dict) -> dict:
    if (evidence.get('content_hash') != digest({key: value for key, value in evidence.items() if key != 'content_hash'})
            or accounting.get('evidence_hash') != evidence.get('content_hash') or accounting.get('content_hash') != digest({key: value for key, value in accounting.items() if key != 'content_hash'})):
        raise ValidationError('核算摘要必须引用同一份固定执行证据')
    mismatches = accounting['reconciliation']['mismatches']
    mismatch_ids = {row['id'] for row in mismatches}
    def priority(row):
        net = net_value(row) if row['kind'] == 'trade' else None
        negative = ((row['kind'] == 'trade' and (net if net is not None else decimal(row['profit'])) < 0)
                    or (row['kind'] == 'cash_flow' and decimal(row['amount']) < 0))
        return (0 if negative else 1 if row['id'] in mismatch_ids else 2, row['sequence'])
    samples = [{key: value for key, value in row.items() if key != 'provenance'}
               for row in sorted(evidence['records'], key=priority)[:12]]
    anomalies = accounting['anomalies']
    parameters = [{key: value for key, value in row.items() if key != 'provenance'} for row in evidence['parameters']]
    refs = ['execution:metadata', *[row['ref'] for row in parameters],
            *[row['ref'] for row in accounting['metrics'].values()],
            *[row['ref'] for row in accounting['reported_comparison']],
            *[row['ref'] for row in samples], *[row['ref'] for row in mismatches[:12]],
            *[row['ref'] for row in anomalies[:12]]]
    return copy.deepcopy({'version': 1, 'method': 'execution-evidence-summary-v1', 'evidence_hash': evidence['content_hash'],
        'accounting_hash': accounting['content_hash'], 'status': accounting['status'],
        'metadata': evidence['metadata'].copy(), 'counts': accounting['counts'].copy(), 'metrics': accounting['metrics'],
        'parameters': parameters, 'reported_comparison': accounting['reported_comparison'],
        'reconciliation': {'checked_rows': accounting['reconciliation']['checked_rows'],
            'unknown_rows': accounting['reconciliation']['unknown_rows'], 'mismatch_count': len(mismatches),
            'examples': mismatches[:12], 'omitted': max(0, len(mismatches) - 12)},
        'anomalies': {'total': len(anomalies), 'by_code': dict(sorted(Counter(row['code'] for row in anomalies).items())),
                      'examples': anomalies[:12], 'omitted': max(0, len(anomalies) - 12)},
        'sample_records': samples, 'omitted_records': max(0, len(evidence['records']) - 12),
        'limitations': accounting['limitations'], 'refs': list(dict.fromkeys(refs))})
