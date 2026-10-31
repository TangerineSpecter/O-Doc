import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Code2, ExternalLink, FileText, Globe } from 'lucide-react';
import type { QuantSource } from '../../types/api/quant';
import { quantDate } from '../../utils/quant';
import { CodeEditor } from './CodeEditor';
import { SourceBundlePreview } from './sources/SourceBundlePreview';
import { ReportMarkdown } from './ReportMarkdown';

export function SourcePreview({ source }: { source: QuantSource }) {
    const data = source.payload;
    return (
        <details className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
            <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 hover:text-orange-600 sm:text-sm">
                <Code2 size={15} className="text-orange-500" />
                <span>查看所选来源资料</span>
                {data.language && (
                    <span className="ml-auto rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-slate-500 ring-1 ring-slate-200/70">
                        {data.language}
                    </span>
                )}
            </summary>
            <div className="mt-3 space-y-3 border-t border-slate-200/60 pt-3 text-sm">
                {data.url && (
                    <p className="flex items-center gap-1.5 break-all text-xs text-slate-600">
                        <Globe size={13} className="shrink-0 text-slate-400" />
                        <span>提交网址：{data.url}</span>
                        <a
                            href={data.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center text-orange-600 hover:underline"
                        >
                            <ExternalLink size={12} />
                        </a>
                    </p>
                )}
                {data.url && data.fetchStatus === 'not_fetched' && (
                    <p className="rounded-lg bg-white p-2.5 text-xs text-slate-500 ring-1 ring-slate-200/60">
                        尚未获取网页；开始分析时将尝试获取公开正文。登录或动态加载内容可能需要你补充。
                    </p>
                )}
                {data.fetchStatus === 'failed' && (
                    <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
                        网页获取失败：{data.fetchError}。原始资料仍保留，重新分析时会再尝试获取。
                    </p>
                )}
                {data.fetchStatus === 'fetched' && (
                    <div className="space-y-1 rounded-xl border border-slate-200/80 bg-white p-3 text-xs text-slate-600">
                        <p className="font-semibold text-slate-700">
                            网页快照 · {data.fetchedAt ? quantDate(data.fetchedAt) : quantDate(source.createdAt)}
                        </p>
                        <p className="break-all">实际来源：{data.finalUrl}</p>
                        <p className="text-slate-400">
                            保存的是提取到的正文；可能未覆盖完整页面或受保护源码。再次分析此快照会使用已保存内容。
                        </p>
                    </div>
                )}
                {data.description && (
                    <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
                        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <FileText size={13} className="text-orange-500" />
                            提交的说明
                        </h3>
                        <ReportMarkdown text={data.description} preserveOriginal />
                    </div>
                )}
                {data.bundleVersion === 1 ? (
                    <SourceBundlePreview key={source.id} source={source} />
                ) : (
                    data.code && (
                        <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-slate-700">
                                {data.codeOrigin === 'web_extracted' ? '从网页提取的代码' : '提交的代码'}
                            </h3>
                            <CodeEditor
                                value={data.code}
                                readOnly
                                compact
                                language={
                                    data.language === 'python' || data.language === 'mql4' || data.language === 'pine'
                                        ? data.language
                                        : 'text'
                                }
                            />
                        </div>
                    )
                )}
                {data.webMarkdown && (
                    <details className="rounded-xl border border-slate-200/80 bg-white p-3">
                        <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-orange-600">
                            查看已保存的网页正文
                        </summary>
                        <div className="prose prose-sm mt-3 max-h-96 max-w-none overflow-auto rounded-xl border border-slate-100 bg-slate-50/50 p-4 scrollbar-hide">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    img: ({ alt }) => <span className="text-slate-400">[图片：{alt || '网页配图'}]</span>,
                                }}
                            >
                                {data.webMarkdown}
                            </ReactMarkdown>
                        </div>
                    </details>
                )}
            </div>
        </details>
    );
}
