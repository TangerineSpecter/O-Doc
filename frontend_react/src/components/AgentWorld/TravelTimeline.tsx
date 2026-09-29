import {Landmark, Sparkles, Utensils, ShoppingBag, MapPin, Zap} from 'lucide-react';
import type {TravelJourney} from '../../types/api/travel';

interface TravelTimelineProps {
    snapshot: TravelJourney['snapshot'];
}

export default function TravelTimeline({snapshot}: TravelTimelineProps) {
    const visits = snapshot.visits || [];
    const encounters = snapshot.encounters || [];
    const food = snapshot.food;
    const shopping = snapshot.shopping;

    const totalNodes = visits.length + encounters.length + (food ? 1 : 0) + (shopping ? 1 : 0);

    if (totalNodes === 0) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs">
                <MapPin className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-xs text-slate-400">旅途尚未展开具体足迹，敬请期待旅者探索…</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                        <Landmark className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-bold text-slate-800">游历足迹与见闻</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                    共 {totalNodes} 个印记节点
                </span>
            </div>

            {/* 纵向时光流 */}
            <div className="relative space-y-6 pl-6 before:absolute before:bottom-3 before:left-2.5 before:top-3 before:w-0.5 before:bg-slate-200">
                {/* 1. 景点游览 */}
                {visits.map((visit, idx) => (
                    <div key={`visit-${idx}`} className="relative group">
                        {/* 时间线徽标节点 */}
                        <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-orange-500 bg-white text-orange-500 shadow-2xs ring-4 ring-white">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                        </div>

                        {/* 卡片正文 */}
                        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 transition-all hover:border-orange-200/80 hover:bg-white hover:shadow-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Landmark className="h-4 w-4 text-orange-500 shrink-0" />
                                    <h4 className="text-sm font-bold text-slate-800">
                                        {visit.site.name}
                                    </h4>
                                </div>
                                <span className="rounded-full border border-orange-200/60 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                                    {visit.choice || '游览体验'}
                                </span>
                            </div>

                            {visit.reaction && (
                                <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
                                    {visit.reaction}
                                </p>
                            )}
                        </div>
                    </div>
                ))}

                {/* 2. 旅途遭遇/奇遇 */}
                {encounters.map((event, idx) => (
                    <div key={`encounter-${idx}`} className="relative group">
                        <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-indigo-500 bg-white text-indigo-500 shadow-2xs ring-4 ring-white">
                            <Zap className="h-3 w-3 fill-indigo-500" />
                        </div>

                        <div className="rounded-xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/30 via-white to-slate-50/50 p-4 transition-all hover:border-indigo-200 hover:shadow-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-800">
                                    <Sparkles className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                    坎坷遭遇与奇闻
                                </span>
                                <span className="rounded-full border border-indigo-200/60 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                                    应对：{event.choice}
                                </span>
                            </div>

                            <p className="mt-2 text-xs font-medium text-slate-800">
                                {event.description}
                            </p>

                            {event.reaction && (
                                <div className="mt-2 rounded-lg bg-indigo-50/40 p-2.5 border border-indigo-100/50 text-xs leading-relaxed text-slate-600">
                                    {event.reaction}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* 3. 当地美食 */}
                {food && (
                    <div className="relative group">
                        <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-amber-500 bg-white text-amber-500 shadow-2xs ring-4 ring-white">
                            <Utensils className="h-3 w-3" />
                        </div>

                        <div className="rounded-xl border border-amber-100/80 bg-amber-50/30 p-4 transition-all hover:border-amber-200 hover:bg-white hover:shadow-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-amber-800">
                                    <Utensils className="h-4 w-4 text-amber-600 shrink-0" />
                                    <h4 className="text-sm font-bold">当地舌尖寻味</h4>
                                </div>
                                <span className="rounded-full border border-amber-200/60 bg-amber-100/50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                    品尝：{food.choice}
                                </span>
                            </div>

                            {food.reaction && (
                                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                                    {food.reaction}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* 4. 纪念品挑选过程 */}
                {shopping && (
                    <div className="relative group">
                        <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-emerald-500 bg-white text-emerald-500 shadow-2xs ring-4 ring-white">
                            <ShoppingBag className="h-3 w-3" />
                        </div>

                        <div className="rounded-xl border border-emerald-100/80 bg-emerald-50/20 p-4 transition-all hover:border-emerald-200 hover:bg-white hover:shadow-xs">
                            <div className="flex items-center gap-1.5 text-emerald-800">
                                <ShoppingBag className="h-4 w-4 text-emerald-600 shrink-0" />
                                <h4 className="text-sm font-bold">纪念品淘趣</h4>
                            </div>

                            {shopping.reason && (
                                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                                    {shopping.reason}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
