import {useState} from 'react';
import type {MemoItem} from '../types/api/memo';
import {collisionCount, drawMemos, replaceMemo} from '../utils/memoCollision';
export function useMemoCollision(pool: MemoItem[]) {
    const [count, setCount] = useState(() => collisionCount(localStorage.getItem('memo-collision-count')));
    const [cards, setCards] = useState<MemoItem[]>([]);
    const [locked, setLocked] = useState<string[]>([]);
    const [open, setOpen] = useState(false);
    const redraw = (size = count) => setCards(current => drawMemos(pool, size, current.filter(card => locked.includes(card.memoId))));
    return {count, cards, locked, open, close: () => setOpen(false),
        launch: () => {setCards(drawMemos(pool, count)); setLocked([]); setOpen(true);},
        show: () => setOpen(true), redraw,
        changeCount: (value: number) => {setCount(value); localStorage.setItem('memo-collision-count', String(value)); redraw(value);},
        toggleLock: (id: string) => setLocked(current => current.includes(id) ? current.filter(key => key !== id) : [...current, id]),
        replace: (id: string) => setCards(current => replaceMemo(pool, current, id, locked)),
    };
}
