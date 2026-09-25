export interface ArticleIllustrationSelection {
    content: string;
    start: number;
    end: number;
}

const commonSuffixLength = (left: string, right: string) => {
    let length = 0;
    while (length < left.length && length < right.length && left[left.length - length - 1] === right[right.length - length - 1]) {
        length += 1;
    }
    return length;
};

const commonPrefixLength = (left: string, right: string) => {
    let length = 0;
    while (length < left.length && length < right.length && left[length] === right[length]) length += 1;
    return length;
};

export function resolveIllustrationInsertionIndex(content: string, selection: ArticleIllustrationSelection) {
    if (content === selection.content) return selection.end;

    const selectedText = selection.content.slice(selection.start, selection.end);
    if (!selectedText) return Math.min(selection.end, content.length);

    const leftContext = selection.content.slice(Math.max(0, selection.start - 80), selection.start);
    const rightContext = selection.content.slice(selection.end, selection.end + 80);
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let searchFrom = 0;

    while (searchFrom <= content.length) {
        const candidate = content.indexOf(selectedText, searchFrom);
        if (candidate < 0) break;
        const left = content.slice(Math.max(0, candidate - leftContext.length), candidate);
        const right = content.slice(candidate + selectedText.length, candidate + selectedText.length + rightContext.length);
        const contextScore = commonSuffixLength(leftContext, left) + commonPrefixLength(rightContext, right);
        const distancePenalty = Math.abs(candidate - selection.start) / 1000;
        const score = contextScore - distancePenalty;
        if (score > bestScore) {
            bestScore = score;
            bestIndex = candidate + selectedText.length;
        }
        searchFrom = candidate + 1;
    }

    return bestIndex >= 0 ? bestIndex : Math.min(selection.end, content.length);
}

export function insertArticleIllustration(content: string, insertionIndex: number, imageUrl: string) {
    const index = Math.max(0, Math.min(insertionIndex, content.length));
    const before = content.slice(0, index);
    const after = content.slice(index);
    const beforeSeparator = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const afterSeparator = !after || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    const imageMarkdown = `![文章配图](${imageUrl})`;
    return `${before}${beforeSeparator}${imageMarkdown}${afterSeparator}${after}`;
}
