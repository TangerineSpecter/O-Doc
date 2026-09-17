export function visibleFlowIndexes(total: number, showAll: boolean): number[] {
    if (showAll || total <= 6) return Array.from({length: total}, (_, index) => index);
    return [0, 1, ...Array.from({length: 4}, (_, index) => total - 4 + index)];
}
