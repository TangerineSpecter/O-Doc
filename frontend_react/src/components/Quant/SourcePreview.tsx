import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { QuantSource } from '../../types/api/quant';
import { quantDate } from '../../utils/quant';
import { CodeEditor } from './CodeEditor';
import {SourceBundlePreview} from './sources/SourceBundlePreview';

export function SourcePreview({ source }: { source: QuantSource }) {
    const data = source.payload;
    return <details className="mt-4"><summary className="cursor-pointer text-sm text-slate-500">查看所选来源资料</summary>
        <div className="mt-3 space-y-3 text-sm">
            {data.url && <p className="break-all text-slate-600">提交网址：{data.url}</p>}
            {data.url && data.fetchStatus === 'not_fetched' && <p className="text-slate-500">尚未获取网页；开始分析时将尝试获取公开正文。登录或动态加载内容可能需要你补充。</p>}
            {data.fetchStatus === 'failed' && <p role="status" className="rounded-xl bg-orange-50 p-3 text-orange-800">网页获取失败：{data.fetchError}。原始资料仍保留，重新分析时会再尝试获取。</p>}
            {data.fetchStatus === 'fetched' && <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-slate-600">
                <p>网页快照 · {data.fetchedAt ? quantDate(data.fetchedAt) : quantDate(source.createdAt)}</p>
                <p className="break-all">实际来源：{data.finalUrl}</p>
                <p className="text-xs">保存的是提取到的正文；可能未覆盖完整页面或受保护源码。再次分析此快照会使用已保存内容。</p>
            </div>}
            {data.description && <div><h3 className="mb-2 font-medium">提交的说明</h3><p className="whitespace-pre-wrap break-words">{data.description}</p></div>}
            {data.bundleVersion===1 ? <SourceBundlePreview key={source.id} source={source}/> : data.code && <div className="space-y-2"><h3 className="font-medium">{data.codeOrigin === 'web_extracted' ? '从网页提取的代码' : '提交的代码'}</h3>
                <CodeEditor value={data.code} readOnly compact language={data.language === 'python' || data.language === 'mql4' || data.language === 'pine' ? data.language : 'text'} />
            </div>}
            {data.webMarkdown && <details><summary className="cursor-pointer text-slate-600">查看已保存的网页正文</summary>
                <div className="prose prose-sm mt-3 max-h-96 max-w-none overflow-auto rounded-xl border border-slate-200 p-4 scrollbar-hide">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{img: ({alt}) => <span className="text-slate-400">[图片：{alt || '网页配图'}]</span>}}>{data.webMarkdown}</ReactMarkdown>
                </div>
            </details>}
        </div>
    </details>;
}
