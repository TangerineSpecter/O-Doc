import type {ArticleAnnotation} from '../types/api/articleAnnotation';

const SKIP_TAGS = new Set(['pre', 'code', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'svg', 'iframe', 'video']);
const BLOCK_TAGS = new Set([
    'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl', 'dt',
    'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'section', 'ul',
]);

interface TextPosition {
    node: any;
    index: number;
    start: number;
    end: number;
    value: string;
    map: number[];
}

interface ResolvedAnnotation extends ArticleAnnotation {
    resolvedStartOffset: number;
    resolvedEndOffset: number;
    relatedAnnotationIds?: string[];
}

const isTextNode = (node: any) => node?.type === 'text' && typeof node.value === 'string';

const appendSyntheticSpace = (cursor: {text: string; lastWasSpace: boolean}) => {
    if (cursor.text.length === 0 || cursor.lastWasSpace) return;
    cursor.text += ' ';
    cursor.lastWasSpace = true;
};

const collectTextPositions = (
    node: any,
    positions: TextPosition[],
    cursor: {text: string; lastWasSpace: boolean},
    skip = false,
) => {
    if (!node) return;

    const tagName = String(node.tagName || '').toLowerCase();
    const shouldSkip = skip || SKIP_TAGS.has(tagName);
    if (shouldSkip) {
        appendSyntheticSpace(cursor);
        return;
    }

    if (tagName === 'br' || tagName === 'hr') {
        appendSyntheticSpace(cursor);
        return;
    }

    const isBlock = BLOCK_TAGS.has(tagName);
    if (isBlock) appendSyntheticSpace(cursor);

    if (Array.isArray(node.children)) {
        node.children.forEach((child: any, index: number) => {
            if (isTextNode(child)) {
                const value = child.value || '';
                const start = cursor.text.length;
                const map: number[] = [];

                for (let rawIndex = 0; rawIndex < value.length; rawIndex += 1) {
                    const char = value[rawIndex];
                    if (/\s/.test(char)) {
                        if (cursor.text.length > 0 && !cursor.lastWasSpace) {
                            cursor.text += ' ';
                            cursor.lastWasSpace = true;
                            map.push(rawIndex);
                        }
                        continue;
                    }

                    cursor.text += char;
                    cursor.lastWasSpace = false;
                    map.push(rawIndex);
                }

                if (map.length > 0) {
                    positions.push({
                        node,
                        index,
                        start,
                        end: start + map.length,
                        value,
                        map,
                    });
                }
                return;
            }
            collectTextPositions(child, positions, cursor, shouldSkip);
        });
    }

    if (isBlock) appendSyntheticSpace(cursor);
};

const buildTextSegment = (text: string, key: string) => ({
    type: 'text',
    value: text,
    data: {
        hProperties: {
            key,
        },
    },
});

const buildAnnotationElement = (annotation: ResolvedAnnotation, text: string, key: string) => ({
    type: 'element',
    tagName: 'span',
    properties: {
        key,
        className: ['article-annotation-mark'],
        dataAnnotationId: annotation.annotationId,
        'data-annotation-id': annotation.annotationId,
        dataAnnotationIds: annotation.relatedAnnotationIds?.join(',') || annotation.annotationId,
        'data-annotation-ids': annotation.relatedAnnotationIds?.join(',') || annotation.annotationId,
        title: '查看批注',
    },
    children: [{type: 'text', value: text}],
});

const normalizeTextWithMap = (value: string) => {
    let text = '';
    const map: number[] = [];
    let previousWasSpace = false;

    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (/\s/.test(char)) {
            if (!previousWasSpace && text.length > 0) {
                text += ' ';
                map.push(index);
            }
            previousWasSpace = true;
            continue;
        }

        text += char;
        map.push(index);
        previousWasSpace = false;
    }

    return {text: text.trimEnd(), map};
};

const findAllIndexes = (source: string, target: string) => {
    const indexes: number[] = [];
    if (!target) return indexes;

    let cursor = source.indexOf(target);
    while (cursor >= 0) {
        indexes.push(cursor);
        cursor = source.indexOf(target, cursor + Math.max(1, target.length));
    }
    return indexes;
};

const chooseClosestIndex = (indexes: number[], preferred: number) => {
    return indexes.reduce((best, current) => (
        Math.abs(current - preferred) < Math.abs(best - preferred) ? current : best
    ), indexes[0]);
};

const resolveAnnotationRanges = (annotations: ArticleAnnotation[], fullText: string): ResolvedAnnotation[] => {
    const normalizedFullText = normalizeTextWithMap(fullText);

    const resolved = annotations.flatMap(annotation => {
        const selectedText = annotation.selectedText || '';
        const storedStart = annotation.startOffset;
        const storedEnd = annotation.endOffset;

        if (fullText.slice(storedStart, storedEnd) === selectedText) {
            return [{...annotation, resolvedStartOffset: storedStart, resolvedEndOffset: storedEnd}];
        }

        const directMatches = findAllIndexes(fullText, selectedText);
        if (directMatches.length > 0) {
            const start = chooseClosestIndex(directMatches, storedStart);
            return [{...annotation, resolvedStartOffset: start, resolvedEndOffset: start + selectedText.length}];
        }

        const normalizedSelected = normalizeTextWithMap(selectedText).text;
        const normalizedMatches = findAllIndexes(normalizedFullText.text, normalizedSelected);
        if (normalizedMatches.length === 0) return [];

        const normalizedStart = chooseClosestIndex(normalizedMatches, storedStart);
        const start = normalizedFullText.map[normalizedStart];
        const end = normalizedFullText.map[normalizedStart + normalizedSelected.length - 1] + 1;
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

        return [{...annotation, resolvedStartOffset: start, resolvedEndOffset: end}];
    });

    const picked: ResolvedAnnotation[] = [];
    resolved
        .sort((a, b) => (
            (b.resolvedEndOffset - b.resolvedStartOffset) - (a.resolvedEndOffset - a.resolvedStartOffset)
            || a.resolvedStartOffset - b.resolvedStartOffset
        ))
        .forEach(annotation => {
            const overlaps = picked.some(item => (
                annotation.resolvedStartOffset < item.resolvedEndOffset
                && annotation.resolvedEndOffset > item.resolvedStartOffset
            ));
            if (!overlaps) {
                picked.push(annotation);
            }
        });

    return picked
        .map(annotation => ({
            ...annotation,
            relatedAnnotationIds: resolved
                .filter(item => (
                    item.resolvedStartOffset < annotation.resolvedEndOffset
                    && item.resolvedEndOffset > annotation.resolvedStartOffset
                ))
                .sort((a, b) => (
                    (b.resolvedEndOffset - b.resolvedStartOffset) - (a.resolvedEndOffset - a.resolvedStartOffset)
                    || a.resolvedStartOffset - b.resolvedStartOffset
                ))
                .map(item => item.annotationId),
        }))
        .sort((a, b) => a.resolvedStartOffset - b.resolvedStartOffset);
};

export const rehypeArticleAnnotations = (annotations: ArticleAnnotation[] = []) => {
    const activeAnnotations = annotations
        .filter(annotation => annotation.located && Number.isFinite(annotation.startOffset) && annotation.endOffset > annotation.startOffset)
        .sort((a, b) => a.startOffset - b.startOffset);

    return () => (tree: any) => {
        if (!activeAnnotations.length) return;

        const collectedPositions: TextPosition[] = [];
        const cursor = {text: '', lastWasSpace: false};
        collectTextPositions(tree, collectedPositions, cursor);
        const fullText = cursor.text.trimEnd();
        const positions = collectedPositions
            .filter(position => position.start < fullText.length)
            .map(position => {
                const end = Math.min(position.end, fullText.length);
                return {
                    ...position,
                    end,
                    map: position.map.slice(0, end - position.start),
                };
            })
            .filter(position => position.end > position.start);
        const resolvedAnnotations = resolveAnnotationRanges(activeAnnotations, fullText);
        if (!resolvedAnnotations.length) return;

        positions.reverse().forEach(position => {
            const originalNode = position.node.children[position.index];
            const value = originalNode.value || '';
            const segments: any[] = [];
            let rawCursor = 0;

            resolvedAnnotations.forEach(annotation => {
                const overlapStart = Math.max(annotation.resolvedStartOffset, position.start);
                const overlapEnd = Math.min(annotation.resolvedEndOffset, position.end);
                if (overlapStart >= overlapEnd) return;

                const normalizedStart = overlapStart - position.start;
                const normalizedEnd = overlapEnd - position.start;
                const rawStart = position.map[normalizedStart];
                const rawEnd = position.map[normalizedEnd - 1] + 1;
                if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) return;

                if (rawStart > rawCursor) {
                    segments.push(buildTextSegment(
                        value.slice(rawCursor, rawStart),
                        `text-${position.start}-${rawCursor}-${rawStart}`,
                    ));
                }
                segments.push(buildAnnotationElement(
                    annotation,
                    value.slice(rawStart, rawEnd),
                    `annotation-${annotation.annotationId}-${overlapStart}-${overlapEnd}`,
                ));
                rawCursor = rawEnd;
            });

            if (!segments.length) return;
            if (rawCursor < value.length) {
                segments.push(buildTextSegment(
                    value.slice(rawCursor),
                    `text-${position.start}-${rawCursor}-${value.length}`,
                ));
            }

            position.node.children.splice(position.index, 1, ...segments);
        });
    };
};
