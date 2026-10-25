"""Validate experiment-derived candidates without executing code or re-publishing."""
from quant.research.contracts import digest
from quant.factors.expression import expression_hash
from .derivation import VERSION, build_candidate, eligible_attempts


def validate_derived(identity, fields, rows, fail):
    checkpoints = rows.get('quant.experimentcheckpoint', {})
    requests = rows.get('quant.experimentrequest', {})
    candidates = rows.get('quant.factorcandidate', {})
    checkpoint_id = fields.get('derived_checkpoint_id')
    checkpoint = checkpoints.get(checkpoint_id, {})
    request_id = str(checkpoint.get('request'))
    request = requests.get(request_id, {})
    result = next((row for row in rows.get('quant.experimentresult', {}).values() if str(row.get('request')) == request_id), {})
    envelope = result.get('data', {})
    if not request or not checkpoint or checkpoint.get('attempt') not in eligible_attempts(envelope):
        fail('衍生候选缺少已完成实验和可归档的尝试')
    dataset = rows.get('quant.marketdataset', {}).get(str(request.get('dataset')), {})
    if not dataset:
        fail('衍生候选行情不存在')
    expected = build_candidate(request_id, checkpoint_id, request['plan'], dataset['snapshot'],
        envelope['output']['attempts'], checkpoint['attempt'])
    first = candidates.get(expected['derivation']['parent_candidate_ids'][0], {})
    if (type(fields.get('ordinal')) is not int or fields['ordinal'] != 0 or fields.get('report') != first.get('report')
            or fields.get('data') != expected or fields.get('content_hash') != digest(expected)
            or fields.get('expression_hash') != expression_hash(expected)
            or identity != digest([VERSION, checkpoint_id])[:40]):
        fail('衍生候选公式、参数、父代或实验依据不一致')


def validate_ancestry(rows, fail):
    """Iterative DAG check bounds long multi-round chains without recursion."""
    candidates = rows.get('quant.factorcandidate', {})
    dependencies = {identity: set(fields.get('data', {}).get('derivation', {}).get('parent_candidate_ids', []))
        for identity, fields in candidates.items() if fields.get('derived_checkpoint_id')}
    pending, children = {}, {}
    for identity, parents in dependencies.items():
        if not parents or not parents <= set(candidates):
            fail('衍生候选父代缺失')
        pending[identity] = len(parents & dependencies.keys())
        for parent in parents:
            children.setdefault(parent, []).append(identity)
    ready = [identity for identity, count in pending.items() if count == 0]
    done = 0
    while ready:
        done += 1
        for child in children.get(ready.pop(), []):
            pending[child] -= 1
            if pending[child] == 0:
                ready.append(child)
    if done != len(dependencies):
        fail('衍生因子谱系存在循环')
