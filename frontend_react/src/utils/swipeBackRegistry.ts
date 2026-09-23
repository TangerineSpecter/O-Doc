/**
 * 全局右滑返回拦截器管理机制
 * 允许浮层（AI 对话窗、智能体联系人、搜索弹窗、自定义模态框等）注册优先拦截回调。
 * 拦截函数返回 true 表示已消费右滑事件（例如关闭了浮层），不再继续执行路由后退。
 */

export type SwipeBackInterceptor = () => boolean;

const interceptors: SwipeBackInterceptor[] = [];

/**
 * 注册一个右滑返回拦截器
 * @param fn 拦截回调，返回 true 表示消费该事件
 * @returns 取消注册的清理函数
 */
export function registerSwipeBackInterceptor(fn: SwipeBackInterceptor): () => void {
    interceptors.push(fn);
    return () => {
        const index = interceptors.lastIndexOf(fn);
        if (index !== -1) {
            interceptors.splice(index, 1);
        }
    };
}

/**
 * 执行已注册的拦截器（后注册的优先执行，类似栈）
 * @returns true 表示已有拦截器消费了右滑动作
 */
export function triggerSwipeBackInterceptors(): boolean {
    for (let i = interceptors.length - 1; i >= 0; i--) {
        try {
            if (interceptors[i]()) {
                return true;
            }
        } catch (error) {
            console.error('Error executing swipe back interceptor:', error);
        }
    }
    return false;
}
