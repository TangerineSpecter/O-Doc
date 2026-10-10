import type {MemoItem} from '../types/api/memo';
export function drawMemos(pool: MemoItem[], count: number, retained: MemoItem[] = [], random = Math.random): MemoItem[] {
    const keep = retained.slice(0, count);
    const ids = new Set(keep.map(item => item.memoId));
    const candidates = pool.filter(item => !ids.has(item.memoId));
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return [...keep, ...candidates.slice(0, Math.max(0, count - keep.length))];
}
export function collisionCount(value: string | null): number {
    const count = Number(value);
    return [3, 4, 5].includes(count) ? count : 3;
}

export function replaceMemo(pool: MemoItem[], cards: MemoItem[], id: string, locked: string[], random = Math.random): MemoItem[] {
    if (locked.includes(id)) return cards;
    const candidates = pool.filter(card => !cards.some(picked => picked.memoId === card.memoId));
    if (!candidates.length) return cards;
    const next = candidates[Math.floor(random() * candidates.length)];
    return cards.map(card => card.memoId === id ? next : card);
}
