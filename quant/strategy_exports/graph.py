"""Bounded strategy nodes projected from owned immutable archive facts."""
from quant.models import StrategyArtifact


def append(collection, selected, nodes, edges) -> bool:
    records=list(StrategyArtifact.objects.filter(request__anthology=collection,
        version__implementation__entry__is_valid=True).select_related('version__implementation')[:201])
    selected_ids=set(selected)
    count=0
    for artifact in records[:200]:
        parents=[row['id'] for row in artifact.data['context']['parents'] if row['id'] in selected_ids]
        if not parents: continue
        if count>=12: return True
        count+=1
        identity=f'strategy:{artifact.pk}'
        nodes.append({'id':identity,'kind':'strategy','label':artifact.version.implementation.name,
            'entry_id':artifact.version.implementation.entry_id,'report_id':''})
        for parent in parents:
            edges.append({'id':f'strategy-from:{parent}:{artifact.pk}','from':f'factor:{parent}','to':identity,
                'kind':'generated_strategy','label':'MQ4 EA候选','historical':False,'similarity':None,
                'detail':f"{artifact.data['context']['request_id']} / {artifact.data['context']['attempt_id']} 的实际公式与策略规则；原生编译、运行、等价性待验证，未继承父代评分或实证。"})
    return len(records)>200
