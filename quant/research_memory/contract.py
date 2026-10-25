"""Bounded immutable history selection; relevance does not assert equivalence."""
import copy
import json
from datetime import datetime, timezone
from collections.abc import Iterable
from django.utils import timezone as django_timezone
from rest_framework.exceptions import ValidationError

VERSION = 1
METHOD = 'library-history-v1'
SCAN_LIMIT = 2000
MAX_CHARS = 32000
KINDS = ('experiment', 'feedback')
LIMITS = {'experiment': 6, 'feedback': 4}
COUNTERS = {'experiment': 'experiments', 'feedback': 'feedback', 'comparison': 'comparisons', 'fixed_validation': 'fixed_validations'}
FIELDS = {'version', 'method', 'scope', 'cutoff', 'scan_limit', 'scanned', 'eligible', 'omitted_for_size', 'items'}


def configuration(version: int) -> tuple:
    if type(version) is not int or version not in (1, 2, 3):
        raise ValidationError('研究记忆版本无效')
    if version == 3:
        return (('fixed_validation','comparison',*KINDS),{**LIMITS,'comparison':4,'fixed_validation':4},'library-history-v3')
    return ((KINDS, LIMITS, METHOD) if version == 1 else
            (('comparison', *KINDS), {**LIMITS, 'comparison': 4}, 'library-history-v2'))


def instant(value: str) -> datetime:
    if not isinstance(value, str):
        raise ValidationError('研究记忆时间必须使用带时区的 ISO 格式')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValidationError('研究记忆时间无效') from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        # This project also persists dates with USE_TZ=False. Their timezone is
        # the configured application timezone, never the machine's local zone.
        parsed = django_timezone.make_aware(parsed, django_timezone.get_default_timezone())
    # SyncJSONEncoder persists Django datetimes at millisecond precision.
    # Freeze and comparison use that same precision so replay is exact; the
    # strict selection cutoff conservatively excludes its entire millisecond.
    parsed = parsed.astimezone(timezone.utc)
    return parsed.replace(microsecond=parsed.microsecond // 1000 * 1000)


def amount(value: dict) -> int:
    return len(json.dumps(value, ensure_ascii=False, allow_nan=False))


def relevance(seeds: list[dict], options: list[dict], market: dict | None, current_market: dict | None) -> dict:
    ids = {row['id'] for row in options}
    families = {row['candidate'].get('family') for row in options} - {None, '', 'other'}
    tags = set().union(*(set(row['candidate'].get('tags', [])) for row in options))
    shared_ids = sorted({row['id'] for row in seeds} & ids)
    shared_families = sorted({row['candidate'].get('family') for row in seeds} & families)
    shared_tags = sorted(set().union(*(set(row['candidate'].get('tags', [])) for row in seeds)) & tags)
    same_market = bool(market and current_market and all(
        isinstance(market.get(key), str) and market[key] and market[key] == current_market.get(key)
        for key in ('symbol', 'timeframe')))
    return {'shared_candidate_ids': shared_ids, 'shared_families': shared_families, 'shared_tags': shared_tags,
            'same_market': same_market,
            'rank_score': 8 * len(shared_ids) + 2 * len(shared_families) + min(4, len(shared_tags)) + int(same_market)}


def project(record: dict, options: list[dict], current_market: dict | None = None) -> dict:
    reason = relevance(record['seeds'], options, record.get('market'), current_market)
    return copy.deepcopy({key: record[key] for key in
        ('id', 'kind', 'title', 'entry_id', 'created_at', 'content_hash', 'evidence', 'has_negative_evidence')} | {'reason': reason})


def select(records: Iterable[dict], options: list[dict], *, collection_id: str, cutoff: str,
           scanned: dict, current_market: dict | None = None,
           exclude_result_id: str | None = None, exclude_source_id: str | None = None, exclude_validation_id: str | None = None, version: int = 1, scan_limits=None) -> dict:
    """Keep whole records and every attempt; never clip away negative observations."""
    stop = instant(cutoff)
    kinds, limits, method = configuration(version)
    pools = {kind: [] for kind in kinds}
    eligible = {kind: 0 for kind in kinds}
    oversized = 0
    for record in records:
        if record['kind'] not in kinds:
            continue
        if (record['collection_id'] != collection_id or instant(record['created_at']) >= stop
                or record.get('is_live') is False
                or record['id'] == (exclude_result_id if record['kind'] == 'experiment' else exclude_source_id if record['kind'] == 'feedback' else exclude_validation_id if record['kind']=='fixed_validation' else None)):
            continue
        item = project(record, options, current_market)
        if item['reason']['rank_score'] > 0 and (record['kind'] != 'comparison' or item['reason']['shared_candidate_ids']):
            eligible[item['kind']] += 1
            if amount(item) > MAX_CHARS:
                oversized += 1
            else:
                pools[item['kind']].append(item)
    for pool in pools.values():
        pool.sort(key=lambda row: (-row['reason']['rank_score'], -instant(row['created_at']).timestamp(), row['id']))
    memory = {'version': version, 'method': method, 'scope': 'same_collection', 'cutoff': cutoff,
              'scan_limit': SCAN_LIMIT, 'scanned': copy.deepcopy(scanned),
              'eligible': {COUNTERS[kind]: eligible[kind] for kind in kinds}, 'omitted_for_size': oversized, 'items': []}
    if version==3:
        from .scanning import SECONDS,MAX_CHARS as SCAN_CHARS
        memory['scan_limits']=copy.deepcopy(scan_limits or {'seconds':SECONDS,'max_chars':SCAN_CHARS,'chars_read':0,'budget_limited':False,'size_limited':False})
    # Preserve a failed experiment and a direct output counterexample before
    # filling each kind with higher-ranked successes.
    for kind in kinds:
        if kind not in ('experiment', 'comparison', 'fixed_validation'):
            continue
        negative = next((row for row in pools[kind] if row['has_negative_evidence']), None)
        if negative:
            pools[kind].remove(negative)
            pools[kind].insert(0, negative)
    counts = {kind: 0 for kind in kinds}
    while any(pools[kind] and counts[kind] < limits[kind] for kind in kinds):
        for kind in kinds:
            if not pools[kind] or counts[kind] >= limits[kind]:
                continue
            row = pools[kind].pop(0)
            memory['items'].append(row)
            if amount(memory) > MAX_CHARS - 8:  # room for the final omission counter's digits
                memory['items'].pop()
                memory['omitted_for_size'] += 1
                if kind in ('experiment', 'comparison', 'fixed_validation') and counts[kind] == 0:
                    next_negative = next((item for item in pools[kind] if item['has_negative_evidence']), None)
                    if next_negative:
                        pools[kind].remove(next_negative)
                        pools[kind].insert(0, next_negative)
            else:
                counts[kind] += 1
    return memory


def validate_header(memory: dict, *, latest_at: str) -> None:
    fields=FIELDS | ({'scan_limits'} if isinstance(memory,dict) and memory.get('version')==3 else set())
    if (not isinstance(memory, dict) or set(memory) != fields or type(memory['version']) is not int
            or memory['version'] not in (1, 2, 3) or memory['scope'] != 'same_collection'
            or type(memory['scan_limit']) is not int or memory['scan_limit'] != SCAN_LIMIT):
        raise ValidationError('跨来源研究记忆版本或范围无效')
    if memory['version']==3:
        from .scanning import SECONDS,MAX_CHARS as SCAN_CHARS
        info=memory.get('scan_limits')
        if (not isinstance(info,dict) or set(info)!={'seconds','max_chars','chars_read','budget_limited','size_limited'}
                or type(info['seconds']) is not int or info['seconds']!=SECONDS or type(info['max_chars']) is not int or info['max_chars']!=SCAN_CHARS
                or type(info['chars_read']) is not int or not 0<=info['chars_read']<=SCAN_CHARS
                or type(info['budget_limited']) is not bool or type(info['size_limited']) is not bool):
            raise ValidationError('历史研究扫描预算或覆盖范围无效')
    kinds, limits, method = configuration(memory['version'])
    counters = {COUNTERS[kind] for kind in kinds}
    if memory['method'] != method:
        raise ValidationError('跨来源研究记忆方法与版本不一致')
    if instant(memory['cutoff']) > instant(latest_at):
        raise ValidationError('研究记忆冻结时点晚于任务创建时间')
    for key in ('scanned', 'eligible'):
        counts = memory[key]
        if (not isinstance(counts, dict) or set(counts) != counters
                or any(type(value) is not int or not 0 <= value <= SCAN_LIMIT for value in counts.values())):
            raise ValidationError('研究记忆扫描统计无效')
    if any(memory['eligible'][key] > memory['scanned'][key] for key in counters):
        raise ValidationError('研究记忆候选数大于扫描数')
    items = memory['items']
    omitted = memory['omitted_for_size']
    if (not isinstance(items, list) or len(items) > sum(limits.values()) or type(omitted) is not int
            or omitted < 0 or len(items) + omitted > sum(memory['eligible'].values())):
        raise ValidationError('研究记忆记录或省略数无效')
    seen, counts = set(), {kind: 0 for kind in kinds}
    for row in items:
        if (not isinstance(row, dict) or row.get('kind') not in kinds or not isinstance(row.get('id'), str)
                or (row['kind'], row['id']) in seen):
            raise ValidationError('研究记忆记录重复或类型无效')
        seen.add((row['kind'], row['id']))
        counts[row['kind']] += 1
    if any(counts[kind] > min(limits[kind], memory['eligible'][COUNTERS[kind]]) for kind in kinds):
        raise ValidationError('研究记忆分类数量无效')
    try:
        if amount(memory) > MAX_CHARS:
            raise ValidationError('研究记忆超过材料上限')
    except (ValueError, TypeError, RecursionError) as exc:
        raise ValidationError('研究记忆不是有限 JSON') from exc


def summary(memory: dict | None) -> dict | None:
    if not memory:
        return None
    return copy.deepcopy({key: memory[key] for key in
        ('method', 'scope', 'cutoff', 'scan_limit', 'scanned', 'eligible', 'omitted_for_size')} | {
        'items': [{key: row[key] for key in ('id', 'kind', 'title', 'entry_id', 'created_at', 'content_hash',
                   'reason', 'has_negative_evidence')} for row in memory['items']],
        'claim': 'historical_relevance_not_equivalence_or_independent_validation',
        **({'scan_limits':memory['scan_limits']} if memory.get('version')==3 else {})})
