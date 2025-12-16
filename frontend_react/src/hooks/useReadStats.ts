import { useEffect, useRef } from 'react';
import { reportReadDuration } from '../api/stats';

/**
 * 阅读统计 Hook
 * @param articleId 文章ID
 * @param reportInterval 上报间隔(毫秒)，默认 15秒
 */
export const useReadStats = (articleId?: string, reportInterval = 15000) => {
    // 使用 Ref 存储累积未上报的时长，防止闭包问题
    const durationRef = useRef(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const reportTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!articleId) return;

        // 1. 启动计时器 (每秒 +1)
        const startTimer = () => {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                // 只有页面可见时才累计
                if (document.visibilityState === 'visible') {
                    durationRef.current += 1;
                }
            }, 1000);
        };

        // 2. 上报逻辑 (发送后清零)
        const sendReport = () => {
            const seconds = durationRef.current;
            if (seconds > 0) {
                reportReadDuration(articleId, seconds).then(() => {
                    // 只有在上报成功（或请求发出）后扣除已上报的时长
                    // 这里为了简单，直接重置 ref (存在微小的时间差丢失，但在统计场景可接受)
                    durationRef.current = Math.max(0, durationRef.current - seconds);
                }).catch(err => {
                    console.error('上报失败，保留时长下次尝试', err);
                });
            }
        };

        // 3. 启动定时上报 (心跳)
        const startReportLoop = () => {
            if (reportTimerRef.current) clearInterval(reportTimerRef.current);
            reportTimerRef.current = setInterval(sendReport, reportInterval);
        };

        // --- 初始化 ---
        startTimer();
        startReportLoop();

        // 4. 处理页面可见性变化 (切后台停止计时，切回来继续)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                // 切走时，可以选择立即上报一次，或者只是暂停计时（这里上面的 setInterval 已经判断了 visible，所以不需要额外暂停 interval，但可以做一个立即上报）
                // 策略：切后台时不做网络请求，只是不再累加 duration
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 5. 清理函数 (组件卸载/切换文章时触发)
        return () => {
            // 清除定时器
            if (timerRef.current) clearInterval(timerRef.current);
            if (reportTimerRef.current) clearInterval(reportTimerRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);

            // 【关键】离开时强制上报剩余时长
            if (durationRef.current > 0) {
                // 这里使用 sendBeacon 会更可靠，但普通 fetch 在组件切换时通常也够用
                reportReadDuration(articleId, durationRef.current);
            }
            // 重置时长
            durationRef.current = 0;
        };
    }, [articleId, reportInterval]);
};