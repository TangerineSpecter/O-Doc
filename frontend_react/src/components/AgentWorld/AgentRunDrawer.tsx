import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    CircleAlert,
    Copy,
    LoaderCircle,
    Maximize2,
    Minimize2,
    Sparkles,
    X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {getAgentRunRecord} from '../../api/setting';
import type {AgentActivity, AgentRunRecordConfig} from '../../types/api/setting';
import StarLoader from '../common/StarLoader';
import AgentAvatar from './AgentAvatar';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

const formatTrigger = (trigger?: string) => {
    if (!trigger) return '系统调度';
    if (trigger === 'schedule') return '定时任务调度';
    if (trigger === 'manual') return '手动触发执行';
    if (trigger === 'followup') return 'Agent 协作联动';
    if (trigger === 'event') return '外部事件响应';
    return trigger;
};

const formatTimeOnly = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});
};

export default function AgentRunDrawer({activity, onClose}: {activity: AgentActivity | null; onClose: () => void}) {
    const [record, setRecord] = useState<AgentRunRecordConfig | null>(null);
    const [error, setError] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    useEscapeDismissal(Boolean(activity), onClose);

    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    // 加载执行结果详情
    const runRecordId = activity?.runRecordId;
    const isLoading = Boolean(runRecordId && record?.id !== runRecordId && !error);

    useEffect(() => {
        let active = true;
        if (!runRecordId) return;

        getAgentRunRecord(runRecordId)
            .then(result => {
                if (active) setRecord(result);
            })
            .catch(loadError => {
                if (active) {
                    setError(loadError instanceof Error ? loadError.message : '加载执行结果失败');
                }
            });

        return () => {
            active = false;
        };
    }, [runRecordId]);

    // 键盘支持与焦点管理
    useEffect(() => {
        if (!activity) return;
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 50);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(element => !element.hasAttribute('hidden'));

            if (!focusable.length) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
            previouslyFocused?.focus();
        };
    }, [activity]);

    // 匹配当前 Agent 的执行结果
    const activeAgentRun = (() => {
        if (!record?.agentRuns?.length) return null;
        return record.agentRuns.find(item => item.agent === activity?.agent.id) || null;
    })();

    const steps = activeAgentRun?.steps || record?.steps || [];
    const output = activeAgentRun?.content || record?.output || '';

    // 当前状态
    const currentStatus = record?.status || activity?.status || 'success';

    // 复制内容
    const handleCopyOutput = async () => {
        if (!output) return;
        try {
            await navigator.clipboard.writeText(output);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // 剪贴板异常处理
        }
    };

    if (!activity) return null;

    const drawerContent = (
        <div className="fixed inset-0 z-[130] flex flex-col justify-end animate-in fade-in duration-200">
            {/* 磨砂遮罩背景 */}
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* 底部抽屉容器 */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="agent-run-drawer-title"
                tabIndex={-1}
                className={`relative z-10 mx-auto flex w-full max-w-4xl flex-col overflow-hidden border-t border-x border-slate-200/80 bg-white shadow-2xl transition-all duration-300 ease-out ${
                    isExpanded ? 'h-full max-h-screen rounded-t-none' : 'h-[75vh] rounded-t-3xl'
                }`}
            >
                {/* 顶部拖动手柄与“点击铺满/收起”控制条（与消息中心一致） */}
                <div
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex shrink-0 cursor-pointer select-none flex-col items-center border-b border-slate-100/70 bg-slate-50/60 pb-1 pt-2.5 transition-colors hover:bg-slate-100/60"
                >
                    <div className="h-1 w-10 rounded-full bg-slate-300"/>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                        className="mt-1.5 inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[11px] font-semibold text-orange-600 transition-all hover:bg-orange-100/60 hover:text-orange-700 active:scale-95"
                    >
                        {isExpanded ? (
                            <>
                                <ChevronDown className="h-3.5 w-3.5"/>
                                <span>收起显示</span>
                            </>
                        ) : (
                            <>
                                <ChevronUp className="h-3.5 w-3.5"/>
                                <span>点击铺满</span>
                            </>
                        )}
                    </button>
                </div>

                {/* 头部导航栏 */}
                <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 py-3.5 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="relative shrink-0">
                            <AgentAvatar
                                name={activeAgentRun?.agentName || activity.agent.name}
                                avatar={activeAgentRun?.agentAvatar || activity.agent.avatar}
                                size="md"
                            />
                            {currentStatus === 'running' && (
                                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"/>
                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500"/>
                                </span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 id="agent-run-drawer-title" className="truncate text-sm font-bold text-slate-900 sm:text-base">
                                    {activeAgentRun?.agentName || activity.agent.name} · 执行详情
                                </h2>
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none ${
                                    currentStatus === 'running'
                                        ? 'border-blue-200/80 bg-blue-50 text-blue-700'
                                        : currentStatus === 'failed'
                                            ? 'border-red-200/80 bg-red-50 text-red-700'
                                            : 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                }`}>
                                    {currentStatus === 'running' ? '执行中' : currentStatus === 'failed' ? '执行失败' : '执行完成'}
                                </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                                任务：{record?.taskName || activity.title}
                            </p>
                        </div>
                    </div>

                    {/* 右侧操作按钮 */}
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="hidden items-center gap-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 sm:inline-flex"
                            title={isExpanded ? '还原窗口' : '全屏显示'}
                            aria-label={isExpanded ? '还原窗口' : '全屏显示'}
                        >
                            {isExpanded ? <Minimize2 className="h-4 w-4"/> : <Maximize2 className="h-4 w-4"/>}
                        </button>
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={onClose}
                            aria-label="关闭"
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        >
                            <X className="h-5 w-5"/>
                        </button>
                    </div>
                </header>

                {/* 内容展示区 */}
                <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/50 p-4 sm:p-6">
                    {/* 加载中与错误展示 */}
                    {isLoading && (
                        <div className="flex min-h-64 items-center justify-center">
                            <StarLoader/>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-sm text-red-700 shadow-xs">
                            <CircleAlert className="mx-auto mb-2 h-6 w-6 text-red-500"/>
                            <p className="font-semibold">{error}</p>
                            <p className="mt-1 text-xs text-red-500">请检查网络或刷新页面后重试</p>
                        </div>
                    )}

                    {!isLoading && record && (
                        <>
                            {/* 1. 运行核心指标看板 */}
                            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs sm:grid-cols-4 sm:p-4">
                                <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-slate-400">执行状态</div>
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 sm:text-sm">
                                        {currentStatus === 'running' ? (
                                            <>
                                                <LoaderCircle className="h-3.5 w-3.5 animate-spin text-blue-500"/>
                                                <span className="text-blue-600">正在运行</span>
                                            </>
                                        ) : currentStatus === 'failed' ? (
                                            <>
                                                <CircleAlert className="h-3.5 w-3.5 text-red-500"/>
                                                <span className="text-red-600">执行异常</span>
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500"/>
                                                <span className="text-emerald-600">执行成功</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-slate-400">总计耗时</div>
                                    <div className="font-mono text-xs font-bold text-slate-800 sm:text-sm">
                                        {record.duration || activeAgentRun?.duration || (currentStatus === 'running' ? '计算中' : '-')}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-slate-400">触发渠道</div>
                                    <div className="truncate text-xs font-bold text-slate-700 sm:text-sm" title={record.trigger}>
                                        {formatTrigger(record.trigger)}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-slate-400">启动时间</div>
                                    <div className="font-mono text-xs font-medium text-slate-600 sm:text-sm">
                                        {formatTimeOnly(record.startedAt || activity.occurredAt)}
                                    </div>
                                </div>
                            </div>

                            {/* 任务说明/摘要 */}
                            {(record.summary || activity.summary) && (
                                <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs leading-relaxed text-slate-600 shadow-xs sm:p-4">
                                    <span className="font-bold text-slate-800">任务摘要：</span>
                                    {record.summary || activity.summary}
                                </div>
                            )}

                            {/* 3. 执行过程时间线 */}
                            <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5">
                                <div className="flex items-center justify-between">
                                    <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900 sm:text-sm">
                                        <Sparkles className="h-4 w-4 text-orange-500"/>
                                        执行过程时间轴
                                    </h3>
                                    <span className="text-[11px] text-slate-400">
                                        共 {steps.length} 个记录节点
                                    </span>
                                </div>

                                {steps.length > 0 ? (
                                    <div className="relative mt-3 space-y-4 border-l-2 border-slate-100 pl-5 sm:pl-6">
                                        {steps.map((step, index) => {
                                            const isStepFailed = step.status === 'failed' || step.title.includes('失败');
                                            const isStepRunning = step.status === 'running';

                                            return (
                                                <div key={`${step.time}-${index}`} className="relative">
                                                    {/* 节点图标 */}
                                                    <span className={`absolute -left-[27px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white shadow-2xs sm:-left-[31px] ${
                                                        isStepFailed
                                                            ? 'bg-red-100 text-red-600'
                                                            : isStepRunning
                                                                ? 'bg-blue-100 text-blue-600'
                                                                : 'bg-emerald-100 text-emerald-600'
                                                    }`}>
                                                        {isStepFailed ? (
                                                            <CircleAlert className="h-2.5 w-2.5"/>
                                                        ) : isStepRunning ? (
                                                            <LoaderCircle className="h-2.5 w-2.5 animate-spin"/>
                                                        ) : (
                                                            <Check className="h-2.5 w-2.5"/>
                                                        )}
                                                    </span>

                                                    {/* 步骤内容 */}
                                                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                                                        <span className="font-bold text-slate-800">{step.title}</span>
                                                        <time className="font-mono text-[11px] text-slate-400">
                                                            {formatTimeOnly(step.time)}
                                                        </time>
                                                    </div>

                                                    {step.detail && (
                                                        <div className={`mt-1.5 rounded-xl border p-2.5 text-xs font-mono leading-relaxed break-words whitespace-pre-wrap ${
                                                            isStepFailed
                                                                ? 'border-red-100 bg-red-50/60 text-red-700'
                                                                : 'border-slate-100 bg-slate-50 text-slate-600'
                                                        }`}>
                                                            {step.detail}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="py-6 text-center text-xs text-slate-400">
                                        本次任务未记录单独分步节点
                                    </div>
                                )}
                            </section>

                            {/* 4. 完整产出与输出阅读区 */}
                            <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xs font-bold text-slate-900 sm:text-sm">
                                            完整执行产出
                                        </h3>
                                        {output && (
                                            <span className="text-[11px] text-slate-400">
                                                共 {output.length} 字
                                            </span>
                                        )}
                                    </div>

                                    {output && (
                                        <button
                                            type="button"
                                            onClick={handleCopyOutput}
                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-2xs transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-95"
                                        >
                                            {copied ? (
                                                <>
                                                    <Check className="h-3.5 w-3.5 text-emerald-600"/>
                                                    <span className="text-emerald-600">已复制！</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="h-3.5 w-3.5 text-slate-400"/>
                                                    <span>复制内容</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>

                                {output ? (
                                    <div className="prose prose-slate max-w-none rounded-xl border border-slate-150 bg-slate-50/40 p-4 text-xs leading-relaxed text-slate-700 sm:text-sm">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {output}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                                        本次执行暂无文本正文产出
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(drawerContent, document.body) : null;
}
