import {useEffect, useRef, useState} from 'react';
import {Info, Clock, Droplets, Heart, Sparkles} from 'lucide-react';

export function FarmInfoButton() {
    const [open, setOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    return (
        <div
            ref={popoverRef}
            className="relative inline-flex items-center"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <button
                type="button"
                aria-label="查看像素农场说明"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center justify-center rounded-full p-1 text-slate-400 hover:bg-orange-50 hover:text-orange-600 focus:outline-hidden transition-colors cursor-pointer"
            >
                <Info className="h-4 w-4" />
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-72 sm:w-80 max-w-[calc(100vw-2.5rem)] rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xl text-xs text-slate-600 animate-in fade-in duration-150">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-2">
                        <Info className="h-3.5 w-3.5 text-orange-500" />
                        <span>像素农场经营说明</span>
                    </div>

                    <div className="rounded-lg bg-orange-50/80 p-2 text-[11px] leading-relaxed text-orange-900 border border-orange-100 mb-2.5 font-medium">
                        现实时间成长 · 缺水或缺饲料暂停 · 动物满心50%双产、10%金色产物
                    </div>

                    <ul className="space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
                        <li className="flex items-start gap-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                            <span><strong>现实时间推移</strong>：作物与动物按现实时间自然成长，无需时刻停留页面。</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <Droplets className="h-3.5 w-3.5 shrink-0 text-blue-500 mt-0.5" />
                            <span><strong>水分与饲料</strong>：雨天全田自动浇水；缺水或缺饲料时生长暂停。</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <Heart className="h-3.5 w-3.5 shrink-0 text-rose-500 mt-0.5" />
                            <span><strong>动物好感</strong>：满心时有 50% 概率双倍产出，10% 概率收获金色稀有产物。</span>
                        </li>
                        <li className="flex items-start gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
                            <span><strong>快捷切换</strong>：支持按键盘左右方向键快速切换不同居民的农场。</span>
                        </li>
                    </ul>
                </div>
            )}
        </div>
    );
}
