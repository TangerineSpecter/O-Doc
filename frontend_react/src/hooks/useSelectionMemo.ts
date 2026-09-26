import {useEffect, useRef, useState} from 'react';
import {createMemo} from '../api/memo';
import {useToast} from '../components/common/ToastProvider';
import {useEscapeDismissal} from './useEscapeDismissal';

interface TextSelection {
    text: string;
    left: number;
    top: number;
}

/** 仅采集指定正文中的选区，保存到现有 memos API。 */
export function useSelectionMemo(enabled: boolean) {
    const bodyRef = useRef<HTMLDivElement>(null);
    const savingRef = useRef(false);
    const [selection, setSelection] = useState<TextSelection | null>(null);
    const [saving, setSaving] = useState(false);
    const toast = useToast();
    useEscapeDismissal(Boolean(selection), () => setSelection(null));

    useEffect(() => {
        if (!enabled) return;
        const capture = () => {
            const root = bodyRef.current;
            const selected = window.getSelection();
            if (!root || !selected || selected.isCollapsed || !selected.rangeCount) {
                setSelection(null);
                return;
            }
            const range = selected.getRangeAt(0);
            if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
                setSelection(null);
                return;
            }
            const text = selected.toString().trim();
            if (!text) { setSelection(null); return; }
            const rect = range.getBoundingClientRect();
            setSelection({
                text,
                left: Math.max(8, Math.min(rect.left + rect.width / 2 - 80, window.innerWidth - 168)),
                top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 52)),
            });
        };
        const clear = () => setSelection(null);
        const root = bodyRef.current;
        root?.addEventListener('pointerup', capture);
        root?.addEventListener('keyup', capture);
        document.addEventListener('selectionchange', clearCollapsed);
        function clearCollapsed() {
            if (window.getSelection()?.isCollapsed) clear();
        }
        window.addEventListener('scroll', clear, true);
        window.addEventListener('resize', clear);
        const onOutsidePointerDown = (event: PointerEvent) => {
            if (event.target instanceof Element && event.target.closest('[data-selection-memo-menu]')) return;
            clear();
        };
        document.addEventListener('pointerdown', onOutsidePointerDown);
        return () => {
            root?.removeEventListener('pointerup', capture);
            root?.removeEventListener('keyup', capture);
            document.removeEventListener('selectionchange', clearCollapsed);
            window.removeEventListener('scroll', clear, true);
            window.removeEventListener('resize', clear);
            document.removeEventListener('pointerdown', onOutsidePointerDown);
        };
    }, [enabled]);

    const saveMemo = async () => {
        if (!selection || savingRef.current) return;
        if (selection.text.length > 2000) {
            toast.error('memos 最多保存 2000 个字符，请缩短选中文字');
            return;
        }
        savingRef.current = true;
        setSaving(true);
        try {
            await createMemo({content: selection.text});
            toast.success('已加入 memos');
            setSelection(null);
        } catch {
            toast.error('加入 memos 失败，请重试');
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };
    return {bodyRef, selection: enabled ? selection : null, saving, saveMemo};
}
