import { useEffect } from 'react';
import { registerSwipeBackInterceptor, type SwipeBackInterceptor } from '../utils/swipeBackRegistry';

export interface SwipeBackOptions {
    /** 自定义优先拦截关闭的弹窗或处理函数（返回 true 表示已拦截消费，不再执行路由返回） */
    onIntercept?: SwipeBackInterceptor;
}

/**
 * 局部右滑拦截辅助 Hook
 * 用于在特定页面或子组件中注册右滑优先拦截逻辑（例如弹窗/抽屉打开时优先拦截并关闭，而非跳页）
 * 真正的全局右滑手势与视觉动效由 App 顶层的 GlobalSwipeBack 组件统一管理。
 */
export function useSwipeBack(options?: SwipeBackOptions) {
    useEffect(() => {
        if (!options?.onIntercept) return;
        return registerSwipeBackInterceptor(options.onIntercept);
    }, [options?.onIntercept]);
}

export { registerSwipeBackInterceptor, triggerSwipeBackInterceptors } from '../utils/swipeBackRegistry';
