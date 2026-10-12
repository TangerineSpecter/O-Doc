import {useState} from 'react';
import {Check, Clipboard, MessageSquareText} from 'lucide-react';
import {useTokenRequestContent} from '../../hooks/useTokenUsage';

type ContentTab = 'request' | 'response';

export default function TokenRequestContent({id}: {id: string}) {
    const {result, loading, error} = useTokenRequestContent(id);
    const [tab, setTab] = useState<ContentTab>('request');
    const [copied, setCopied] = useState(false);
    const content = tab === 'request' ? result?.request : result?.response;
    const formatted = content === undefined ? '' : JSON.stringify(content, null, 2);

    const copyContent = async () => {
        if (!formatted) return;
        try {
            await navigator.clipboard.writeText(formatted);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    return (
        <section className="mt-3 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                    <MessageSquareText className="h-3.5 w-3.5 text-orange-500" />
                    请求内容
                    <span className="font-normal text-slate-400">本机 JSON · 保留 30 天</span>
                </div>
                {result?.status && (
                    <span className="text-[10px] text-slate-400">
                        {result.status === 'success' ? '已完成' : result.status === 'failed' ? `失败${result.errorType ? ` · ${result.errorType}` : ''}` : '未完成'}
                    </span>
                )}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="请求输入或输出">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'request'}
                        onClick={() => setTab('request')}
                        className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${tab === 'request' ? 'bg-white text-orange-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        输入 Prompt
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'response'}
                        onClick={() => setTab('response')}
                        className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${tab === 'response' ? 'bg-white text-orange-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        模型输出
                    </button>
                </div>
                <button
                    type="button"
                    onClick={copyContent}
                    disabled={!formatted || loading}
                    className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-white hover:text-orange-700 disabled:opacity-40"
                >
                    {copied ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
                    {copied ? '已复制' : '复制内容'}
                </button>
            </div>

            {loading ? (
                <div className="mt-2 rounded-lg bg-white/80 p-4 text-center text-xs text-slate-400">正在读取请求内容…</div>
            ) : error ? (
                <div className="mt-2 rounded-lg border border-red-100 bg-white/80 p-3 text-xs text-red-600">{error}</div>
            ) : result && !result.available ? (
                <div className="mt-2 rounded-lg bg-white/80 p-3 text-xs leading-relaxed text-slate-500">
                    {result.message || '这条请求没有可查看的内容记录。'}
                </div>
            ) : (
                <pre className="scrollbar-hide mt-2 max-h-[52vh] overflow-auto rounded-lg border border-slate-200/70 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap break-all">
                    {formatted || '暂无内容'}
                </pre>
            )}
        </section>
    );
}
