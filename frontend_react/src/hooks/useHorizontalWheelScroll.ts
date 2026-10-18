import { useEffect, useRef } from 'react';

/**
 * 监听横向滚动容器上的鼠标滚轮事件，将垂直滚轮滚动（deltaY）映射为横向滚动（scrollLeft）。
 * 专为 Windows 鼠标普通单滚轮优化，同时保持 Mac 触控板双指横滑原生手感，并在滚到左右尽头时放行整页纵向滚动。
 */
export function useHorizontalWheelScroll<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const handleWheel = (event: WheelEvent) => {
            // 如果容器本身没有发生横向溢出，直接放行
            if (el.scrollWidth <= el.clientWidth) {
                return;
            }

            // 如果输入源自带显著的横向位移（如 Mac 触控板横滑、水平滚轮等），放行浏览器原生平滑处理
            if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
                return;
            }

            // 规范化 delta 增量
            let delta = event.deltaY;
            if (event.deltaMode === 1) {
                // DOM_DELTA_LINE 按行
                delta *= 20;
            } else if (event.deltaMode === 2) {
                // DOM_DELTA_PAGE 按页
                delta *= el.clientWidth;
            }

            const isScrollingRight = delta > 0;
            const maxScrollLeft = el.scrollWidth - el.clientWidth;
            const canScrollRight = el.scrollLeft < maxScrollLeft - 1;
            const canScrollLeft = el.scrollLeft > 1;

            // 只有当容器在滚动方向上仍有可滚动空间时拦截纵向滚动；
            // 触达最左或最右边界时放行，使整个页面可以顺畅上下翻滚
            if ((isScrollingRight && canScrollRight) || (!isScrollingRight && canScrollLeft)) {
                event.preventDefault();
                el.scrollLeft += delta;
            }
        };

        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            el.removeEventListener('wheel', handleWheel);
        };
    }, []);

    return ref;
}

export default useHorizontalWheelScroll;
