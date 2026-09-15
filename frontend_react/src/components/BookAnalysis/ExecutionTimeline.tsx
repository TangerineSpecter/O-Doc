import {useEffect, useRef, useState} from 'react';
import {Activity, ArrowDown, Check, ChevronDown, ChevronUp, CircleAlert, Clock3, Copy, Loader2} from 'lucide-react';
import {useExecutionFeed} from '../../hooks/useExecutionFeed';
import {executionDuration, modelOutputProgress, modelRoles, pendingModelRequest, phaseLabels, runLabels} from '../../utils/readingExecution';
import type {ReadingExecutionEvent, ReadingRun} from '../../types/bookAnalysis';

function EventRow({event}: {event: ReadingExecutionEvent}) {
    const data = event.details;
    const tint = event.level === 'error' ? 'text-red-600 bg-red-50' : event.level === 'warning' ? 'text-amber-600 bg-amber-50' : event.level === 'success' ? 'text-lime-600 bg-lime-50' : 'text-slate-400 bg-slate-100';
    const Icon = event.level === 'success' ? Check : event.level === 'error' || event.level === 'warning' ? CircleAlert : event.kind === 'model_request_started' ? Clock3 : Activity;
    return <li className="relative flex gap-3 pb-4 last:pb-0">
        <span className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tint}`}><Icon className="h-3 w-3"/></span>
        <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className={`text-xs font-medium ${event.level === 'error' ? 'text-red-700' : 'text-slate-700'}`}>{event.title}</p><time dateTime={event.createdAt} className="shrink-0 font-mono text-[10px] tabular-nums text-slate-400">{new Date(event.createdAt).toLocaleTimeString()}</time></div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] leading-5 text-slate-500">
                {data.phase && <span>{phaseLabels[data.phase] || data.phase}</span>}
                {data.chapterOrdinal !== undefined && <span>第 {data.chapterOrdinal} 章{data.segment ? ` · 分段 ${data.segment}/${data.segments || '?'}` : ''}</span>}
                {data.modelName && <span className="break-all">{modelRoles[data.modelRole || ''] || '对话模型'} · {data.providerName} / {data.modelName}</span>}
                {data.attempt && <span>抽取第 {data.attempt}/2 次</span>}
                {data.requestAttempt && <span>网络请求第 {data.requestAttempt} 次</span>}
                {data.durationMs !== undefined && <span>耗时 {executionDuration(data.durationMs / 1000)}</span>}
                {data.chars !== undefined && <span>{data.chars.toLocaleString()} 字符{['model_response', 'model_first_output', 'model_progress'].includes(event.kind) ? '输出' : '输入'}</span>}
                {data.maxTokens !== undefined && <span>输出上限 {data.maxTokens.toLocaleString()} token</span>}
                {data.promptTokens !== undefined && <span>输入 {data.promptTokens.toLocaleString()} · 输出 {data.completionTokens?.toLocaleString() || '?'} token</span>}
                {data.nodes !== undefined && <span>{data.nodes} 节点 · {data.edges || 0} 关系</span>}
                {data.vectors !== undefined && <span>{data.vectors} 条向量</span>}
                {data.finishReason && <span className={data.finishReason === 'length' ? 'text-amber-700' : ''}>结束原因：{data.finishReason}</span>}
                {data.errorType && <span className="text-red-600">异常类型：{data.errorType}</span>}
            </div>
            {data.reason && <p className="mt-1 break-words text-[11px] leading-5 text-amber-800">{data.reason}</p>}
            {data.summary && <p className="mt-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-[11px] leading-5 text-slate-500">{data.summary}</p>}
        </div>
    </li>;
}

export default function ExecutionTimeline({bookId, run}: {bookId: string; run: ReadingRun}) {
    const feed = useExecutionFeed(bookId, run);
    const [open, setOpen] = useState(true);
    const [follow, setFollow] = useState(true);
    const [copyStatus, setCopyStatus] = useState('');
    const [now, setNow] = useState(0);
    const viewport = useRef<HTMLDivElement>(null);
    const running = run.state === 'running' || run.state === 'queued';
    const request = pendingModelRequest({...run, events: feed.events});
    const progress = modelOutputProgress(feed.events, request);
    const latestId = feed.events[feed.events.length - 1]?.id;
    useEffect(() => {
        const anchor = Date.now();
        const base = run.serverTime ? Date.parse(run.serverTime) : anchor;
        setNow(base);
        if (!running) return;
        const timer = window.setInterval(() => setNow(base + Date.now() - anchor), 1000);
        return () => clearInterval(timer);
    }, [running, run.serverTime]);
    useEffect(() => {
        if (open && follow && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
    }, [open, follow, latestId]);
    const elapsed = request ? Math.max(0, (now - Date.parse(request.createdAt)) / 1000) : 0;
    const heartbeatAge = run.heartbeatAt ? Math.max(0, (now - Date.parse(run.heartbeatAt)) / 1000) : null;
    const copyDiagnostic = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify({taskId: run.id, state: run.state, stage: run.stage, completed: run.completed, total: run.total, error: run.error, heartbeatAt: run.heartbeatAt, leaseExpiresAt: run.leaseExpiresAt, recovering: run.recovering, events: feed.events}, null, 2));
            setCopyStatus('诊断已复制');
        } catch {setCopyStatus('复制失败，请允许剪贴板访问');}
    };
    return <section aria-label="图书分析执行记录" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <button onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Activity className="h-3.5 w-3.5 text-orange-500"/>执行记录{open ? <ChevronUp className="h-3 w-3 text-slate-400"/> : <ChevronDown className="h-3 w-3 text-slate-400"/>}</button>
            <div className="flex items-center gap-3"><span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] ${run.state === 'failed' ? 'bg-red-50 text-red-600' : running ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{running && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none"/>}{runLabels[run.state]} · {run.completed}/{run.total} 章</span><button onClick={() => void copyDiagnostic()} className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-orange-600"><Copy className="h-3 w-3"/>复制诊断</button></div>
        </div>
        {open && <>
            <div className="border-b border-orange-100 bg-orange-50/40 px-3 py-3">
                <p aria-live="polite" className="text-xs font-medium text-slate-700">{run.cancelRequested && running ? '正在停止：取消当前模型连接，不会继续处理后续分段。' : run.recovering ? '未发现有效执行租约，等待后台恢复；也可能是工作线程没有启动。' : request ? progress ? `正在接收模型输出 · 已收到 ${(progress.details.chars || 0).toLocaleString()} 字符 · 已用时 ${executionDuration(elapsed)}` : `正在等待${modelRoles[request.details.modelRole || ''] || '对话模型'}${request.details.streaming ? '首个输出' : '返回'} · 已等待 ${executionDuration(elapsed)}` : run.stage}</p>
                {request && <p className="mt-1 break-all text-[11px] text-slate-500">{request.details.providerName} / {request.details.modelName} · {phaseLabels[request.details.phase || ''] || '模型调用'}</p>}
                {request && <p className="mt-1 text-[10px] leading-5 text-slate-400">{request.details.modelRole === 'embedding' && request.details.deadlineSeconds ? `向量请求硬时限 ${request.details.deadlineSeconds} 秒，每次仅输入一段正文，不做隐式重试；完成一段就保存，停止会取消当前连接。非流式，返回前没有逐字输出。` : request.details.streaming ? `本次模型调用硬时限 ${request.details.deadlineSeconds || 120} 秒，当前请求剩余预算 ${request.details.timeoutSeconds || 120} 秒。SDK 隐式重试已关闭；兼容回退或网络重试会单独记录，并共享硬时限。流式字符数为未校验输出，不代表成果已发布。` : `旧版请求：超时配置 ${request.details.timeoutSeconds || 120} 秒，SDK 最多重试 ${request.details.sdkRetries ?? 1} 次；非流式，返回前无输出进度。`}</p>}
                {request?.details.jsonMode && <p className="mt-1 text-[10px] leading-5 text-slate-400">输出格式：{request.details.jsonMode === 'json_object' ? 'JSON 模式' : request.details.jsonMode === 'prompt' ? '提示词 JSON 约束（接口不支持 JSON 模式）' : '文本'}。{request.details.thinkingMode === 'disabled' ? '已发送关闭思考参数。' : '此提供商未发送关闭思考参数，是否思考由接口和模型决定。'}</p>}
                {heartbeatAge !== null && running && <p className="mt-1 text-[10px] text-slate-400">执行租约最近续约：{executionDuration(heartbeatAge)}前（续约不代表模型已返回）。</p>}
                {heartbeatAge !== null && heartbeatAge >= 45 && running && <p className="mt-1 text-[11px] leading-5 text-amber-700">最近获取的执行租约较久没有续约，可能发生了服务重启、线程中断或状态查询断连。</p>}
                {request && elapsed >= (request.details.timeoutSeconds || 120) && <p className="mt-1 text-[11px] leading-5 text-amber-700">{request.details.streaming || request.details.deadlineSeconds ? '已达到当前请求的时间预算，等待后端关闭连接并回传终态；若状态仍不更新，请复制诊断检查服务是否重启或查询断连。' : '旧版请求等待较久，可能正在 SDK 重试；不能仅凭租约续约判断正常。'}</p>}
                {run.error && <p role="alert" className="mt-2 break-words text-xs leading-5 text-red-600">{run.error}</p>}
            </div>
            <div ref={viewport} role="log" aria-label="执行步骤时间线" aria-live="off" onScroll={event => {const element = event.currentTarget; setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 48);}} className="max-h-72 overflow-y-auto overscroll-contain bg-slate-50/50 px-3 py-4">
                {feed.hasMore && <button disabled={feed.loading} onClick={() => {setFollow(false); void feed.loadOlder();}} className="mb-4 ml-9 text-[11px] text-orange-600 disabled:opacity-50">{feed.loading ? '加载中…' : '加载更早的记录'}</button>}
                {feed.error && <p className="mb-3 text-xs text-red-600">{feed.error}</p>}
                {feed.events.length ? <ol className="relative before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-slate-200">{feed.events.map(event => <EventRow key={event.id} event={event}/>)}</ol> : <p className="py-4 text-center text-xs leading-6 text-slate-400">这项旧任务尚无执行记录。升级后新执行的步骤会持续出现在这里。</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400"><span>{copyStatus || `任务 ${run.id.slice(0, 8)} · 记录执行状态，不记录内部推理或密钥`}</span><button onClick={() => setFollow(value => !value)} className={`inline-flex items-center gap-1 ${follow ? 'text-orange-600' : 'text-slate-500'}`}><ArrowDown className="h-3 w-3"/>{follow ? '自动跟随新记录' : '继续跟随新记录'}</button></div>
        </>}
    </section>;
}
