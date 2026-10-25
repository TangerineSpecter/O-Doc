import { useEffect, useLayoutEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { keymap, EditorView, lineNumbers } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { pineLanguage } from './pineLanguage';
import { tongdaxinLanguage } from './tongdaxinLanguage';
import { quantCodeHighlight } from './codeHighlight';
import type { QuantLanguage } from '../../types/api/quant';

const languageExtension = (language: QuantLanguage | 'text' | 'tongdaxin') =>
    language === 'python' ? python() : language === 'mql4' ? cpp() : language === 'pine' ? pineLanguage : language === 'tongdaxin' ? tongdaxinLanguage : [];

export function CodeEditor({
    value,
    onChange,
    language,
    readOnly = false,
    compact = false,
    firstLine = 1,
}: {
    value: string;
    onChange?: (value: string) => void;
    language: QuantLanguage | 'text' | 'tongdaxin';
    readOnly?: boolean;
    compact?: boolean;
    firstLine?: number;
}) {
    const container = useRef<HTMLDivElement>(null);
    const editor = useRef<EditorView | null>(null);
    const languageConfig = useRef(new Compartment());
    const change = useRef(onChange);
    const syncingValue = useRef(false);
    useLayoutEffect(() => {
        change.current = onChange;
    }, [onChange]);
    useEffect(() => {
        if (!container.current) return;
        const view = new EditorView({
            parent: container.current,
            state: EditorState.create({
                doc: value,
                extensions: [
                    basicSetup,
                    lineNumbers({formatNumber: number => String(number + firstLine - 1)}),
                    quantCodeHighlight,
                    keymap.of([indentWithTab]),
                    languageConfig.current.of(languageExtension(language)),
                    EditorState.readOnly.of(readOnly),
                    EditorView.editable.of(!readOnly),
                    EditorView.contentAttributes.of({ 'aria-label': readOnly ? '代码预览' : '代码编辑器' }),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged && !syncingValue.current) change.current?.(update.state.doc.toString());
                    }),
                    EditorView.theme({
                        '&': { fontSize: '13px', backgroundColor: '#fff', minHeight: compact ? '0' : '320px' },
                        '.cm-content': {
                            fontFamily: 'JetBrains Mono, Fira Code, monospace',
                            padding: '16px 0',
                            minHeight: compact ? '0' : '320px',
                        },
                        '.cm-scroller': { overflow: 'auto', maxHeight: '55dvh', scrollbarWidth: 'none' },
                        '.cm-gutters': {
                            backgroundColor: '#f8fafc',
                            borderRight: '1px solid #e2e8f0',
                            color: '#94a3b8',
                        },
                        '.cm-activeLine': { backgroundColor: '#fff7ed' },
                        '.cm-focused': { outline: 'none' },
                        '.cm-cursor': { borderLeftColor: '#f97316' },
                        '.cm-selectionBackground': { background: '#ffedd5 !important' },
                        '.cm-search': { fontFamily: 'inherit' },
                        '&.cm-focused': { outline: 'none' },
                    }),
                ],
            }),
        });
        editor.current = view;
        return () => {
            view.destroy();
            editor.current = null;
        };
        // The editor instance is stable; value and language are synchronized below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readOnly, compact, firstLine]);
    useEffect(() => {
        const view = editor.current;
        if (!view || view.state.doc.toString() === value) return;
        // CodeMirror normalizes line endings internally. Loading an uploaded
        // file must not feed that normalization back into its unedited source.
        syncingValue.current = true;
        try {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
        } finally {
            syncingValue.current = false;
        }
    }, [value]);
    useEffect(() => {
        editor.current?.dispatch({
            effects: languageConfig.current.reconfigure(languageExtension(language)),
        });
    }, [language]);
    return <div ref={container} className="overflow-hidden rounded-xl border border-slate-200 bg-white" />;
}
