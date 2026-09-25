import {useEffect, useState} from 'react';
import {GitCompareArrows, History, Loader2, RotateCcw, X} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import {getArticleVersion, getArticleVersions, restoreArticleVersion} from '../../api/articleVersions';
import type {Article} from '../../types/api/article';
import type {ArticleVersion, ArticleVersionRestoreResult, ArticleVersionSource, ArticleVersionSummary} from '../../types/api/articleVersion';
import {markdownSanitizeSchema} from '../../utils/markdownSecurity';
import {remarkQuoteVariants} from './MarkdownElements';
import ConfirmationModal from '../common/ConfirmationModal';
import {useToast} from '../common/ToastProvider';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

interface ArticleVersionHistoryModalProps {
    articleId: string;
    currentTitle: string;
    currentContent: string;
    isOpen: boolean;
    onClose: () => void;
    restoreDescription?: string;
    onRestored?: (article: Article) => void;
}

const SOURCE_LABELS: Record<ArticleVersionSource, string> = {
    save: '保存前',
    polish: '后台润色前',
    restore: '恢复前',
    import: '导入前',
};

const formatVersionTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 16);
    return date.toLocaleString('zh-CN', {hour12: false});
};

const VersionMarkdown = ({content}: {content: string}) => (
    <div className="prose prose-slate max-w-none break-words prose-img:rounded-xl prose-pre:overflow-x-auto">
        <ReactMarkdown
            remarkPlugins={[remarkQuoteVariants, remarkGfm, remarkMath]}
            rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema], rehypeKatex]}
        >
            {content}
        </ReactMarkdown>
    </div>
);

export default function ArticleVersionHistoryModal({
    articleId,
    currentTitle,
    currentContent,
    isOpen,
    onClose,
    restoreDescription,
    onRestored,
}: ArticleVersionHistoryModalProps) {
    const toast = useToast();
    const [versions, setVersions] = useState<ArticleVersionSummary[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState('');
    const [selectedVersion, setSelectedVersion] = useState<ArticleVersion | null>(null);
    const [isLoadingList, setIsLoadingList] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [showComparison, setShowComparison] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [restoreOutcome, setRestoreOutcome] = useState<ArticleVersionRestoreResult | null>(null);
    const currentWordCount = Array.from(currentContent.replace(/[#*`>~-]/g, '').trim()).length;
    useEscapeDismissal(isOpen, () => {if (!isRestoring) onClose();});

    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        setIsLoadingList(true);
        setSelectedVersion(null);
        setSelectedVersionId('');
        setErrorMessage('');
        setRestoreOutcome(null);

        void getArticleVersions(articleId)
            .then(result => {
                if (!active) return;
                setVersions(result);
                setSelectedVersionId(result[0]?.versionId || '');
            })
            .catch(error => {
                if (!active) return;
                setVersions([]);
                setErrorMessage(error instanceof Error ? error.message : '无法加载版本历史');
            })
            .finally(() => {
                if (active) setIsLoadingList(false);
            });

        return () => { active = false; };
    }, [articleId, isOpen]);

    useEffect(() => {
        if (!isOpen || !selectedVersionId) {
            setSelectedVersion(null);
            return;
        }
        let active = true;
        setIsLoadingDetail(true);
        setSelectedVersion(null);
        setErrorMessage('');
        void getArticleVersion(articleId, selectedVersionId)
            .then(result => {
                if (active) setSelectedVersion(result);
            })
            .catch(error => {
                if (active) setErrorMessage(error instanceof Error ? error.message : '无法加载该版本');
            })
            .finally(() => {
                if (active) setIsLoadingDetail(false);
            });
        return () => { active = false; };
    }, [articleId, isOpen, selectedVersionId]);

    const finishRestore = (article: Article) => {
        onClose();
        onRestored?.(article);
    };

    const handleClose = () => {
        if (restoreOutcome) {
            finishRestore(restoreOutcome.article);
        } else {
            onClose();
        }
    };

    const handleRestore = async () => {
        if (!selectedVersion) return;
        setIsRestoring(true);
        try {
            const result = await restoreArticleVersion(articleId, selectedVersion.versionId);
            setIsConfirmOpen(false);
            if (result.warnings.length > 0) {
                setRestoreOutcome(result);
            } else {
                toast.success('文章版本已恢复');
                finishRestore(result.article);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '恢复版本失败');
        } finally {
            setIsRestoring(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-2 backdrop-blur-sm sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !isRestoring) handleClose(); }}>
                <section className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="文章历史版本">
                    <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                                <History className="h-4 w-4"/>
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-sm font-bold text-slate-800 sm:text-base">文章历史版本</h2>
                                <p className="truncate text-xs text-slate-500">{currentTitle || '未命名文章'} · 最多保留 5 个版本</p>
                            </div>
                        </div>
                        <button type="button" onClick={handleClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="关闭历史版本">
                            <X className="h-4 w-4"/>
                        </button>
                    </header>

                    {restoreOutcome && (
                        <div role="status" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-900 sm:px-6">
                            <div>
                                <p className="font-semibold">文章已恢复，以下信息未能完整还原：</p>
                                {restoreOutcome.warnings.map(warning => <p key={warning} className="mt-1">{warning}</p>)}
                            </div>
                            <button type="button" onClick={handleClose} className="rounded-lg bg-orange-500 px-3 py-2 font-semibold text-white hover:bg-orange-600">查看恢复结果</button>
                        </div>
                    )}

                    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                        <aside className="max-h-48 shrink-0 overflow-y-auto border-b border-slate-100 bg-slate-50/60 md:max-h-none md:w-72 md:border-b-0 md:border-r">
                            <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-500">
                                <span>历史记录</span>
                                <span>{versions.length}/5</span>
                            </div>
                            {isLoadingList ? (
                                <div className="flex items-center gap-2 px-4 py-6 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin"/>正在加载</div>
                            ) : versions.length === 0 ? (
                                <div className="px-4 py-5 text-xs leading-5 text-slate-500">文章保存或后台润色并产生实际变化后，才会留下历史版本。</div>
                            ) : (
                                <div className="space-y-1 px-2 pb-3">
                                    {versions.map(version => (
                                        <button
                                            key={version.versionId}
                                            type="button"
                                            onClick={() => { setSelectedVersionId(version.versionId); setShowComparison(false); }}
                                            className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedVersionId === version.versionId ? 'bg-white text-orange-700 shadow-sm ring-1 ring-orange-100' : 'text-slate-700 hover:bg-white/80'}`}
                                        >
                                            <span className="flex items-center justify-between gap-2">
                                                <span className="truncate text-xs font-semibold">{SOURCE_LABELS[version.source] || '历史版本'}</span>
                                                <span className="flex shrink-0 items-center gap-1">
                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{version.wordCount} 字</span>
                                                    {version.wordCount !== currentWordCount && (
                                                        <span className={`text-[10px] ${version.wordCount > currentWordCount ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                            {version.wordCount > currentWordCount ? '+' : ''}{version.wordCount - currentWordCount} 字
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                            <span className="mt-1 block text-[11px] text-slate-500">{formatVersionTime(version.createdAt)}</span>
                                            {version.operatorId && <span className="mt-1 block truncate text-[10px] text-slate-400">操作者：{version.operatorId}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </aside>

                        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-800">{selectedVersion?.title || (isLoadingDetail ? '正在读取版本…' : '选择一个版本')}</p>
                                    {selectedVersion && <p className="mt-0.5 text-[11px] text-slate-400">{formatVersionTime(selectedVersion.createdAt)} · {SOURCE_LABELS[selectedVersion.source] || '历史版本'}</p>}
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={!selectedVersion || isLoadingDetail}
                                        onClick={() => setShowComparison(value => !value)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <GitCompareArrows className="h-3.5 w-3.5"/>{showComparison ? '只看历史' : '对比当前'}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!selectedVersion || isLoadingDetail || isRestoring || !!restoreOutcome}
                                        onClick={() => setIsConfirmOpen(true)}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5"/>恢复此版本
                                    </button>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
                                {errorMessage && <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{errorMessage}</div>}
                                {isLoadingDetail ? (
                                    <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin"/>正在加载正文</div>
                                ) : selectedVersion ? (
                                    showComparison ? (
                                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                            <section className="min-w-0 rounded-xl border border-orange-100 bg-orange-50/30 p-3 sm:p-4">
                                                <div className="mb-3 border-b border-orange-100 pb-2 text-xs font-semibold text-orange-700">历史版本 · {selectedVersion.title}</div>
                                                <VersionMarkdown content={selectedVersion.content}/>
                                            </section>
                                            <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                                                <div className="mb-3 border-b border-slate-100 pb-2 text-xs font-semibold text-slate-600">当前内容 · {currentTitle || '未命名文章'}</div>
                                                <VersionMarkdown content={currentContent}/>
                                            </section>
                                        </div>
                                    ) : (
                                        <div className="mx-auto max-w-4xl rounded-xl border border-slate-100 bg-white p-4 sm:p-7">
                                            <VersionMarkdown content={selectedVersion.content}/>
                                        </div>
                                    )
                                ) : !errorMessage && !isLoadingList ? (
                                    <div className="flex min-h-48 items-center justify-center text-sm text-slate-400">还没有可查看的历史版本</div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <ConfirmationModal
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={handleRestore}
                isLoading={isRestoring}
                type="warning"
                title="恢复历史版本"
                confirmText="恢复版本"
                description={restoreDescription || '恢复前会先把当前已保存内容留作一个历史版本。恢复后，文章标题、正文及版本中仍有效的分类和标签会还原。'}
            />
        </>
    );
}
