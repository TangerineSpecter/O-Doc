import { useEffect, useLayoutEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { keymap, EditorView } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import type { QuantLanguage } from '../../types/api/quant';

export function CodeEditor({
    value,
    onChange,
    language,
    readOnly = false,
}: {
    value: string;
    onChange?: (value: string) => void;
    language: QuantLanguage;
    readOnly?: boolean;
}) {
    const container = useRef<HTMLDivElement>(null);
    const editor = useRef<EditorView | null>(null);
    const languageConfig = useRef(new Compartment());
    const change = useRef(onChange);
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
                    keymap.of([indentWithTab]),
                    languageConfig.current.of(language === 'python' ? python() : language === 'mql4' ? cpp() : []),
                    EditorState.readOnly.of(readOnly),
                    EditorView.editable.of(!readOnly),
                    EditorView.contentAttributes.of({ 'aria-label': readOnly ? '代码预览' : '代码编辑器' }),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) change.current?.(update.state.doc.toString());
                    }),
                    EditorView.theme({
                        '&': { fontSize: '13px', backgroundColor: '#fff', minHeight: '320px' },
                        '.cm-content': {
                            fontFamily: 'JetBrains Mono, Fira Code, monospace',
                            padding: '16px 0',
                            minHeight: '320px',
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
    }, [readOnly]);
    useEffect(() => {
        const view = editor.current;
        if (!view || view.state.doc.toString() === value) return;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }, [value]);
    useEffect(() => {
        editor.current?.dispatch({
            effects: languageConfig.current.reconfigure(
                language === 'python' ? python() : language === 'mql4' ? cpp() : [],
            ),
        });
    }, [language]);
    return <div ref={container} className="overflow-hidden rounded-xl border border-slate-200 bg-white" />;
}
