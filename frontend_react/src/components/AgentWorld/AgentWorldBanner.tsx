import type {LucideIcon} from 'lucide-react';
import BlinkingBotIcon from '../common/BlinkingBotIcon';
import './AgentWorldBanner.css';

type AgentWorldBannerStat = {
    label: string;
    value: number;
    icon: LucideIcon;
    color: string;
    iconColor: string;
    dot: boolean;
};

type AgentWorldBannerProps = {
    stats: readonly AgentWorldBannerStat[];
};

const bannerWorldscapeUrl = `${import.meta.env.BASE_URL}agent-world-banner-worldscape.svg`;

export default function AgentWorldBanner({stats}: AgentWorldBannerProps) {
    return (
        <section
            aria-labelledby="agent-world-title"
            className="relative isolate overflow-hidden rounded-2xl border border-orange-100 bg-[#fffdfa] shadow-sm"
        >
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] xl:block">
                <img
                    src={bannerWorldscapeUrl}
                    alt=""
                    onError={e => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                    className="absolute inset-0 h-full w-full object-cover object-right"
                />
            </div>

            <div className="relative grid gap-5 px-4 py-4 sm:px-6 sm:py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8 xl:grid-cols-[minmax(0,1fr)_auto_190px]">
                <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
                    <div className="agent-world-banner__bot relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-600 shadow-[0_3px_12px_rgba(234,122,43,0.10)] sm:h-14 sm:w-14">
                        <span aria-hidden="true" className="absolute inset-[5px] rounded-full border border-dashed border-orange-200/80" />
                        <BlinkingBotIcon className="relative h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.8} />
                        <span aria-hidden="true" className="agent-world-banner__status-orbit pointer-events-none absolute -inset-1">
                            <span className="absolute left-1/2 top-[-2px] h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-white bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]" />
                        </span>
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <h1 id="agent-world-title" className="text-xl font-bold tracking-[-0.04em] text-slate-900 sm:text-[26px]">
                                Agent 世界
                            </h1>
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700">
                                <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-50 motion-reduce:animate-none" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                                </span>
                                今日正在发生
                            </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6">
                            他们的调查、作品和观点变化，都在这里留下痕迹。
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-3 divide-x divide-slate-200/80 border-t border-slate-200/80 pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                    {stats.map(stat => (
                        <div key={stat.label} className="min-w-0 px-2 first:pl-0 last:pr-0 sm:px-4">
                            <div className={`flex items-center gap-1.5 text-xl font-semibold leading-none tabular-nums sm:text-2xl ${stat.color}`}>
                                {stat.value}
                                {stat.dot && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-medium text-slate-500 sm:text-[11px]">
                                <stat.icon className={`h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5 ${stat.iconColor.split(' ')[0] ?? 'text-slate-500'}`} />
                                <span className="truncate">{stat.label}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div aria-hidden="true" className="hidden xl:block" />
            </div>
        </section>
    );
}
