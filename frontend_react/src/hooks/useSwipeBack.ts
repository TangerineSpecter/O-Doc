import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface SwipeBackOptions {
    /** 边缘起手最大横坐标（默认 80px） */
    edgeThreshold?: number;
    /** 最小触发水平滑动距离（默认 60px） */
    minSwipeDistance?: number;
    /** 4 个 Tab 页面路径（默认 ['/memos', '/prompts', '/resources', '/stats']） */
    tabPaths?: string[];
    /** 自定义优先拦截关闭的弹窗或处理函数（返回 true 表示已拦截消费，不再执行路由返回） */
    onIntercept?: () => boolean;
}

const DEFAULT_TAB_PATHS = ['/memos', '/prompts', '/resources', '/stats'];

/**
 * 移动端右滑返回交互 Hook
 * - 在 4 个核心 Tab 页面（闪念、提示词库、资源库、数据统计）时，右滑直接返回首页 ('/')
 * - 在其他子页面（文章、文集、标签、分类、设置等）时，右滑返回上一页 (navigate(-1))
 * - 在首页时忽略右滑
 * - 支持起手边缘判定（防止内容区如热力图、标签横滑误触）与垂直滚动防冲突
 */
export function useSwipeBack(options?: SwipeBackOptions) {
    const location = useLocation();
    const navigate = useNavigate();

    const edgeThreshold = options?.edgeThreshold ?? (typeof window !== 'undefined' ? Math.max(80, Math.min(window.innerWidth * 0.25, 120)) : 80);
    const minSwipeDistance = options?.minSwipeDistance ?? 55;
    const tabPaths = options?.tabPaths ?? DEFAULT_TAB_PATHS;
    const onInterceptRef = useRef(options?.onIntercept);

    // 保持 ref 最新，避免频繁解绑事件
    useEffect(() => {
        onInterceptRef.current = options?.onIntercept;
    }, [options?.onIntercept]);

    const touchStartRef = useRef<{ x: number; y: number; time: number; valid: boolean } | null>(null);

    useEffect(() => {
        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) {
                touchStartRef.current = null;
                return;
            }

            const touch = e.touches[0];
            const startX = touch.clientX;
            const startY = touch.clientY;

            // 检查起手元素：如果是表单输入框、白板 canvas 等，则忽略
            const target = e.target as HTMLElement | null;
            if (target) {
                const tagName = target.tagName.toUpperCase();
                if (
                    tagName === 'INPUT' ||
                    tagName === 'TEXTAREA' ||
                    tagName === 'SELECT' ||
                    tagName === 'CANVAS' ||
                    target.isContentEditable ||
                    Boolean(target.closest('[data-disable-swipe-back="true"]'))
                ) {
                    touchStartRef.current = null;
                    return;
                }
            }

            // 边缘判定：必须靠近左侧边缘（<= edgeThreshold）起手，杜绝内容区滑动误触
            if (startX > edgeThreshold) {
                touchStartRef.current = null;
                return;
            }

            touchStartRef.current = {
                x: startX,
                y: startY,
                time: Date.now(),
                valid: true,
            };
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!touchStartRef.current || !touchStartRef.current.valid) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - touchStartRef.current.x;
            const deltaY = touch.clientY - touchStartRef.current.y;

            // 如果垂直位移明显大于水平位移，说明是页面正常的纵向上下滚动，取消返回手势
            if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 20) {
                touchStartRef.current.valid = false;
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (!touchStartRef.current || !touchStartRef.current.valid) {
                touchStartRef.current = null;
                return;
            }

            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - touchStartRef.current.x;
            const deltaY = touch.clientY - touchStartRef.current.y;
            const duration = Date.now() - touchStartRef.current.time;

            touchStartRef.current = null;

            // 判定有效右滑：向右滑动超过阈值、水平位移大于垂直位移、滑动耗时在合理范围（非长时间长按）
            if (
                deltaX >= minSwipeDistance &&
                deltaX > Math.abs(deltaY) * 1.2 &&
                duration < 650
            ) {
                // 如果有浮层优先被关闭（如 AI 对话窗口）
                if (onInterceptRef.current && onInterceptRef.current()) {
                    return;
                }

                const pathname = location.pathname;

                // 如果已经在首页，不需要返回
                if (pathname === '/' || pathname === '/home') {
                    return;
                }

                // 轻微触觉反馈
                if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                    try {
                        navigator.vibrate(10);
                    } catch {
                        // ignore
                    }
                }

                // 如果是 4 个 Tab 内容页之一，返回则回到首页
                const isTab = tabPaths.some(
                    (p) => pathname === p || pathname.startsWith(`${p}/`)
                );

                if (isTab) {
                    navigate('/');
                } else {
                    // 其他页面返回上一页
                    navigate(-1);
                }
            }
        };

        const handleTouchCancel = () => {
            touchStartRef.current = null;
        };

        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        window.addEventListener('touchcancel', handleTouchCancel);

        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
            window.removeEventListener('touchcancel', handleTouchCancel);
        };
    }, [location.pathname, navigate, edgeThreshold, minSwipeDistance, tabPaths]);
}
