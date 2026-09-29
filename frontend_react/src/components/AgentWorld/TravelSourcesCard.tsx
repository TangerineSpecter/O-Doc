import {Globe, ExternalLink} from 'lucide-react';

interface TravelSourcesCardProps {
    sources?: {
        title: string;
        url: string;
    }[];
}

export default function TravelSourcesCard({sources}: TravelSourcesCardProps) {
    if (!sources || sources.length === 0) return null;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <Globe className="h-4 w-4" />
                    </span>
                    <h4 className="text-xs font-bold text-slate-800">地点资料与参考来源</h4>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-500">
                    共 {sources.length} 条
                </span>
            </div>

            <div className="mt-3 space-y-1.5">
                {sources.map((source, idx) => (
                    <a
                        key={source.url || idx}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center justify-between gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs text-slate-600 transition-all hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-700"
                    >
                        <span className="truncate flex-1 font-medium group-hover:underline">
                            {source.title || source.url}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-orange-600 transition-colors" />
                    </a>
                ))}
            </div>
        </div>
    );
}
