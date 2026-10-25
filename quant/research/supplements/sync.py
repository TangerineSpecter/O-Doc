"""Rebuild source bundles from the exact parent and supplied dependency files."""
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from .contracts import SupplementInput, build, identity


def validate(identity_key: str, record: dict, sources: dict, fail) -> None:
    payload = record['payload']
    parent_id = payload.get('parent_source_id')
    parent = sources.get(str(parent_id),{})
    if not parent or parent_id==identity_key or parent.get('material')!=record['material'] or record.get('code_version'):
        fail('依赖补充缺少同材料的父来源或冒充代码版本')
    try:
        form = SupplementInput(data=payload.get('submission'))
        form.is_valid(raise_exception=True)
        submitted = dict(form.validated_data)
        expected = build(parent_id,parent['content_hash'],parent['payload'],submitted)
        if payload != expected or identity_key != identity(record['material'],submitted['request_key']):
            fail('依赖补充的原始文件、变更、行号或来源谱系不一致')
    except (ValidationError,KeyError,TypeError,ValueError) as error:
        fail('依赖补充合同无效：'+type(error).__name__)
    visited = {identity_key}
    while parent.get('payload',{}).get('provenance')=='source_supplement':
        if parent_id in visited or len(visited)>=64:
            fail('依赖补充来源谱系有循环或超过64层')
        visited.add(parent_id)
        parent_id = parent['payload']['parent_source_id']
        parent = sources.get(str(parent_id),{})
    if record.get('content_hash') != digest(payload):
        fail('依赖补充内容哈希无效')
