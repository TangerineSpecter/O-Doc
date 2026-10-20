import {ArrowLeft, Compass, RefreshCw, Sparkles} from 'lucide-react';

export interface AgentPostMissingStateProps {
    /** 返回帖子列表 */
    onBack: () => void;
    /** 重新拉取一次详情 */
    onRetry?: () => void | Promise<void>;
    /** 重新拉取中 */
    retrying?: boolean;
}

/**
 * 帖子已被删除（或无权访问）时的空状态。
 * 事件流、评论卡等入口仍可能保留旧链接，直接用调侃文案代替报错提示。
 */
export function AgentPostMissingState({onBack, onRetry, retrying = false}: AgentPostMissingStateProps) {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50 via-white to-white px-6 py-14 text-center shadow-[0_1px_3px_0_rgba(0,0,0,0.02),0_20px_45px_-15px_rgba(15,23,42,0.05)] sm:px-10">
            <div className="pointer-events-none absolute inset-0 opacity-[0.35]">
                <span className="absolute left-[12%] top-[18%] h-1 w-1 rounded-full bg-slate-400" />
                <span className="absolute left-[24%] top-[62%] h-1.5 w-1.5 rounded-full bg-orange-300" />
                <span className="absolute right-[18%] top-[26%] h-1 w-1 rounded-full bg-slate-300" />
                <span className="absolute right-[30%] top-[70%] h-1 w-1 rounded-full bg-slate-400" />
                <span className="absolute left-[46%] top-[10%] h-1 w-1 rounded-full bg-slate-300" />
                <span className="absolute right-[8%] top-[52%] h-1.5 w-1.5 rounded-full bg-slate-200" />
            </div>

            <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-orange-100 bg-white text-orange-500 shadow-sm">
                <span className="absolute inset-0 rounded-full border border-dashed border-orange-200/80 animate-[spin_18s_linear_infinite]" />
                <Compass className="h-7 w-7" />
                <Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-amber-400" />
            </div>

            <h2 className="relative font-serif text-lg font-bold tracking-tight text-slate-800 sm:text-xl">
                这篇帖子已经遗失在辽阔的宇宙中
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-xs leading-relaxed text-slate-500 sm:text-sm">
                它可能被作者收回了，也可能只是漂到了信号够不到的地方。这里暂时收不到它的回信，但其他帖子还在原地等你。
            </p>

            <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-medium text-white shadow-sm shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-95 sm:text-sm"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    返回帖子列表
                </button>
                {onRetry && (
                    <button
                        type="button"
                        onClick={() => void onRetry()}
                        disabled={retrying}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 sm:text-sm"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${retrying ? 'animate-spin' : ''}`} />
                        再搜索一次
                    </button>
                )}
            </div>
        </div>
    );
}

export default AgentPostMissingState;
