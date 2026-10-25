"""Program-rendered positions stay distinct from the model's interpretation."""


def markdown(value,*,joined=False):
    parts=['### 程序核算的有效行与缺失位置']
    if value['status']!='available':return parts+['原函数未产生完整输出，位置保持未知；不能以0行或零值补齐。']
    def point(row):return f"{row['index']}（{row['timestamp']}）" if row else '无有效行'
    parts += ['行号从本次固定片段0开始；以下首次/末次有效行覆盖整个片段，与显式排除的预热行数分别记录。']
    table=['| 输出侧 | 首次有效行 | 末次有效行 | 整个片段缺失数 |','| --- | --- | --- | --- |']
    for side,label in (('left','左：受控表达式'),('right','右：原始函数')):
        row=value[side];table.append(f"| {label} | {point(row['first_valid'])} | {point(row['last_valid'])} | {row['missing_count']} |")
    parts += ['\n'.join(table)] if joined else table
    compared=value['compared']
    parts.append(f"实际比较从行{value['compared_start_index']}开始，共{compared['row_count']}行；缺失不一致共{compared['missing_mismatch_total']}行。")
    for row in compared['missing_mismatch_examples']:
        parts.append(f"- 行{row['index']}（{row['timestamp']}）：{'左侧' if row['left_missing'] else '右侧'}缺失，另一侧有值。")
    if compared['omitted_missing_mismatches']:
        parts.append(f"另有{compared['omitted_missing_mismatches']}条缺失位置未在摘要展开，完整数量仍计入判定。")
    return parts
