import {useRef, useState} from 'react';
import {toBlob} from 'html-to-image';
import {Check, Copy, Download, X} from 'lucide-react';
import type {MemoItem} from '../../types/api/memo';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {ClassicPosterCards} from './posterStyles/ClassicPosterCards';
import {ExtendedPosterCards} from './posterStyles/ExtendedPosterCards';
import {
    formatPosterDate,
    posterStyles,
    type PosterStyleId,
} from './posterStyles/posterShared';

export type {PosterStyleId};

const CLASSIC_STYLE_IDS = new Set<PosterStyleId>([
    'stamp',
    'receipt',
    'polaroid',
    'magazine',
    'journal',
]);

export default function MemoShareModal({
    memo,
    author,
    onClose,
}: {
    memo: MemoItem;
    author: string;
    onClose: () => void;
}) {
    const [currentStyle, setCurrentStyle] = useState<PosterStyleId>('stamp');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const posterRef = useRef<HTMLDivElement>(null);

    useEscapeDismissal(true, () => {
        if (!busy) onClose();
    });

    const generateBlob = async (): Promise<Blob> => {
        if (!posterRef.current) throw new Error('海报元素未准备就绪');
        if (document.fonts?.ready) {
            await document.fonts.ready;
        }
        const blob = await toBlob(posterRef.current, {pixelRatio: 2, cacheBust: true});
        if (!blob) throw new Error('无法生成海报图片');
        return blob;
    };

    const download = async () => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const blob = await generateBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `memo-${currentStyle}-${memo.memoId}.png`;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch {
            setError('海报生成失败，请重试。内容过长时可尝试缩短后再生成。');
        } finally {
            setBusy(false);
        }
    };

    const copyImage = async () => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const blob = await generateBlob();
            if (navigator.clipboard?.write && window.ClipboardItem) {
                await navigator.clipboard.write([
                    new ClipboardItem({[blob.type]: blob}),
                ]);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2200);
            } else {
                throw new Error('当前浏览器暂不支持直接复制图片，请使用“下载海报”');
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '';
            setError(message || '复制图片失败，请使用“下载海报”保存');
        } finally {
            setBusy(false);
        }
    };

    const dateInfo = formatPosterDate(memo.createdAt);
    const activeMeta = posterStyles.find((s) => s.id === currentStyle) || posterStyles[0];
    const contentLength = memo.content?.length || 0;
    const isShort = contentLength <= 90;

    return (
        <div
            data-modal-scroll-lock
            className="fixed inset-0 z-[115] flex items-center justify-center p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="memo-share-title"
        >
            {/* 背景遮罩 */}
            <div
                className="absolute inset-0 bg-slate-950/50 backdrop-blur-xs transition-opacity"
                onClick={() => {
                    if (!busy) onClose();
                }}
            />

            {/* 模态框容器 */}
            <div className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
                {/* 顶部标题栏 */}
                <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 sm:px-6">
                    <div>
                        <h2 id="memo-share-title" className="text-lg font-bold text-slate-900">
                            分享闪念海报
                        </h2>
                        <p className="text-xs text-slate-500">
                            精选 10 款不同形态的高质感卡片设计，直接复制或保存
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label="关闭"
                        disabled={busy}
                        onClick={onClose}
                        className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                {/* 样式选择与卡片预览区域 */}
                <div className="no-scrollbar overflow-y-auto bg-gradient-to-b from-slate-100 to-slate-200/70 p-4 sm:p-6">
                    {/* 10 款样式切换器（桌面端 2 行 x 5 列整齐排布） */}
                    <div
                        className="mx-auto mb-5 grid max-w-[540px] grid-cols-2 gap-2 sm:grid-cols-5"
                        role="group"
                        aria-label="海报版式选择"
                    >
                        {posterStyles.map((item) => {
                            const Icon = item.icon;
                            const active = currentStyle === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setCurrentStyle(item.id)}
                                    className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                                        active
                                            ? 'border-orange-500 bg-white text-orange-700 shadow-sm ring-2 ring-orange-500/20'
                                            : 'border-slate-200/90 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white'
                                    }`}
                                >
                                    <Icon
                                        className={`h-3.5 w-3.5 shrink-0 ${
                                            active ? 'text-orange-500' : 'text-slate-400'
                                        }`}
                                    />
                                    <span>{item.name}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* 卡片预览容器（html-to-image 截图目标） */}
                    <div className="flex justify-center p-1 sm:p-2">
                        <div
                            ref={posterRef}
                            className="w-full max-w-[440px] transition-all duration-200"
                        >
                            {CLASSIC_STYLE_IDS.has(currentStyle) ? (
                                <ClassicPosterCards
                                    styleId={
                                        currentStyle as
                                            | 'stamp'
                                            | 'receipt'
                                            | 'polaroid'
                                            | 'magazine'
                                            | 'journal'
                                    }
                                    memo={memo}
                                    author={author}
                                    dateInfo={dateInfo}
                                    isShort={isShort}
                                    contentLength={contentLength}
                                />
                            ) : (
                                <ExtendedPosterCards
                                    styleId={
                                        currentStyle as
                                            | 'boarding'
                                            | 'museum'
                                            | 'vinyl'
                                            | 'shiori'
                                            | 'herbarium'
                                    }
                                    memo={memo}
                                    author={author}
                                    dateInfo={dateInfo}
                                    isShort={isShort}
                                    contentLength={contentLength}
                                />
                            )}
                        </div>
                    </div>

                    <p className="mx-auto mt-3 max-w-[440px] text-center text-xs text-slate-400">
                        当前版式：<strong className="text-slate-700">{activeMeta.name}</strong>（
                        {activeMeta.tagline}）
                    </p>
                </div>

                {/* 底部操作栏 */}
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
                    <div className="text-xs text-slate-500">
                        {error ? (
                            <span role="alert" className="font-medium text-red-600">
                                {error}
                            </span>
                        ) : copied ? (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                                <Check className="h-4 w-4 shrink-0" /> 已复制海报图片到剪贴板！
                            </span>
                        ) : (
                            <span>支持一键复制到剪贴板，或下载 2x 高清 PNG 图片</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={copyImage}
                            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                        >
                            {copied ? (
                                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                            ) : (
                                <Copy className="h-4 w-4 shrink-0 text-slate-500" />
                            )}
                            {copied ? '已复制' : '复制海报'}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={download}
                            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50"
                        >
                            <Download className="h-4 w-4 shrink-0" />
                            {busy ? '正在生成…' : '下载海报'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
