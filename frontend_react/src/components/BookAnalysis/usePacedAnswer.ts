import {useCallback, useEffect, useRef, useState} from 'react';
import {nextAnswerRevealIndex} from '../../utils/readingAnswer';

export function usePacedAnswer() {
    const [answer, setAnswer] = useState('');
    const [busy, setBusy] = useState(false);
    const target = useRef('');
    const visibleLength = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const finished = useRef(false);

    const clearTimer = useCallback(() => {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
    }, []);
    const advance = useCallback(function advance() {
        timer.current = null;
        if (visibleLength.current < target.current.length) {
            visibleLength.current = nextAnswerRevealIndex(target.current, visibleLength.current);
            setAnswer(target.current.slice(0, visibleLength.current));
        }
        if (visibleLength.current < target.current.length) timer.current = setTimeout(advance, 35);
        else if (finished.current) setBusy(false);
    }, []);
    const start = useCallback(() => {
        clearTimer();
        target.current = '';
        visibleLength.current = 0;
        finished.current = false;
        setAnswer('');
        setBusy(true);
    }, [clearTimer]);
    const append = useCallback((text: string) => {
        if (!text) return;
        target.current += text;
        if (timer.current === null) timer.current = setTimeout(advance, 35);
    }, [advance]);
    const finish = useCallback(() => {
        finished.current = true;
        if (timer.current === null && visibleLength.current === target.current.length) setBusy(false);
    }, []);
    const stop = useCallback(() => {
        clearTimer();
        finished.current = true;
        visibleLength.current = target.current.length;
        setAnswer(target.current);
        setBusy(false);
    }, [clearTimer]);
    const reset = useCallback(() => {
        clearTimer();
        target.current = '';
        visibleLength.current = 0;
        finished.current = false;
        setAnswer('');
        setBusy(false);
    }, [clearTimer]);
    useEffect(() => clearTimer, [clearTimer]);
    return {answer, busy, start, append, finish, stop, reset};
}
