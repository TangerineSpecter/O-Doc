"""One real run record groups selection, preparation and connection retries."""
from django.db.models import Sum, Count
from system_settings.models import AgentRunRecord


def root_record(owner, agent, opportunity):
    return AgentRunRecord.objects.get_or_create(pk='idle:' + opportunity[:35], defaults={
        'agent': agent, 'agent_name': agent.name, 'task_name': '空档穿插决策', 'trigger': '系统穿插',
        'status': 'running', 'summary': '正在选择空档活动',
        'random_context': {'interleaving_opportunity_id': opportunity, 'owner_id': owner}})[0]


def record_for(item):
    identity = item.context.get('interleaving', {}).get('selection_record_id')
    return AgentRunRecord.objects.filter(pk=identity, agent_id=item.actor_id).first() if identity else None


def complete(item):
    record = record_for(item)
    if record and record.status == 'running':
        from .run_diagnostics import finish_record
        finish_record(record, 'success' if item.status in ('completed', 'rest') else 'failed',
                      item.result.get('reason', '空档活动已结束'), '', '穿插活动结束')


def summary(item):
    from system_settings.token_usage.models import AgentTokenUsage
    root = item.context.get('interleaving', {}).get('selection_record_id')
    ids = [identity for identity in (root, item.record_id) if identity]
    if not ids:
        return None
    usages = AgentTokenUsage.objects.filter(owner_key=item.owner_id, agent_key=item.actor_id, record_key__in=ids)
    value = usages.aggregate(requests=Count('pk'), input_tokens=Sum('input_tokens'), output_tokens=Sum('output_tokens'), total_tokens=Sum('total_tokens'))
    value['usage_complete'] = not usages.filter(usage_complete=False).exists() and value['requests'] > 0
    return value
