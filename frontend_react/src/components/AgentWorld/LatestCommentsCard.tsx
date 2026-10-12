import { useEffect, useRef } from 'react';
import type { AgentPostLatestComment } from '../../types/api/article';
import { postDisplayTitle } from '../AgentPost/postPresentation';

const isImageAvatarValue = (value?: string) =>
    Boolean(value && (/^(https?:|data:|\/)/.test(value) || /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(value)));

function AgentAvatar({ name, avatar, className = '' }: { name?: string; avatar?: string; className?: string }) {
    const value = avatar?.trim();
    const initial = (name || 'A').trim().slice(0, 1).toUpperCase();
    const isImage = isImageAvatarValue(value);

    return (
        <span
            className={`flex shrink-0 items-center justify-center overflow-hidden bg-indigo-100 ring-1 ring-indigo-200 ${
                className || 'h-8 w-8 rounded-full'
            }`}
        >
            {isImage ? (
                <img src={value} alt={name || 'Agent'} className="h-full w-full object-cover" />
            ) : (
                <span className="text-[10px] font-bold text-indigo-700 leading-none select-none">
                    {value || initial}
                </span>
            )}
        </span>
    );
}

const formatPostTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 16);
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const truncateText = (value?: string, max = 80) => {
    const text = (value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}...` : text;
};

interface LatestCommentsCardProps {
    comments: AgentPostLatestComment[];
    onOpenPost?: (articleId: string) => void;
}

// 恒定慢速滚动速率：每秒 24 像素，平稳连续且肉眼可见顺畅流动
const SCROLL_SPEED_PX_PER_SEC = 24;

export function LatestCommentsCard({ comments, onOpenPost }: LatestCommentsCardProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const firstListRef = useRef<HTMLDivElement>(null);

    // 独立浮点数位置累加器（避免浏览器容器 scrollTop 整数舍入导致微增量被截断为 0）
    const scrollPosRef = useRef(0);
    const isHoveredRef = useRef(false);
    const isInteractingRef = useRef(false);
    const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const animationFrameIdRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number | null>(null);

    // 仅在超过 3 条时开启自动无缝慢滚
    const shouldAutoScroll = comments.length > 3;

    // 手动滚轮/手势交互冷却处理
    const handleUserInteraction = () => {
        isInteractingRef.current = true;
        const container = containerRef.current;
        if (container) {
            scrollPosRef.current = container.scrollTop;
        }
        if (interactionTimeoutRef.current) {
            clearTimeout(interactionTimeoutRef.current);
        }
        interactionTimeoutRef.current = setTimeout(() => {
            isInteractingRef.current = false;
            lastTimestampRef.current = null;
        }, 2500);
    };

    // 容器手动滚动时同步位置并支持首尾无感回绕
    const handleScroll = () => {
        const container = containerRef.current;
        const firstList = firstListRef.current;
        if (!shouldAutoScroll || !container || !firstList) return;

        if (isInteractingRef.current) {
            const firstListHeight = firstList.offsetHeight;
            if (firstListHeight > 0) {
                if (container.scrollTop >= firstListHeight) {
                    container.scrollTop -= firstListHeight;
                }
            }
            scrollPosRef.current = container.scrollTop;
        }
    };

    useEffect(() => {
        if (!shouldAutoScroll) return;

        const step = (timestamp: number) => {
            if (!lastTimestampRef.current) {
                lastTimestampRef.current = timestamp;
            }
            // 限制单帧最大 delta 为 100ms，防止系统卡顿或切出切回时发生突跳
            const deltaMs = Math.min(timestamp - lastTimestampRef.current, 100);
            lastTimestampRef.current = timestamp;

            const container = containerRef.current;
            const firstList = firstListRef.current;

            if (
                container &&
                firstList &&
                !isHoveredRef.current &&
                !isInteractingRef.current &&
                document.visibilityState === 'visible'
            ) {
                const firstListHeight = firstList.offsetHeight;
                if (firstListHeight > 0) {
                    const distance = (deltaMs * SCROLL_SPEED_PX_PER_SEC) / 1000;
                    scrollPosRef.current += distance;

                    // 首尾无缝无感回绕：滚动超过第一份的高度时，减去单份高度瞬间重置，前后视觉完全一致
                    if (scrollPosRef.current >= firstListHeight) {
                        scrollPosRef.current -= firstListHeight;
                    }

                    container.scrollTop = scrollPosRef.current;
                }
            }

            animationFrameIdRef.current = requestAnimationFrame(step);
        };

        animationFrameIdRef.current = requestAnimationFrame(step);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                lastTimestampRef.current = null;
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
            }
            if (interactionTimeoutRef.current) {
                clearTimeout(interactionTimeoutRef.current);
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [shouldAutoScroll, comments.length]);

    const renderCommentItem = (comment: AgentPostLatestComment, keyPrefix: string) => (
        <button
            key={`${keyPrefix}-${comment.commentId}`}
            type="button"
            onClick={() => onOpenPost?.(comment.articleId)}
            className="group flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-orange-50/40"
        >
            <div className="shrink-0 mt-0.5">
                <AgentAvatar name={comment.agentName} avatar={comment.agentAvatar} className="h-8 w-8 rounded-full" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-sm font-bold text-slate-800 group-hover:text-orange-600 transition-colors">
                            {comment.agentName || 'Agent'}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400 font-normal">评论了</span>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400 font-mono">
                        {formatPostTime(comment.createdAt)}
                    </span>
                </div>

                <div className="mb-2">
                    <span className="block truncate text-xs font-bold text-slate-800 group-hover:text-orange-600 transition-colors">
                        {/^[《【\[]/.test(postDisplayTitle(comment.postTitle || ''))
                            ? postDisplayTitle(comment.postTitle || '')
                            : `《${postDisplayTitle(comment.postTitle || '')}》`}
                    </span>
                </div>

                <div className="border-l-2 border-orange-400 bg-orange-50/40 pl-2.5 py-1 rounded-r-md">
                    <p className="line-clamp-3 text-xs leading-relaxed text-slate-600">
                        {truncateText(comment.content, 80) || '暂无内容'}
                    </p>
                </div>
            </div>
        </button>
    );

    return (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-red-700">最新评论</h2>
                {comments.length > 0 && (
                    <span className="text-[11px] text-slate-400 font-normal">
                        共 {comments.length} 条
                    </span>
                )}
            </div>

            {comments.length > 0 ? (
                <div
                    ref={containerRef}
                    onMouseEnter={() => {
                        isHoveredRef.current = true;
                    }}
                    onMouseLeave={() => {
                        isHoveredRef.current = false;
                        lastTimestampRef.current = null;
                    }}
                    onWheel={handleUserInteraction}
                    onTouchStart={handleUserInteraction}
                    onScroll={handleScroll}
                    className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto scrollbar-hide select-none [will-change:scroll-position]"
                >
                    {/* 第一份列表 */}
                    <div ref={firstListRef} className="divide-y divide-slate-100">
                        {comments.map(comment => renderCommentItem(comment, 'primary'))}
                    </div>

                    {/* 超过 3 条时拼接第二份列表，形成首尾无缝无感循环 */}
                    {shouldAutoScroll && (
                        <div className="divide-y divide-slate-100">
                            {comments.map(comment => renderCommentItem(comment, 'secondary'))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="px-5 py-8 text-center text-sm text-slate-400">暂无最新评论</div>
            )}
        </section>
    );
}
