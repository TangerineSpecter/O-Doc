import ConfirmationModal from '@/components/common/ConfirmationModal';
import {useEscapeDismissal} from '@/hooks/useEscapeDismissal';
import {type PostPhotoAction, type PostPhotoState} from '@/api/postPhoto';
import {CheckCircle2, ImagePlus, Loader2, RefreshCw, Search, Trash2, X} from 'lucide-react';
import {useState} from 'react';

interface PostPhotoManageModalProps {
    isOpen: boolean;
    onClose: () => void;
    state: PostPhotoState;
    error: string;
    busy: boolean;
    operate: (action: PostPhotoAction) => Promise<void>;
}

export function PostPhotoManageModal({
    isOpen,
    onClose,
    state,
    error,
    busy,
    operate
}: PostPhotoManageModalProps) {
    const [confirmGenerate, setConfirmGenerate] = useState(false);
    const [confirmRegenerate, setConfirmRegenerate] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);

    useEscapeDismissal(isOpen && !confirmGenerate && !confirmRegenerate && !confirmRemove, onClose);

    if (!isOpen) return null;

    const pending = ['pending', 'generating'].includes(state.status || '');
    const paused = ['paused', 'query_required', 'submission_unknown'].includes(state.status || '');
    const downloadInterrupted = Boolean(state.canRetryDownload && state.error);
    const recovering = busy || Boolean(state.recovering);
    const retryAfter = state.retryAfterSeconds || 0;
    const stageLabels: Record<string, string> = {
        pending: '等待后台处理',
        submitting: '正在提交到生图服务',
        generating: '生图服务正在生成',
        download_pending: '生成完成，正在下载保存',
        succeeded: '图片已保存，等待加入正文'
    };
    const canGenerate = !state.status || state.status === 'removed';
    const canRegenerate = ['inserted', 'failed', 'cancelled', 'manual'].includes(state.status || '');
    const canRemove = Boolean(state.hasImage) && !pending && !paused && state.status !== 'abandoned';

    return (
        <div
            data-modal-scroll-lock
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                onClick={event => event.stopPropagation()}
                className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in zoom-in-95 duration-200"
                role="dialog"
                aria-modal="true"
                aria-label="帖子配图管理"
            >
                {/* 头部标题与关闭 */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500 shrink-0">
                            <ImagePlus className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">帖子配图管理</h2>
                            <p className="mt-0.5 text-xs text-slate-500">查看生成进度、重新生成或管理正文配图</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
                        title="关闭"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* 状态展示卡片 */}
                <div className="mt-4 rounded-xl border border-slate-200/90 bg-slate-50/80 p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-700">配图状态</span>
                        {state.status === 'inserted' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3 shrink-0" />
                                已加入正文
                            </span>
                        )}
                        {pending && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-600 border border-orange-200">
                                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                                {downloadInterrupted ? '下载待恢复' : '正在生成中'}
                            </span>
                        )}
                        {state.status === 'manual' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                                待确认插入
                            </span>
                        )}
                        {state.status === 'failed' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600 border border-red-200">
                                生成失败
                            </span>
                        )}
                        {state.status === 'removed' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
                                已从正文移除
                            </span>
                        )}
                        {(!state.status || state.status === 'abandoned') && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 border border-slate-200">
                                未配图
                            </span>
                        )}
                    </div>

                    {pending && (
                        <div className="mb-2 rounded-lg bg-orange-50/70 p-2.5 text-xs text-orange-800 border border-orange-100">
                            <p className="font-medium">
                                {downloadInterrupted ? '图片已生成，下载保存待重试' : stageLabels[state.stage || 'pending'] || '正在查询结果'} · 已等待 {Math.floor((state.elapsedSeconds || 0) / 60)} 分钟
                                {state.lastUpdatedAt && ` · 最近更新 ${new Date(state.lastUpdatedAt).toLocaleTimeString()}`}
                            </p>
                            <p className="mt-1 text-[11px] text-orange-700/80">
                                后台正在自动轮询处理，您可以随时关闭此窗口；生成完成后会自动更新正文。
                            </p>
                        </div>
                    )}

                    {state.error && (
                        <p role="status" className="mb-2 text-xs leading-5 text-amber-700">
                            {state.error}
                        </p>
                    )}

                    <p className="text-xs leading-relaxed text-slate-600">
                        {pending
                            ? downloadInterrupted
                                ? '可点击“重试下载”恢复原结果，不会重新生图。' + (state.hasImage ? '当前配图仍保留。' : '保存成功后才会插入正文。')
                                : state.hasImage
                                    ? '当前配图仍保留，新图保存成功后再替换。'
                                    : '图片保存成功后会自动插入正文。'
                            : state.status === 'inserted'
                                ? '配图已正常嵌入帖子正文，可在此重新生成新图或从帖子移除。'
                                : state.status === 'manual'
                                    ? '新图已生成；因帖子正文曾被手动修改，请预览后确认是否插入正文。'
                                    : state.status === 'removed'
                                        ? '配图已从正文移除，如需恢复可点击“补配图”。'
                                        : paused
                                            ? state.error || '需要查询原请求后才能继续。'
                                            : state.status === 'failed' && state.hasImage
                                                ? '重新生成失败，原配图仍保留。'
                                                : state.status === 'abandoned'
                                                    ? state.error || '帖子已删除，配图任务已结束。'
                                                    : state.error || '根据帖子主题生成旅行同款 Q 版手绘配图。'}
                    </p>

                    {state.status === 'manual' && state.imageUrl && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2.5">
                            <p className="mb-1.5 text-xs font-semibold text-slate-700">新图预览：</p>
                            <img
                                src={state.imageUrl}
                                alt="待插入的帖子配图"
                                className="max-h-56 w-full rounded-lg object-contain bg-slate-50"
                            />
                        </div>
                    )}
                </div>

                {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}

                {/* 底部操作工具栏 */}
                <div className="mt-6 flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                        关闭
                    </button>

                    {canRemove && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmRemove(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-500 transition-colors hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                            <Trash2 className="h-3.5 w-3.5 shrink-0" />
                            移除配图
                        </button>
                    )}

                    {(paused || pending) && (
                        <button
                            type="button"
                            disabled={recovering || retryAfter > 0}
                            onClick={() => void operate('query')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                            {recovering ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                            ) : (
                                <Search className="h-3.5 w-3.5 shrink-0" />
                            )}
                            {recovering
                                ? '正在恢复…'
                                : retryAfter > 0
                                    ? `稍后重试（${retryAfter}s）`
                                    : downloadInterrupted
                                        ? '重试下载'
                                        : '查询原请求'}
                        </button>
                    )}

                    {state.status === 'manual' && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void operate('use_image')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                            插入新图
                        </button>
                    )}

                    {canRegenerate && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmRegenerate(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-orange-200 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                            <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                            重新生成
                        </button>
                    )}

                    {canGenerate && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmGenerate(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0"
                        >
                            <ImagePlus className="h-3.5 w-3.5 shrink-0" />
                            补配图
                        </button>
                    )}
                </div>
            </div>

            {/* 二次确认弹窗 */}
            <ConfirmationModal
                isOpen={confirmGenerate}
                onClose={() => setConfirmGenerate(false)}
                onConfirm={() => {
                    setConfirmGenerate(false);
                    void operate('generate');
                }}
                title="为帖子补一张配图"
                type="warning"
                description="将根据帖子标题和正文生成旅行同款 Q 版手绘图。生图服务可能产生费用，是否继续？"
                confirmText="确认生成"
            />
            <ConfirmationModal
                isOpen={confirmRegenerate}
                onClose={() => setConfirmRegenerate(false)}
                onConfirm={() => {
                    setConfirmRegenerate(false);
                    void operate('retry');
                }}
                title="重新生成帖子配图"
                type="warning"
                description="这会调用生图服务，可能产生费用。新图成功后会替换当前配图；如果生成失败，原图会保留。是否继续？"
                confirmText="确认生成"
            />
            <ConfirmationModal
                isOpen={confirmRemove}
                onClose={() => setConfirmRemove(false)}
                onConfirm={() => {
                    setConfirmRemove(false);
                    void operate('remove');
                }}
                title="从帖子移除配图"
                type="danger"
                description="只会从这篇帖子的正文移除配图，不会删除资源库中的图片。"
                confirmText="移除配图"
            />
        </div>
    );
}
