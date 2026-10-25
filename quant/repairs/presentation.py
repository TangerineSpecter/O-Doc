"""Report prose explains AI revisions separately from the original research score."""


def detail(candidate) -> dict:
    from .contracts import identifiers
    revisions, current = [], None
    for item in candidate.report.data.get('factor_repair', {}).get('items', []):
        if item['status'] != 'revised': continue
        root, _, child = identifiers(candidate.report_id, item['factor_index'])
        if candidate.pk == root:
            revisions.append({'candidate_id': child, 'name': item['definition']['name'], 'summary': item['summary']})
        if candidate.pk == child:
            current = {key: item[key] for key in ('summary', 'changed_fields', 'evidence', 'remaining_unknowns')}
            current['parent_candidate_id'] = root
    return {'ai_revisions': revisions, 'ai_revision': current}


def markdown(repair: dict, factors: list[dict]) -> list[str]:
    parts = ['## AI 定义修订', '原始提取保留；以下是独立修订假设，不能把结构通过当作原平台修复、等价或收益证据。研究质量分仍评价原资料。']
    if not repair['selected']:
        return parts + ['本次未发现需要修订的受控定义或默认配置，不额外调用修订模型。']
    for row in repair['items']:
        parts += [f"### {factors[row['factor_index']]['name']} · {'已生成独立修订' if row['status'] == 'revised' else '尚未解决'}", row['summary']]
        if row['definition']:
            parts += ['变更字段：' + '、'.join(row['changed_fields']), row['definition']['formula'],
                '定义中的默认配置：' + ('；'.join(f"{item['name']}={item['default_value'] or '未知'}" for item in row['definition']['parameters']) or '无参数'),
                '修订版已独立入库，可从候选的“公式版本”查看；没有继承原版实验或评分。']
        parts += ['仍待核对：' + '；'.join(row['remaining_unknowns'])] if row['remaining_unknowns'] else []
        parts += [f"原文依据（{quote['field']}）：\n\n> " + quote['quote'].replace('\n', '\n> ') for quote in row['evidence']]
    if repair['omitted']:
        parts += [f"本次修订预算最多4项，另有 {len(repair['omitted'])} 项保留待处理；不将其视为通过。"]
    return parts
