import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Github, Info, Leaf, UserRound } from 'lucide-react';
import { getRuntimeInfo } from '@/api/setting';

const GITHUB_URL = 'https://github.com/TangerineSpecter/O-Doc';

const formatUptime = (totalSeconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(safeSeconds / 86400);
    const hours = Math.floor((safeSeconds % 86400) / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (days > 0) {
        return `${days} 天 ${hours} 小时 ${minutes} 分钟`;
    }
    if (hours > 0) {
        return `${hours} 小时 ${minutes} 分钟 ${seconds} 秒`;
    }
    if (minutes > 0) {
        return `${minutes} 分钟 ${seconds} 秒`;
    }
    return `${seconds} 秒`;
};

export const AboutSettings = () => {
    const fallbackMeasuredAt = useMemo(() => Date.now(), []);
    const [runtimeMeasuredAt, setRuntimeMeasuredAt] = useState<number>(fallbackMeasuredAt);
    const [baseUptimeSeconds, setBaseUptimeSeconds] = useState(0);
    const [uptimeSeconds, setUptimeSeconds] = useState(0);
    const [runtimeSource, setRuntimeSource] = useState<'server' | 'browser'>('browser');

    useEffect(() => {
        let cancelled = false;

        getRuntimeInfo()
            .then((runtimeInfo) => {
                if (cancelled) return;

                setRuntimeMeasuredAt(Date.now());
                setBaseUptimeSeconds(runtimeInfo.uptimeSeconds);
                setUptimeSeconds(runtimeInfo.uptimeSeconds);
                setRuntimeSource('server');
            })
            .catch((error) => {
                if (cancelled) return;
                console.warn('运行时间信息加载失败，使用本次页面打开时间:', error);
                setRuntimeSource('browser');
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setUptimeSeconds(baseUptimeSeconds + Math.floor((Date.now() - runtimeMeasuredAt) / 1000));
        }, 1000);

        return () => window.clearInterval(timer);
    }, [baseUptimeSeconds, runtimeMeasuredAt]);

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm overflow-hidden relative">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-orange-50" />
                <div className="absolute right-10 top-10 h-10 w-10 rounded-full bg-lime-50" />

                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
                            <Leaf className="h-7 w-7" />
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-orange-600">About O-Doc</p>
                            <h3 className="mt-1 text-xl font-bold text-slate-900">小橘文档</h3>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                                小橘文档是一款清爽轻量的个人文档管理系统，围绕文章写作、文集整理、资源管理、图片文集、闪念备忘与 AI 辅助能力展开，帮助你把散落的想法和资料收纳成更有秩序的知识空间。
                            </p>
                        </div>
                    </div>

                    <a
                        href={GITHUB_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
                    >
                        <Github className="h-4 w-4" />
                        GitHub
                        <ExternalLink className="h-3.5 w-3.5 text-white/70" />
                    </a>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-orange-50 p-2 text-orange-600">
                            <UserRound className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500">作者</p>
                            <h4 className="font-bold text-slate-800">丢失的橘子</h4>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                            <Info className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-slate-500">
                                {runtimeSource === 'server' ? '累计运行时间' : '运行时间加载中'}
                            </p>
                            <h4 className="font-bold text-slate-800">{formatUptime(uptimeSeconds)}</h4>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-orange-50/70 rounded-2xl border border-orange-100 p-5">
                <div className="flex items-start gap-3">
                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                    <p className="text-sm leading-6 text-orange-900/80">
                        愿它像一颗被认真剥开的橘子：入口轻快，脉络清楚，适合安放日常创作、阅读沉淀和一点点灵感火花。
                    </p>
                </div>
            </div>
        </div>
    );
};
