// Only turn markers backed by returned evidence into links. Leave code and existing links untouched.
const protectedOrCitation = /(```[^\n]*\n[\s\S]*?```|~~~[^\n]*\n[\s\S]*?~~~|`+[^`\n]*`+|!?\[[^\]]*\]\([^)]*\)|\[(S\d+)\])/g;

export function linkBookCitations(answer: string, sourceIds: string[]): string {
    const available = new Set(sourceIds);
    return answer.replace(protectedOrCitation, (match, _protected: string, sourceId: string | undefined) =>
        sourceId && available.has(sourceId) ? `[${sourceId}](#source-${sourceId})` : match
    );
}

export function nextAnswerRevealIndex(answer: string, visibleLength: number): number {
    const pending = answer.length - visibleLength;
    const step = Math.min(24, Math.max(2, Math.ceil(pending / 50)));
    let next = Math.min(answer.length, visibleLength + step);
    // Do not show half of an emoji or another UTF-16 surrogate pair.
    if (next < answer.length && answer.charCodeAt(next - 1) >= 0xd800 && answer.charCodeAt(next - 1) <= 0xdbff && answer.charCodeAt(next) >= 0xdc00 && answer.charCodeAt(next) <= 0xdfff) next += 1;
    return next;
}
