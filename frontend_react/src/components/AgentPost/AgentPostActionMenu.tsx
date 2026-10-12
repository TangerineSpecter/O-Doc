import {usePostPhoto} from '@/hooks/usePostPhoto';
import {useEscapeDismissal} from '@/hooks/useEscapeDismissal';
import {ImagePlus, Loader2, MoreHorizontal, Trash2} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {PostPhotoManageModal} from './PostPhotoManageModal';

interface AgentPostActionMenuProps {
    postId: string;
    onDelete: () => void;
    onPhotoChanged: () => void;
}

export function AgentPostActionMenu({
    postId,
    onDelete,
    onPhotoChanged
}: AgentPostActionMenuProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const {state, error, busy, operate} = usePostPhoto(postId, onPhotoChanged);

    const isPending = ['pending', 'generating'].includes(state.status || '');
    const isRecovering = busy || Boolean(state.recovering);
    const isPhotoBusy = isPending || isRecovering;

    const handleMouseEnter = () => {
        if (leaveTimerRef.current) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
        }
        setIsMenuOpen(true);
    };

    const handleMouseLeave = () => {
        if (leaveTimerRef.current) {
            clearTimeout(leaveTimerRef.current);
        }
        leaveTimerRef.current = setTimeout(() => {
            setIsMenuOpen(false);
        }, 180);
    };

    useEffect(() => {
        return () => {
            if (leaveTimerRef.current) {
                clearTimeout(leaveTimerRef.current);
            }
        };
    }, []);

    // 点击外部关闭下拉菜单
    useEffect(() => {
        if (!isMenuOpen) return;
        const handleOutsideClick = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [isMenuOpen]);

    // ESC 键关闭下拉菜单
    useEscapeDismissal(isMenuOpen && !isPhotoModalOpen, () => setIsMenuOpen(false));

    const handleOpenPhotoModal = () => {
        if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
        setIsMenuOpen(false);
        setIsPhotoModalOpen(true);
    };

    const handleDeleteClick = () => {
        if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
        setIsMenuOpen(false);
        onDelete();
    };

    return (
        <div
            ref={menuRef}
            className="relative inline-block text-left"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <button
                type="button"
                onClick={() => setIsMenuOpen(prev => !prev)}
                className={`relative rounded-md p-1.5 transition-colors ${
                    isMenuOpen
                        ? 'bg-slate-100 text-slate-700'
                        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                }`}
                title="更多操作"
                aria-haspopup="true"
                aria-expanded={isMenuOpen}
            >
                <MoreHorizontal className="h-4 w-4" />
                {/* 后台生图或任务进行中时展示动态状态点 */}
                {isPhotoBusy && (
                    <span
                        className="absolute -top-0.5 -right-0.5 flex h-2 w-2"
                        title="帖子配图后台处理中"
                    >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                    </span>
                )}
            </button>

            {isMenuOpen && (
                <div
                    className="absolute right-0 top-full mt-1.5 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg z-30 animate-in fade-in zoom-in-95 duration-150 before:absolute before:-top-2 before:inset-x-0 before:h-2"
                    role="menu"
                >
                    <button
                        type="button"
                        onClick={handleOpenPhotoModal}
                        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-orange-50 hover:text-orange-600"
                        role="menuitem"
                    >
                        <span className="inline-flex items-center gap-2">
                            <ImagePlus className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                            帖子配图
                        </span>
                        {isPhotoBusy && (
                            <Loader2 className="h-3 w-3 animate-spin text-orange-500 shrink-0" />
                        )}
                        {!isPhotoBusy && state.status === 'inserted' && (
                            <span className="text-[10px] text-slate-400 font-mono">已配图</span>
                        )}
                    </button>

                    <div className="my-1 border-t border-slate-100" />

                    <button
                        type="button"
                        onClick={handleDeleteClick}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                        role="menuitem"
                    >
                        <Trash2 className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        删除帖子
                    </button>
                </div>
            )}

            {/* 配图管理弹窗 */}
            <PostPhotoManageModal
                isOpen={isPhotoModalOpen}
                onClose={() => setIsPhotoModalOpen(false)}
                state={state}
                error={error}
                busy={busy}
                operate={operate}
            />
        </div>
    );
}
