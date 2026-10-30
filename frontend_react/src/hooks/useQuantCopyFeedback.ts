import { useEffect, useRef, useState } from 'react';
import { copyQuantText } from '../utils/quant';

/** Shared clipboard feedback; only the latest request may update its button. */
export function useQuantCopyFeedback() {
    const [copiedKey, setCopiedKey] = useState('');
    const [error, setError] = useState('');
    const request = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => {
        request.current++;
        clearTimeout(timer.current);
    }, []);
    const copy = async (text: string, key = 'copy') => {
        const id = ++request.current;
        clearTimeout(timer.current);
        setCopiedKey('');
        setError('');
        try {
            await copyQuantText(text);
            if (id !== request.current) return;
            setCopiedKey(key);
            timer.current = setTimeout(() => setCopiedKey(''), 1800);
        } catch {
            if (id === request.current) setError('复制失败，请选中文本后手动复制。');
        }
    };
    return { copiedKey, error, copy };
}
