"""Read-only inspection of one shared battle's proposed seven-day boundary."""
import json
from datetime import timedelta

from django.core import serializers
from django.db import connection
from django.db.models import BigIntegerField, F, Func, Q, Sum
from django.db.models.fields.json import KeyTextTransform

from utils.sync_datetime import SyncJSONEncoder
from utils.sync_policy import SyncError
from ..farm_gate import guarded
from ..life_time import local_time
from .analytics_models import CombatPartyCoverage, CombatPartyDay
from .explorations import TERMINAL
from .models import CombatFact, Exploration
from .party_daily_preview import preview
from .party_daily_sync import records
from .party_models import AdventureEvent, AdventureMember, AdventureParty


@guarded
def inspect_party(owner, identity, *, now=None, max_source_rows=20000):
    """Report local source and payload observations, never authorize deletion.

    The seven-day clock starts after the last member has actually finished and
    left. This preliminary check cannot verify asset provenance or any remote
    device, and does not implement the recoverable cleanup protocol.
    """
    if not 1 <= max_source_rows <= 50000:
        raise ValueError('单场来源行数上限必须在 1 至 50000 之间')
    party = AdventureParty.objects.filter(pk=identity, owner_id=owner).first()
    if not party:
        raise ValueError('未找到该账号的共同冒险')
    members = list(AdventureMember.objects.filter(party_id=identity))
    runs = {row.pk: row for row in Exploration.objects.filter(pk__in=[item.exploration_id for item in members]).only(
        'id', 'owner_id', 'actor_id', 'status', 'ended_at', 'snapshot')}
    cutoff = local_time(now) - timedelta(days=7)
    blockers = []
    timestamps = []
    if party.status != 'completed' or not members:
        blockers.append('共同冒险尚未结束或缺少成员记录')
    for member in members:
        run = runs.get(member.exploration_id)
        snapshot = run.snapshot if run and isinstance(run.snapshot, dict) else {}
        if (member.owner_id != owner or not run or run.owner_id != owner or run.actor_id != member.actor_id
                or snapshot.get('party_id') != identity):
            blockers.append('成员与个人探索来源不一致')
            continue
        if member.active or not member.left_at or run.status not in TERMINAL or not run.ended_at:
            blockers.append('成员尚未完整结束或缺少实际结束时间')
            continue
        timestamps.extend((local_time(member.left_at), local_time(run.ended_at)))
    last_finished = max(timestamps, default=None)
    age_ready = bool(not blockers and last_finished and last_finished <= cutoff)
    if not blockers and not age_ready:
        blockers.append('最后一位成员结束尚未满七天')

    events = AdventureEvent.objects.filter(party_id=identity)
    rounds = events.filter(kind='round')
    facts = CombatFact.objects.filter(kind='round').alias(
        shared_event_text=KeyTextTransform('shared_event_id', 'payload')).filter(
        Q(exploration_id__in=runs) | Q(shared_event_text__in=events.values('pk')))
    observed = {'shared_rounds': rounds.count(), 'personal_rounds': facts.count(), 'payload_bytes': None}
    if connection.vendor == 'postgresql':
        def payload_bytes(query):
            return query.order_by().aggregate(total=Sum(Func(F('payload'), function='pg_column_size',
                                                               output_field=BigIntegerField())))['total'] or 0
        observed['payload_bytes'] = payload_bytes(rounds) + payload_bytes(facts)

    projection = None
    if party.status == 'completed':
        try:
            projection = preview(owner, identity, max_source_rows=max_source_rows)
        except (ValueError, KeyError, TypeError, AttributeError, IndexError, SyncError) as exc:
            blockers.append('共同来源预校验未通过：' + str(exc))
    source_valid = projection is not None
    models = [*CombatPartyCoverage.objects.filter(pk=identity), *CombatPartyDay.objects.filter(party_id=identity)]
    stored = json.loads(serializers.serialize('json', models, cls=SyncJSONEncoder))
    expected = records(projection) if projection else []
    coverage_valid = bool(stored and expected and
        {(row['model'], str(row['pk'])): row for row in stored} ==
        {(row['model'], str(row['pk'])): row for row in expected})
    if not coverage_valid:
        blockers.append('每日贡献尚未建立或不能与现存来源核对')
    blockers.append('个人完整事实链、资产来源与跨设备准备、提交和中断恢复尚未完成核验')
    blockers.append('新的七天回合清理尚未实现')
    return {
        'party_id': identity, 'owner_id': owner, 'seven_day_cutoff': cutoff.isoformat(),
        'last_member_finished_at': last_finished.isoformat() if last_finished else None,
        'age_ready': age_ready, 'shared_source_verified': source_valid,
        'daily_contribution_verified': coverage_valid, 'observed': observed,
        'payload_bytes_scope': '仅 JSON 载荷的数据库列大小；不包含索引、行、碎片或备份，不能视为可释放空间。',
        'cleanup_ready': False, 'blockers': list(dict.fromkeys(blockers)),
    }
