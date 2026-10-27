"""Bounded source-change facts and AI assessment, bound to a new workflow only."""
import copy
import json
import re
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest

WORKFLOWS = (18, 20, 22, 24, 26, 27)
KEYS = {'source_change_review_version', 'source_change_facts_json', 'source_change_assessment'}
COUNTS = ('added', 'removed', 'changed', 'moved', 'identical', 'direct', 'potential', 'unknown')
MAX_NODES = 24
MAX_CHARS = 18000


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def facts(payload, plan):
    if not isinstance(plan, dict) or type(plan.get('version')) is not int or plan['version'] not in (2, 3, 4):
        raise ValidationError('源码变化复核需要本次版本2/3/4的冻结片段方案')
    change = plan.get('change')
    if not isinstance(change, dict):
        raise ValidationError('源码变化复核缺少明确的跨源码基准')
    structure = change['structure']
    candidates = [row for row in structure['nodes'] if row['kind'] != 'module'
                  and row['impact'] in ('direct', 'potential', 'unknown')]
    candidates.sort(key=lambda row: (('direct', 'potential', 'unknown').index(row['impact']), row['id']))
    version = 2 if plan['version'] in (3, 4) else 1
    value = {'version': version, 'method': f'bounded-source-change-review-v{version}',
        'baseline': copy.deepcopy(plan['baseline']), 'target_source_hash': digest(payload),
        'change_hash': digest(change), 'status': change['status'], 'changed_fields': change['changed_fields'],
        'old_parser': structure['old_parser'], 'new_parser': structure['new_parser'],
        'counts': structure['counts'], 'total_nodes': structure['total_nodes'],
        'eligible_nodes': len(candidates), 'omitted_nodes': max(0, len(candidates) - MAX_NODES),
        'nodes': copy.deepcopy(candidates[:MAX_NODES]),
        'limitations': list(dict.fromkeys([*structure['limitations'], *change['limitations'],
            '本清单只复核选中的静态线索；省略和未观测到影响均不能解释为未受影响。']))}
    # Drop whole records only, retaining true counts and the complete impact
    # hash. Long names/reasons cannot silently consume the whole model budget.
    while value['nodes'] and len(encode(value)) > MAX_CHARS:
        value['nodes'].pop()
        value['omitted_nodes'] += 1
    if len(encode(value)) > MAX_CHARS:
        raise ValidationError('源码变化复核的固定元数据超过上限，不能静默截断依据')
    validate_facts(value)
    return copy.deepcopy(value)


def text(value, limit=2000):
    return isinstance(value, str) and bool(value.strip()) and len(value) <= limit


def integer(value, maximum=512):
    return type(value) is int and 0 <= value <= maximum


def line_range(value):
    return value is None or (isinstance(value, dict) and set(value) == {'start_line', 'end_line'}
        and integer(value['start_line'], 2000) and integer(value['end_line'], 2000)
        and 1 <= value['start_line'] <= value['end_line'])


def validate_facts(value):
    expected = {'version', 'method', 'baseline', 'target_source_hash', 'change_hash', 'status',
        'changed_fields', 'old_parser', 'new_parser', 'counts', 'total_nodes', 'eligible_nodes',
        'omitted_nodes', 'nodes', 'limitations'}
    if not isinstance(value, dict) or set(value) != expected:
        raise ValidationError('源码变化固定事实不完整')
    baseline, counts, nodes = value['baseline'], value['counts'], value['nodes']
    good_hash = lambda item: isinstance(item, str) and re.fullmatch(r'[a-f0-9]{64}', item)
    if (type(value['version']) is not int or value['version'] not in (1, 2)
            or value['method'] != f"bounded-source-change-review-v{value['version']}"
            or value['status'] not in ('changed', 'identical', 'limited')
            or not isinstance(baseline, dict) or set(baseline) != {'run_id', 'source_id', 'source_hash', 'outcome_id'}
            or not all(text(baseline[key], 200) for key in ('run_id', 'source_id'))
            or not isinstance(baseline['outcome_id'], str) or len(baseline['outcome_id']) > 200
            or not all(good_hash(item) for item in (baseline['source_hash'], value['target_source_hash'], value['change_hash']))
            or not isinstance(counts, dict) or set(counts) != set(COUNTS)
            or not all(integer(item) for item in counts.values())
            or not all(integer(value[key]) for key in ('total_nodes', 'eligible_nodes', 'omitted_nodes'))
            or value['eligible_nodes'] > value['total_nodes']
            or sum(counts[key] for key in COUNTS[:5]) != value['total_nodes']
            or sum(counts[key] for key in COUNTS[5:]) > value['total_nodes']
            or not isinstance(nodes, list) or len(nodes) > MAX_NODES
            or len(nodes) + value['omitted_nodes'] != value['eligible_nodes']
            or not all(text(value[key], 200) for key in ('old_parser', 'new_parser'))):
        raise ValidationError('源码变化固定事实的版本、身份或计数无效')
    for key, limit, size in (('changed_fields', 60, 200), ('limitations', 40, 2000)):
        rows = value[key]
        if not isinstance(rows, list) or len(rows) > limit or not all(text(item, size) for item in rows):
            raise ValidationError('源码变化事实的范围或限制无效')
    seen = set()
    node_keys = {'id', 'name', 'kind', 'change', 'impact', 'old_range', 'new_range', 'reasons'}
    for node in nodes:
        if (not isinstance(node, dict) or set(node) != node_keys
                or not all(text(node[key], 30000 if key == 'name' else 200) for key in ('id', 'name', 'kind'))
                or node['id'] in seen or node['kind'] == 'module'
                or node['change'] not in COUNTS[:5] or node['impact'] not in COUNTS[5:]
                or not line_range(node['old_range']) or not line_range(node['new_range'])
                or not isinstance(node['reasons'], list) or len(node['reasons']) > 40
                or not all(text(item) for item in node['reasons'])):
            raise ValidationError('源码变化节点身份、范围或影响无效')
        seen.add(node['id'])
    return value


def assessment(value, fixed):
    if not isinstance(value, dict) or set(value) != {'summary', 'nodes', 'limitations'}:
        raise ValidationError('AI源码变化复核需要summary、nodes及limitations')
    if not text(value['summary'], 3000) or not isinstance(value['nodes'], list) or len(value['nodes']) > MAX_NODES:
        raise ValidationError('AI源码变化复核摘要或节点数量无效')
    required = {row['id'] for row in fixed['nodes']}
    seen, rows = set(), {}
    for row in value['nodes']:
        if (not isinstance(row, dict) or set(row) != {'node_id', 'analysis', 'verification_needed'}
                or not isinstance(row['node_id'], str) or row['node_id'] not in required or row['node_id'] in seen
                or not all(text(row[key], 1500) for key in ('analysis', 'verification_needed'))):
            raise ValidationError('AI源码变化复核存在重复、外部或不完整的节点')
        seen.add(row['node_id']); rows[row['node_id']] = row
    limits = value['limitations']
    if seen != required or not isinstance(limits, list) or not 1 <= len(limits) <= 8 or not all(text(item, 1000) for item in limits):
        raise ValidationError('AI源码变化复核须覆盖全部给定节点并说明未知和未验证项')
    return {'summary': value['summary'], 'nodes': [copy.deepcopy(rows[row['id']]) for row in fixed['nodes']],
            'limitations': copy.deepcopy(limits)}


def from_review(value, payload, plan):
    fixed = facts(payload, plan)
    expected = encode(fixed)
    if 'source_change_review_version' in value and (type(value['source_change_review_version']) is not int or value['source_change_review_version'] != fixed['version']):
        raise ValidationError('源码变化复核版本被改写')
    if 'source_change_facts_json' in value and value['source_change_facts_json'] != expected:
        raise ValidationError('AI或恢复记录不能改写系统固定的源码变化事实')
    return {'source_change_review_version': fixed['version'], 'source_change_facts_json': expected,
            'source_change_assessment': assessment(value.get('source_change_assessment'), fixed)}


def extension(value):
    if not KEYS.intersection(value):
        return {}
    if not KEYS <= value.keys() or type(value['source_change_review_version']) is not int or value['source_change_review_version'] not in (1, 2):
        raise ValidationError('源码变化报告扩展版本或字段无效')
    raw = value['source_change_facts_json']
    if not isinstance(raw, str) or len(raw) > MAX_CHARS:
        raise ValidationError('源码变化事实JSON无效或超过上限')
    try:
        fixed = json.loads(raw)
        validate_facts(fixed)
        if encode(fixed) != raw or fixed['version'] != value['source_change_review_version']:
            raise ValueError('noncanonical facts')
    except (ValueError, TypeError, RecursionError) as exc:
        raise ValidationError('源码变化事实不是完整规范JSON') from exc
    return {'source_change_review_version': fixed['version'], 'source_change_facts_json': raw,
            'source_change_assessment': assessment(value['source_change_assessment'], fixed)}


def validate_admission(value, version):
    if value and (bool(KEYS.intersection(value)) != (version in WORKFLOWS)):
        raise ValidationError('源码变化复核须绑定支持的工作流，旧报告不能补写此复核')
    if value and version in WORKFLOWS:
        extension(value)
        if value['source_change_review_version'] != (2 if version in (20, 22, 24, 26, 27) else 1):
            raise ValidationError('源码变化报告版本须与冻结工作流一致，不可降级')


INSTRUCTION = '''
本次另须source_change_assessment:{summary:新版本相对基准的变化及影响总结,
nodes:[{node_id:source_change_review_facts.nodes中的原样id,analysis:结合本次原文解释该节点变化或潜在影响,
verification_needed:还需什么验证或资料}],limitations:[未证明事项与省略范围]}。
给定nodes每项恰好复核一次，不补造节点。即使没有节点，也说明解析范围和缺少的证据。
direct只是原文字节变化，potential来自静态读取链，unknown不能断言未受影响；检查本次完整原文。
词法绑定不是运行时数据流、时序、平台等价或编译证明；有省略就明确未覆盖。
局部片段沿用不表示全局结论沿用。本次参数、候选、评分和实验计划仍重新审查，不继承原分数。
不输出source_change_review_version/source_change_facts_json，系统复制事实。
'''


def markdown(value):
    if value.get('source_change_review_version') not in (1, 2):
        return []
    fixed = json.loads(value['source_change_facts_json'])
    reviewed = value['source_change_assessment']
    parts = ['## 源码变化影响复核', reviewed['summary'],
        f"系统静态线索：共{fixed['total_nodes']}个节点；本次复核{len(fixed['nodes'])}项，另省略{fixed['omitted_nodes']}项待核对线索。",
        '词法绑定与赋值读取不证明运行时依赖、原平台等价或新版本通过；评分没有从基准继承。']
    by_id = {row['node_id']: row for row in reviewed['nodes']}
    labels = {'direct': '原文直接变化', 'potential': '潜在影响', 'unknown': '影响未知'}
    changes = dict(added='新增', removed='删除', changed='改变', moved='位置移动', identical='相同')
    def location(value):
        return f"第{value['start_line']}–{value['end_line']}行" if value else '无定位'
    for node in fixed['nodes']:
        row = by_id[node['id']]
        label = f"`{node['name']}`" if fixed['version'] == 2 else node['name']
        parts += [f"### {label} · {labels[node['impact']]}",
            f"原文位置：旧{location(node['old_range'])} → 新{location(node['new_range'])}；文本状态：{changes[node['change']]}。",
            '系统依据：' + ('；'.join(node['reasons']) or '解析范围有限，影响未知。'),
            'AI复核：' + row['analysis'], '仍需验证：' + row['verification_needed']]
    parts += ['### 复核范围与未验证项', *fixed['limitations'], *reviewed['limitations']]
    return parts
