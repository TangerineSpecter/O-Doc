import { useState } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    Clock,
    Database,
    Download,
    HardDrive,
    RefreshCw,
    Search,
    Trash2,
} from 'lucide-react';
import { useSystemLogs } from '@/hooks/useSystemLogs';
import { SystemLogDetail } from './SystemLogDetail';
import ConfirmationModal from '@/components/common/ConfirmationModal';
import { Select } from '@/components/common/Select';
import { Checkbox } from '@/components/common/Checkbox';

const time = (value: number | null) => (value ? new Date(value * 1000).toLocaleString() : '暂无');

export function SystemLogs() {
    const logs = useSystemLogs();
    const [selection, setSelection] = useState<{ page: typeof logs.page | null; ids: string[] }>({
        page: null,
        ids: [],
    });
    const selected = selection.page === logs.page ? selection.ids : [];
    const [confirmation, setConfirmation] = useState<{ ids: string[] | null } | null>(null);
    const [policyDraft, setPolicyDraft] = useState<{ days: number; mb: number } | null>(null);

    const days = policyDraft?.days ?? logs.overview?.policy.days ?? 30;
    const mb = policyDraft?.mb ?? logs.overview?.policy.maxMb ?? 100;

    const filter = (key: 'module' | 'q' | 'since' | 'until', value: string) => {
        logs.setQuery(previous => ({
            ...previous,
            page: 1,
            [key]:
                key === 'since' || key === 'until'
                    ? value
                        ? new Date(value).getTime() / 1000
                        : undefined
                    : value,
        }));
    };

    const isAllCurrentPageSelected =
        logs.page.list.length > 0 && logs.page.list.every(item => selected.includes(item.id));

    const toggleSelectAll = (checked: boolean) => {
        setSelection({
            page: logs.page,
            ids: checked ? logs.page.list.map(item => item.id) : [],
        });
    };

    const totalPages = Math.max(1, Math.ceil(logs.page.total / 20));

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* 1. 顶部 Header 卡片（完全保持第一版规范：白底大圆角卡片、橙色图标徽章、标题与说明、刷新按钮） */}
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 shrink-0">
                        <AlertCircle className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">系统日志</h3>
                        <p className="mt-1 text-xs text-slate-500">汇总本机运行异常，日志仅保存在本机，不参与云端同步。</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                        disabled={logs.loading || logs.busy}
                        onClick={() => void logs.refresh()}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${logs.loading ? 'animate-spin text-orange-500' : ''}`} />
                        刷新
                    </button>
                </div>
            </div>

            {/* 2. 紧凑型一体化统计指标栏 */}
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xs">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-slate-100">
                    {/* 24 小时异常 */}
                    <div className="flex items-center gap-3 sm:pr-4">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                            <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-medium text-slate-400">最近 24 小时异常</p>
                            <p className="text-sm font-bold text-slate-800 tracking-tight">
                                {logs.overview?.recent ?? '—'}
                                {typeof logs.overview?.recent === 'number' && logs.overview.recent > 0 && (
                                    <span className="ml-1 text-xs font-normal text-red-500">次</span>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* 最近异常时间 */}
                    <div className="flex items-center gap-3 sm:px-4">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                            <Clock className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-medium text-slate-400">最近异常发生时间</p>
                            <p className="truncate text-xs font-semibold text-slate-800" title={time(logs.overview?.latest ?? null)}>
                                {time(logs.overview?.latest ?? null)}
                            </p>
                        </div>
                    </div>

                    {/* 日志占用与上限 */}
                    <div className="flex items-center gap-3 sm:pl-4">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <HardDrive className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-medium text-slate-400">日志空间占用</p>
                            <p className="text-xs font-semibold text-slate-800">
                                {logs.overview ? `${(logs.overview.bytes / 1024 / 1024).toFixed(2)} MB` : '—'}
                                <span className="ml-1 text-[11px] font-normal text-slate-400">
                                    / {logs.overview?.policy.maxMb ?? 100} MB
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. 存储与自动清理策略卡片 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                        <Database className="h-4 w-4" />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800 text-sm">存储与自动清理策略</h4>
                        <p className="mt-0.5 text-xs text-slate-500">
                            超出保留天数或容量上限时优先自动清理最旧记录，调整策略后保存立即生效。
                        </p>
                    </div>
                </div>

                <div className="h-px bg-slate-100" />

                <form
                    onSubmit={event => {
                        event.preventDefault();
                        void logs.savePolicy(days, mb).then(saved => {
                            if (saved) setPolicyDraft(null);
                        });
                    }}
                    className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                >
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            自动保留期限
                        </label>
                        <div className="relative flex items-center">
                            <input
                                aria-label="保留天数"
                                type="number"
                                min={1}
                                max={3650}
                                required
                                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-1.5 pr-8 text-xs text-slate-800 transition-all focus:bg-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                value={days}
                                onChange={e => setPolicyDraft({ days: Number(e.target.value), mb })}
                            />
                            <span className="pointer-events-none absolute right-3 text-xs text-slate-400">天</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                            存储空间上限
                        </label>
                        <div className="relative flex items-center">
                            <input
                                aria-label="空间上限"
                                type="number"
                                min={1}
                                max={10240}
                                required
                                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-1.5 pr-10 text-xs text-slate-800 transition-all focus:bg-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                value={mb}
                                onChange={e => setPolicyDraft({ days, mb: Number(e.target.value) })}
                            />
                            <span className="pointer-events-none absolute right-3 text-xs text-slate-400">MB</span>
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 active:bg-orange-700 px-4 py-1.5 text-xs font-medium text-white shadow-2xs shadow-orange-500/20 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                            disabled={logs.busy}
                        >
                            保存策略
                        </button>
                    </div>
                </form>
            </div>

            {/* 4. 日志列表与筛选主卡片 */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {/* 卡片顶部筛选与操作区域 */}
                <div className="space-y-3 border-b border-slate-100 bg-slate-50/50 p-4">
                    {/* 筛选输入行 */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* 搜索框 */}
                        <div className="relative min-w-0 flex-1 sm:min-w-[180px]">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <input
                                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                aria-label="搜索日志"
                                placeholder="搜索标题或异常类型..."
                                value={logs.query.q}
                                onChange={e => filter('q', e.target.value)}
                            />
                        </div>

                        {/* 模块选择下拉 */}
                        <div className="w-full sm:w-40">
                            <Select
                                value={logs.query.module || ''}
                                options={[
                                    { value: '', label: '全部模块' },
                                    ...(logs.overview?.modules.map(module => ({ value: module, label: module })) || []),
                                ]}
                                onChange={value => filter('module', value)}
                                placeholder="全部模块"
                                buttonClassName="!h-[31px] !min-h-[31px] px-2.5 !py-1 text-xs rounded-lg"
                                menuPortal={true}
                            />
                        </div>

                        {/* 开始时间 */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span className="shrink-0">从</span>
                            <input
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                aria-label="开始时间"
                                type="datetime-local"
                                onChange={e => filter('since', e.target.value)}
                            />
                        </div>

                        {/* 结束时间 */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span className="shrink-0">至</span>
                            <input
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                aria-label="结束时间"
                                type="datetime-local"
                                onChange={e => filter('until', e.target.value)}
                            />
                        </div>
                    </div>

                    {/* 批量操作与统计行 */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                            {logs.page.list.length > 0 && (
                                <div className="mr-1 flex items-center gap-1.5 pr-2 border-r border-slate-200">
                                    <Checkbox
                                        checked={isAllCurrentPageSelected}
                                        onChange={toggleSelectAll}
                                        aria-label="当前页全选"
                                        size="sm"
                                    />
                                    <span className="text-xs text-slate-500 select-none">当页全选</span>
                                </div>
                            )}

                            <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
                                disabled={!selected.length || logs.busy}
                                onClick={() => void logs.download(selected)}
                            >
                                <Download className="h-3.5 w-3.5 text-slate-500" />
                                下载选中 {selected.length > 0 && `(${selected.length})`}
                            </button>

                            <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/50 px-2.5 py-1 text-xs font-medium text-red-600 shadow-2xs transition-colors hover:bg-red-50 disabled:opacity-40 whitespace-nowrap shrink-0"
                                disabled={!selected.length || logs.busy}
                                onClick={() => setConfirmation({ ids: selected })}
                            >
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                删除选中
                            </button>

                            <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 whitespace-nowrap shrink-0"
                                disabled={!logs.overview?.total || logs.busy}
                                onClick={() => setConfirmation({ ids: null })}
                            >
                                清空全部
                            </button>
                        </div>

                        <div className="text-xs text-slate-400">
                            共 <span className="font-semibold text-slate-700">{logs.page.total}</span> 条日志
                        </div>
                    </div>
                </div>

                {/* 错误提示 */}
                {logs.error && (
                    <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-2.5 text-xs text-red-600">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                        <span>{logs.error}</span>
                    </div>
                )}

                {/* 列表内容区 */}
                <div className="divide-y divide-slate-100" aria-busy={logs.loading}>
                    {logs.loading && (
                        <div className="flex items-center justify-center gap-2 p-8 text-xs text-slate-400">
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                            正在加载日志...
                        </div>
                    )}

                    {!logs.loading && !logs.page.list.length && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <div className="mb-2 rounded-full bg-slate-50 p-3 text-slate-300">
                                <Search className="h-5 w-5" />
                            </div>
                            <p className="text-xs text-slate-500 font-medium">暂无符合条件的异常日志</p>
                            <p className="mt-1 text-[11px] text-slate-400">可尝试调整搜索关键词、所属模块或筛选时间范围</p>
                        </div>
                    )}

                    {!logs.loading &&
                        logs.page.list.map(log => {
                            const isChecked = selected.includes(log.id);
                            return (
                                <div
                                    key={log.id}
                                    className={`group flex items-start gap-3 p-3.5 transition-colors hover:bg-slate-50/80 ${
                                        isChecked ? 'bg-orange-50/30' : ''
                                    }`}
                                >
                                    <div className="pt-0.5">
                                        <Checkbox
                                            checked={isChecked}
                                            onChange={checked => {
                                                setSelection({
                                                    page: logs.page,
                                                    ids: checked ? [...selected, log.id] : selected.filter(id => id !== log.id),
                                                });
                                            }}
                                            aria-label={`选择 ${log.title}`}
                                            size="sm"
                                        />
                                    </div>

                                    <button
                                        className="min-w-0 flex-1 text-left"
                                        onClick={() => void logs.openDetail(log.id)}
                                    >
                                        <p className="break-words text-sm font-semibold text-slate-800 transition-colors group-hover:text-orange-600">
                                            {log.title}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                            <span className="font-mono text-slate-500">{time(log.created)}</span>
                                            <span>·</span>
                                            <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                                                {log.module}
                                            </span>
                                            <span>·</span>
                                            <span className="inline-flex items-center rounded border border-red-100 bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600">
                                                {log.errorType}
                                            </span>
                                        </div>
                                    </button>

                                    <div className="flex shrink-0 items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                                        <button
                                            type="button"
                                            aria-label="下载日志"
                                            className="rounded-lg border border-transparent p-1.5 text-slate-400 transition-all hover:border-slate-200 hover:bg-white hover:text-orange-600 hover:shadow-xs disabled:opacity-40"
                                            disabled={logs.busy}
                                            onClick={() => void logs.download([log.id])}
                                            title="下载该条日志"
                                        >
                                            <Download className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="删除日志"
                                            className="rounded-lg border border-transparent p-1.5 text-slate-400 transition-all hover:border-slate-200 hover:bg-white hover:text-red-600 hover:shadow-xs disabled:opacity-40"
                                            disabled={logs.busy}
                                            onClick={() => setConfirmation({ ids: [log.id] })}
                                            title="删除该条日志"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                </div>

                {/* 分页 Footer */}
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/40 px-4 py-3 text-xs">
                    <div className="text-slate-400">
                        第 <span className="font-semibold text-slate-700">{logs.query.page}</span> / {totalPages} 页
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-40"
                            disabled={logs.query.page === 1 || logs.loading}
                            onClick={() => logs.setQuery(q => ({ ...q, page: q.page - 1 }))}
                        >
                            上一页
                        </button>
                        <button
                            type="button"
                            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-40"
                            disabled={logs.query.page >= totalPages || logs.loading}
                            onClick={() => logs.setQuery(q => ({ ...q, page: q.page + 1 }))}
                        >
                            下一页
                        </button>
                    </div>
                </div>
            </div>

            {/* 详情模态弹窗 */}
            {logs.detail && (
                <SystemLogDetail
                    detail={logs.detail}
                    busy={logs.busy}
                    onClose={logs.closeDetail}
                    onDownload={() => void logs.download([logs.detail!.id])}
                />
            )}

            {/* 确认删除/清空弹窗 */}
            <ConfirmationModal
                isOpen={Boolean(confirmation)}
                onClose={() => setConfirmation(null)}
                title="删除异常日志"
                description={
                    <div>
                        {confirmation?.ids === null
                            ? '确认清空全部异常日志？该操作无法恢复。'
                            : `确认删除选中的 ${confirmation?.ids?.length || 0} 条异常日志？该操作无法恢复。`}
                        {logs.error && <p role="alert" className="mt-2 text-xs text-red-600">{logs.error}</p>}
                    </div>
                }
                confirmText={confirmation?.ids === null ? '确认清空' : '确认删除'}
                type="danger"
                isLoading={logs.busy}
                onConfirm={async () => {
                    if (confirmation && (await logs.remove(confirmation.ids))) {
                        setConfirmation(null);
                    }
                }}
            />
        </div>
    );
}
