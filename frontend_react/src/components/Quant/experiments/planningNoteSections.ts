export type PlanningNoteSection = {title: string; text: string};

/** Presentation only: use explicit headings, never infer a research result from keywords. */
export function planningNoteSections(note: string): PlanningNoteSection[] {
    const text = note.trim();
    if (!text) return [];
    // Markdown already has a structure; keep fenced code and lists together for its renderer.
    if (/^\s*(?:#{1,6}\s|```|~~~)/m.test(text)) return [{title: '完整说明', text}];
    const heading = /(^|[。！？\n]\s*)(源码事实|参数默认值方面|参数默认值|平台语义未知|平台语义|时点方面|综合|结论|缺的是|后续建议|下一步)[：:，]/g;
    const sections: PlanningNoteSection[] = [];
    let start = 0;
    let title = '说明与边界';
    for (const match of text.matchAll(heading)) {
        const end = match.index! + match[1].length;
        const content = text.slice(start, end).trim();
        if (content) sections.push({title, text: content});
        title = match[2] === '缺的是' ? '待补充内容' : match[2];
        start = match.index! + match[0].length;
    }
    if (text.slice(start).trim()) sections.push({title, text: text.slice(start).trim()});
    return sections;
}

/** Break prose at Chinese sentence boundaries, keeping numbers, code and quotations intact. */
export function planningNoteParagraphs(text: string): string[] {
    if (/^\s*(?:[#>*-]|\d+\.)\s|```|~~~|^\s*\|.+\|\s*$/m.test(text)) return [text];
    const paragraphs: string[] = [];
    const pairs: Record<string, string> = {'（': '）', '(': ')', '[': ']', '“': '”', '「': '」', '`': '`', '"': '"'};
    const stack: string[] = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (stack[stack.length - 1] === char) stack.pop();
        else if (pairs[char]) stack.push(pairs[char]);
        if (!stack.length && (char === '\n' || (/[。！？]/.test(char) && i - start >= 100))) {
            const paragraph = text.slice(start, i + 1).trim();
            if (paragraph) paragraphs.push(paragraph);
            start = i + 1;
        }
    }
    if (text.slice(start).trim()) paragraphs.push(text.slice(start).trim());
    return paragraphs;
}
