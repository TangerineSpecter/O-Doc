import type {LucideIcon} from 'lucide-react';
import BlinkingBotIcon from '../common/BlinkingBotIcon';
import SocialTheatreBannerTicker from './SocialTheatreBannerTicker';
import type {SocialTheatreEvent} from '../../types/api/social';
import './AgentWorldBanner.css';

type AgentWorldBannerStat = {
    label: string;
    value: number;
    icon: LucideIcon;
    color: string;
    iconColor: string;
    dot: boolean;
    onClick?: () => void;
};

type AgentWorldBannerProps = {
    stats: readonly AgentWorldBannerStat[];
    theatreEvent?: SocialTheatreEvent | null;
    onOpenTheatre?: (eventId?: string) => void;
};

const bannerWorldscapeUrl = `${import.meta.env.BASE_URL}agent-world-banner-worldscape.svg`;

export default function AgentWorldBanner({stats, theatreEvent, onOpenTheatre}: AgentWorldBannerProps) {
    return (
        <section
            aria-labelledby="agent-world-title"
            className="relative isolate overflow-hidden rounded-2xl border border-orange-100 bg-[#fffdfa] px-3 py-2.5 shadow-2xs sm:px-5 sm:py-3"
        >
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[45%] lg:block opacity-40">
                <img
                    src={bannerWorldscapeUrl}
                    alt=""
                    onError={e => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                    className="absolute inset-0 h-full w-full object-cover object-right"
                />
            </div>

            <div className="relative flex items-center justify-between gap-2.5 sm:gap-6">
                {/* 左侧：微型机器人头像 + 标题 */}
                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    <div className="agent-world-banner__bot relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-600 shadow-2xs sm:h-9 sm:w-9">
                        <span aria-hidden="true" className="absolute inset-[2.5px] rounded-full border border-dashed border-orange-200/80 sm:inset-[3.5px]" />
                        <BlinkingBotIcon className="relative h-3.5 w-3.5 sm:h-4.5 sm:w-4.5" strokeWidth={1.8} />
                        <span aria-hidden="true" className="agent-world-banner__status-orbit pointer-events-none absolute -inset-0.5">
                            <span className="absolute left-1/2 top-[-1px] h-1.5 w-1.5 -translate-x-1/2 rounded-full border border-white bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.18)]" />
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2.5">
                        <h1 id="agent-world-title" className="text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap sm:text-base">
                            Agent 世界
                        </h1>
                        <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-50 motion-reduce:animate-none" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
                            </span>
                            今日正在发生
                        </span>
                        <span className="sm:hidden relative flex h-2 w-2 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-50 motion-reduce:animate-none" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                        </span>
                    </div>
                </div>

                {/* 中间：小剧场即时单行胶囊 (截图 1 红框位置，在 >= md 屏幕单行嵌入显示) */}
                {theatreEvent && onOpenTheatre && (
                    <div className="hidden min-w-0 flex-1 md:flex items-center justify-start max-w-xl mx-2">
                        <SocialTheatreBannerTicker
                            event={theatreEvent}
                            onOpenTheatre={onOpenTheatre}
                        />
                    </div>
                )}

                {/* 右侧：统计指标纯单行水平并排 */}
                <div className="flex shrink-0 items-center gap-1.5 divide-x divide-slate-100 sm:gap-3 sm:divide-slate-200/80">
                    {stats.map(stat => {
                        const content = (
                            <div className="flex items-center gap-1 pl-1.5 first:pl-0 sm:gap-1.5 sm:pl-3">
                                <stat.icon className={`h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5 ${stat.iconColor.split(' ')[0] ?? 'text-slate-400'}`} />
                                <span className={`text-xs sm:text-sm font-bold tabular-nums leading-none ${stat.color} ${stat.onClick ? 'transition-colors group-hover/stat:text-orange-600' : ''}`}>
                                    {stat.value}
                                </span>
                                <span className="text-[10px] text-slate-500 whitespace-nowrap sm:text-xs transition-colors group-hover/stat:text-orange-600">
                                    <span className="hidden sm:inline">{stat.label}</span>
                                    <span className="sm:hidden">{stat.label.replace('今日', '')}</span>
                                </span>
                                {stat.dot && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />}
                            </div>
                        );

                        if (stat.onClick) {
                            return (
                                <button
                                    key={stat.label}
                                    type="button"
                                    onClick={stat.onClick}
                                    title={`点击查看${stat.label}`}
                                    className="group/stat min-w-0 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 cursor-pointer"
                                >
                                    {content}
                                </button>
                            );
                        }

                        return (
                            <div key={stat.label} className="min-w-0">
                                {content}
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
