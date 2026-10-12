import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

interface ScrollDirectionOptions {
    /** 触发隐藏/显示的最小滚动位移累计差值（像素），防止手指轻微触摸抖动 */
    threshold?: number;
    /** 视为位于顶部的距离阈值（像素），在此范围内强制保持显示 */
    topOffset?: number;
    /** 是否启用滚动收起。若为 false 则始终保持可见并不注册滚动监听，仅在阅读正文时启用 */
    enabled?: boolean;
}

/**
 * 移动端/全屏沉浸阅读专用的滚动方向检测 Hook。
 * - 仅在 enabled 为 true（如具体的文章/帖子详情页）时激活
 * - 向下滚动浏览正文时返回 false（收起顶底栏）
 * - 向上滚动微调或到达顶部时返回 true（展开顶底栏）
 * - 路由切换时自动重置为 true
 */
export function useScrollDirection(options: ScrollDirectionOptions = {}) {
    const { threshold = 12, topOffset = 24, enabled = true } = options;
    const [isVisible, setIsVisible] = useState(true);
    const lastScrollY = useRef(0);
    const accumulatedDiff = useRef(0);
    const isVisibleRef = useRef(true);
    const rafId = useRef<number | null>(null);
    const location = useLocation();

    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    // 禁用时或路由切换时，强制重置为显示状态并清空滚动累加值
    useEffect(() => {
        setIsVisible(true);
        isVisibleRef.current = true;
        lastScrollY.current = 0;
        accumulatedDiff.current = 0;
    }, [location.pathname, location.search, enabled]);

    useEffect(() => {
        // 当未启用时（非文章详情阅读页），不注册任何滚动监听器
        if (!enabled) {
            return;
        }

        const handleScroll = (event: Event) => {
            // 双重防护：若当前状态已被禁用，直接忽略
            if (!enabledRef.current) {
                return;
            }

            const target = event.target;
            let currentScrollY = 0;

            if (
                target === document ||
                target === window ||
                target === document.documentElement ||
                target === document.body
            ) {
                currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
            } else if (target instanceof HTMLElement) {
                // 忽略带锁定的模态弹窗或下拉浮层内部的局部滚动
                if (target.closest('[data-modal-scroll-lock]')) {
                    return;
                }
                currentScrollY = target.scrollTop;
            } else {
                return;
            }

            if (rafId.current !== null) {
                cancelAnimationFrame(rafId.current);
            }

            rafId.current = requestAnimationFrame(() => {
                if (!enabledRef.current) {
                    return;
                }

                // 1. 处于页面顶部或 iOS 弹性向上拉扯（Rubber-band 负值）时强制显示
                if (currentScrollY <= topOffset) {
                    if (!isVisibleRef.current) {
                        isVisibleRef.current = true;
                        setIsVisible(true);
                    }
                    accumulatedDiff.current = 0;
                    lastScrollY.current = Math.max(0, currentScrollY);
                    return;
                }

                // 首次滚动记录基准值，避免从 0 突变导致虚假位移差
                if (lastScrollY.current === 0) {
                    lastScrollY.current = currentScrollY;
                    return;
                }

                const diff = currentScrollY - lastScrollY.current;

                // 2. 向下滚动（阅读正文）
                if (diff > 0) {
                    // 若之前是向上滚动的负数累计，先清零以重新统计当前方向的累积量
                    if (accumulatedDiff.current < 0) {
                        accumulatedDiff.current = 0;
                    }
                    accumulatedDiff.current += diff;

                    if (accumulatedDiff.current >= threshold && isVisibleRef.current) {
                        isVisibleRef.current = false;
                        setIsVisible(false);
                        accumulatedDiff.current = 0;
                    }
                }
                // 3. 向上滚动（回看上文或准备操作）
                else if (diff < 0) {
                    // 若之前是向下滚动的正数累计，先清零
                    if (accumulatedDiff.current > 0) {
                        accumulatedDiff.current = 0;
                    }
                    accumulatedDiff.current += diff;

                    if (accumulatedDiff.current <= -threshold && !isVisibleRef.current) {
                        isVisibleRef.current = true;
                        setIsVisible(true);
                        accumulatedDiff.current = 0;
                    }
                }

                lastScrollY.current = currentScrollY;
            });
        };

        // 在捕获阶段监听滚动，确保 window 与内部 overflow 容器均可捕获
        window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll, { capture: true });
            if (rafId.current !== null) {
                cancelAnimationFrame(rafId.current);
            }
        };
    }, [enabled, threshold, topOffset]);

    return isVisible;
}

export default useScrollDirection;
