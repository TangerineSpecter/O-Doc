"""Explicit midrank exports; do not substitute a platform's differently tied rank."""
from rest_framework.exceptions import ValidationError

PINE_HELPER = '''qRank(float source, bool available, int n) =>
    float score = 0.0
    bool valid = bar_index >= n - 1
    for j = 0 to n - 1
        valid := valid and available[j]
        score += source[j] < source ? 1.0 : source[j] == source ? 0.5 : 0.0
    valid ? score / n : na
'''
MQL_HELPER = '''double QRank(const double &a[], int i, int n) {
    if(n<1 || n>2000 || i<n-1 || !QValid(a[i])) return EMPTY_VALUE;
    double score=0;
    for(int k=i-n+1;k<=i;k++) {
        if(!QValid(a[k])) return EMPTY_VALUE;
        score += a[k]<a[i] ? 1.0 : a[k]==a[i] ? 0.5 : 0.0;
    }
    return score/n;
}
'''


def tdx_rank(lines: list[str], index: int, source: str, window: str, node: dict) -> str:
    """Expand historical comparisons: constants use N terms; input windows use 2000.

    Never use CONST(current), which would leak the last bar into earlier bars.
    Chunk sums keep each individual formula expression bounded. Native compiler
    limits still need platform acceptance; the bundle caps total generated size.
    """
    count = node['value'] if node['op'] == 'constant' else 2000
    if type(count) is not int or not 1 <= count <= 2000:
        raise ValidationError('排序导出窗口须为 1–2000 整数')
    parts = []
    for start in range(0, count, 16):
        terms = []
        for offset in range(start, min(start + 16, count)):
            old = source if offset == 0 else f'REF({source},{offset})'
            comparison = f'IF({old}<{source},1,IF({old}={source},0.5,0))'
            terms.append(f'IF({window}>{offset},{comparison},0)' if node['op'] == 'parameter' else comparison)
        name = f'tr{index}_{start // 16}'
        lines.append(name + ':=' + '+'.join(terms) + ';')
        parts.append(name)
    return '(' + '+'.join(parts) + f')/{window}'
