/** Select only the explanatory sections from an untouched generated source report.
 * Revisions are always rendered in full, since users may intentionally edit them.
 */
export function logicReportBody(markdown: string, edited: boolean): string {
    if (edited) return markdown;
    const wanted = new Set(['原理与计算逻辑', '计算原理', '原理', '计算逻辑', '公式', '用途与条件']);
    const lines = markdown.split(/\r?\n/);
    const sections: string[][] = [];
    let current: string[] | null = null;
    let fence = '';
    for (const line of lines) {
        const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
        if (marker) {
            if (!fence) fence = marker[0];
            else if (fence === marker[0]) fence = '';
        }
        const heading = !fence && /^##\s+(.+?)\s*$/.exec(line);
        if (heading) {
            current = wanted.has(heading[1]) ? [line] : null;
            if (current) sections.push(current);
        } else if (current) current.push(line);
    }
    const selected = sections.map((section) => section.join('\n').trim()).filter(Boolean).join('\n\n');
    return selected || markdown;
}
