export interface ParsedBlock {
    type: 'paragraph' | 'blockquote' | 'divider';
    text: string;
}

export interface InlinePhotoGroup {
    type: 'single' | 'duo';
    items: {assetId: string; globalIndex: number}[];
}

/** Parse reading blocks while retaining paragraph indentation. */
export function parseDiaryContent(content: string): ParsedBlock[] {
    const blocks: ParsedBlock[] = [];
    let currentParagraph: string[] = [];
    const flushParagraph = () => {
        if (currentParagraph.length) {
            const text = currentParagraph.join('\n').trimEnd();
            if (text.replace(/[\s\u3000]+/g, '').length) blocks.push({type: 'paragraph', text});
            currentParagraph = [];
        }
    };
    for (const rawLine of content.split('\n')) {
        if (!rawLine.replace(/[\s\u3000]+/g, '').length) {
            flushParagraph();
            continue;
        }
        const checkSyntax = rawLine.replace(/^[ \t]+/, '');
        if (/^([-*_~])\1{2,}$/.test(checkSyntax.trim())) {
            flushParagraph();
            blocks.push({type: 'divider', text: ''});
        } else if (checkSyntax.startsWith('>')) {
            flushParagraph();
            blocks.push({type: 'blockquote', text: checkSyntax.replace(/^>\s?/, '').trimEnd()});
        } else {
            if (rawLine.startsWith('\u3000\u3000') && currentParagraph.length) flushParagraph();
            currentParagraph.push(rawLine.trimEnd());
        }
    }
    flushParagraph();
    return blocks;
}

/** Multiple photo groups may share one paragraph; -1 places them before text. */
export function buildInlinePhotoSchedule(images: string[], paragraphIndices: number[], hasHeroCover: boolean): Map<number, InlinePhotoGroup[]> {
    const schedule = new Map<number, InlinePhotoGroup[]>();
    const inlinePool = hasHeroCover ? images.slice(1) : images;
    const baseGlobalIdx = hasHeroCover ? 1 : 0;
    const groups: InlinePhotoGroup[] = [];
    let cursor = 0;
    while (cursor < inlinePool.length) {
        const remaining = inlinePool.length - cursor;
        const single = remaining === 1 || (paragraphIndices.length >= remaining * 2 && remaining <= 2);
        const count = single ? 1 : 2;
        groups.push({type: single ? 'single' : 'duo', items: inlinePool.slice(cursor, cursor + count).map((assetId, index) => ({
            assetId, globalIndex: baseGlobalIdx + cursor + index,
        }))});
        cursor += count;
    }
    for (const [index, group] of groups.entries()) {
        const step = Math.min(paragraphIndices.length - 1,
            Math.floor(((index + 1) * paragraphIndices.length) / (groups.length + 1)));
        const blockIndex = paragraphIndices.length ? paragraphIndices[step] : -1;
        const selected = schedule.get(blockIndex) || [];
        selected.push(group);
        schedule.set(blockIndex, selected);
    }
    return schedule;
}
