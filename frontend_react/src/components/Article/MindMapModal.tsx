import {BrainCircuit, X} from 'lucide-react';
import {createPortal} from 'react-dom';
import type {MindMapNode} from '@/types/api/article';

interface MindMapModalProps {
    isOpen: boolean;
    mindMap?: MindMapNode | null;
    onClose: () => void;
}

const hasChildren = (node?: MindMapNode | null) => !!node?.children?.length;

const MindMapBranch = ({node, depth = 0}: { node: MindMapNode; depth?: number }) => {
    const children = node.children || [];
    const isRoot = depth === 0;

    return (
        <div className={`flex items-center ${isRoot ? '' : 'pl-8'}`}>
            <div
                className={`
                    relative z-10 shrink-0 rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm
                    ${isRoot
                    ? 'bg-orange-500 text-white border-orange-500 shadow-orange-500/20'
                    : 'bg-white text-slate-700 border-slate-200'}
                `}
            >
                {node.title}
            </div>

            {children.length > 0 && (
                <div className="relative ml-8 flex flex-col gap-4">
                    <div className="absolute left-[-2rem] top-1/2 h-px w-8 bg-orange-200"/>
                    <div className="absolute left-0 top-6 bottom-6 w-px bg-orange-100"/>
                    {children.map((child, index) => (
                        <div key={`${child.title}-${depth}-${index}`} className="relative flex items-center">
                            <div className="absolute left-0 h-px w-8 bg-orange-100"/>
                            <MindMapBranch node={child} depth={depth + 1}/>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default function MindMapModal({isOpen, mindMap, onClose}: MindMapModalProps) {
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="关闭思维导图"/>
            <div className="relative flex h-[min(760px,88vh)] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                            <BrainCircuit className="h-5 w-5"/>
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate text-base font-bold text-slate-900">思维导图</h3>
                            {mindMap?.title && <p className="truncate text-xs text-slate-500">{mindMap.title}</p>}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="关闭"
                    >
                        <X className="h-5 w-5"/>
                    </button>
                </div>

                <div className="flex-1 overflow-auto bg-slate-50/70 p-6">
                    {mindMap && hasChildren(mindMap) ? (
                        <div className="flex min-h-full min-w-max items-center justify-center rounded-xl bg-white p-10 ring-1 ring-slate-100">
                            <MindMapBranch node={mindMap}/>
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center rounded-xl bg-white text-sm text-slate-500 ring-1 ring-slate-100">
                            暂无思维导图
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
