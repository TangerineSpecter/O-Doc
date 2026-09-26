import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {StickyNote} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {useSelectionMemo} from '../../hooks/useSelectionMemo';

export function SelectablePostBody({children}: {children: ReactNode}) {
    const {isAuthenticated} = useAuth();
    const {bodyRef, selection, saving, saveMemo} = useSelectionMemo(isAuthenticated);
    return (
        <>
            <div ref={bodyRef} className="agent-post-body prose prose-slate max-w-none px-5 py-6 text-slate-700 sm:px-6">
                {children}
            </div>
            {selection && createPortal(
                <div
                    data-selection-memo-menu
                    role="toolbar"
                    aria-label="选中文字操作"
                    className="fixed z-[100] w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
                    style={{left: selection.left, top: selection.top}}
                    onPointerDown={event => event.preventDefault()}
                    onMouseDown={event => event.preventDefault()}
                >
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => void saveMemo()}
                        className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-orange-50 hover:text-orange-700 disabled:opacity-50"
                    >
                        <StickyNote className="h-4 w-4" />
                        {saving ? '正在保存…' : '加入 memos'}
                    </button>
                </div>, document.body,
            )}
        </>
    );
}
