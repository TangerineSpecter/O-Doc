import {useRef, useState} from 'react';
import {toBlob} from 'html-to-image';
import {
    BookOpen,
    Camera,
    Check,
    Copy,
    Download,
    FileText,
    Mail,
    Paperclip,
    Receipt,
    Sun,
    X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {MemoItem} from '../../types/api/memo';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {OrangeFruitIcon} from '../common/OrangeFruitIcon';

export type PosterStyleId = 'stamp' | 'receipt' | 'polaroid' | 'magazine' | 'journal';

interface PosterStyleMeta {
    id: PosterStyleId;
    name: string;
    tagline: string;
    icon: typeof Mail;
}

const posterStyles: PosterStyleMeta[] = [
    {id: 'stamp', name: '复古邮票', tagline: '航空邮戳 · 信笺明信片', icon: Mail},
    {id: 'receipt', name: '灵感小票', tagline: '热敏小票 · 极客条形码', icon: Receipt},
    {id: 'polaroid', name: '拍立得', tagline: '胶片快照 · 和纸胶带', icon: Camera},
    {id: 'magazine', name: '杂志大刊', tagline: '独立文摘 · 极简黑曜石', icon: BookOpen},
    {id: 'journal', name: '手账便签', tagline: '活页方格 · 复古火漆印', icon: FileText},
];

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
        } catch (err: any) {
            setError(err?.message || '复制图片失败，请使用“下载海报”保存');
        } finally {
            setBusy(false);
        }
    };

    // 格式化日期信息
    const date = new Date(memo.createdAt);
    const isValidDate = !Number.isNaN(date.getTime());
    const dayNum = isValidDate ? String(date.getDate()).padStart(2, '0') : '--';
    const monthNum = isValidDate ? String(date.getMonth() + 1).padStart(2, '0') : '--';
    const yearNum = isValidDate ? String(date.getFullYear()) : '----';
    const weekdayName = isValidDate ? date.toLocaleDateString('zh-CN', {weekday: 'short'}) : '';
    const timeStr = isValidDate
        ? date.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false})
        : '12:00';

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
                            精选 5 款不同视觉形态的海报版式，直接复制或保存
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label="关闭"
                        disabled={busy}
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                {/* 样式选择与卡片预览区域 */}
                <div className="no-scrollbar overflow-y-auto bg-gradient-to-b from-slate-100 to-slate-200/70 p-4 sm:p-6">
                    {/* 样式切换器 */}
                    <div
                        className="mx-auto mb-5 flex max-w-[480px] flex-wrap items-center justify-center gap-2"
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
                                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
                                        active
                                            ? 'border-orange-500 bg-white text-orange-700 shadow-sm ring-2 ring-orange-500/20'
                                            : 'border-slate-200/90 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white'
                                    }`}
                                >
                                    <Icon className={`h-3.5 w-3.5 ${active ? 'text-orange-500' : 'text-slate-400'}`} />
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
                            {/* 样式 1: 复古邮票明信片 */}
                            {currentStyle === 'stamp' && (
                                <div className="relative overflow-hidden rounded-3xl border-2 border-[#D8C9B0] bg-[#FBF8F1] p-6 text-[#2C241E] shadow-xl sm:p-7">
                                    {/* 航空信封红蓝条纹装饰 */}
                                    <div
                                        className="mb-4 h-2 w-full rounded-full opacity-85"
                                        style={{
                                            background:
                                                'repeating-linear-gradient(135deg, #c2410c 0px, #c2410c 12px, #fbf8f1 12px, #fbf8f1 18px, #1d4ed8 18px, #1d4ed8 30px, #fbf8f1 30px, #fbf8f1 36px)',
                                        }}
                                    />

                                    {/* 顶部：航空标与邮票/邮戳 */}
                                    <div className="relative flex items-start justify-between gap-3 border-b-2 border-dashed border-[#D5C6AC] pb-4">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="inline-flex items-center gap-1.5 rounded border border-[#1D4ED8]/40 bg-[#1D4ED8]/5 px-2 py-0.5 text-[11px] font-black tracking-widest text-[#1D4ED8]">
                                                <span>✈</span>
                                                <span>PAR AVION · 航空明信片</span>
                                            </div>
                                            <span className="text-[10px] font-mono text-[#8C7A68]">
                                                POST CARD NO. {yearNum}{monthNum}{dayNum}
                                            </span>
                                            <div className="flex items-center gap-1 text-xs font-semibold text-[#5C4A3A]">
                                                <span>{yearNum}年{monthNum}月{dayNum}日</span>
                                                <span>·</span>
                                                <span>{weekdayName}</span>
                                            </div>
                                        </div>

                                        {/* 邮票与盖戳区域 */}
                                        <div className="relative shrink-0">
                                            {/* 实体邮票 */}
                                            <div className="flex h-20 w-16 rotate-2 flex-col items-center justify-between rounded border-2 border-dashed border-amber-800/40 bg-[#FFF7ED] p-1.5 shadow-2xs">
                                                <span className="text-[8px] font-bold tracking-tight text-amber-900/80">
                                                    小橘快邮
                                                </span>
                                                <OrangeFruitIcon className="h-6 w-6" />
                                                <span className="font-mono text-[9px] font-extrabold text-amber-900">
                                                    ¥ 1.20
                                                </span>
                                            </div>

                                            {/* 复古波浪邮戳 */}
                                            <div className="pointer-events-none absolute -left-8 -top-2 flex h-20 w-20 -rotate-12 flex-col items-center justify-center rounded-full border-2 border-[#1E3A8A]/75 p-0.5 text-center text-[#1E3A8A]">
                                                <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-dashed border-[#1E3A8A]/50">
                                                    <span className="text-[8px] font-black tracking-widest opacity-85">
                                                        ODOC POST
                                                    </span>
                                                    <span className="text-[9px] font-black">
                                                        {monthNum}.{dayNum}
                                                    </span>
                                                    <span className="text-[7px] font-semibold opacity-75">
                                                        SHANGHAI
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 正文区域 */}
                                    <div className="py-6 sm:py-7">
                                        <div className="mb-2 text-xs font-serif italic text-amber-900/60">
                                            致 心中的灵感：
                                        </div>
                                        <div
                                            className={`font-serif leading-relaxed text-[#2C241E] break-words ${
                                                isShort ? 'text-lg sm:text-xl font-medium sm:leading-loose' : 'text-sm sm:text-base'
                                            }`}
                                        >
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    p: ({children}) => <p className="mb-3.5 last:mb-0 whitespace-pre-line">{children}</p>,
                                                    blockquote: ({children}) => (
                                                        <blockquote className="my-2 border-l-2 border-amber-700/40 pl-3 italic text-amber-950/80">
                                                            {children}
                                                        </blockquote>
                                                    ),
                                                }}
                                            >
                                                {memo.content}
                                            </ReactMarkdown>
                                        </div>

                                        {memo.tag && (
                                            <div className="mt-5 flex items-center gap-1.5 text-xs text-[#8A5B36]">
                                                <span className="rounded border border-[#8A5B36]/30 bg-[#F2E8D5] px-2.5 py-0.5 font-mono text-[11px] font-semibold">
                                                    [ 邮包分类: #{memo.tag} ]
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* 底部邮资印章与寄件人 */}
                                    <div className="flex items-end justify-between border-t border-[#E3D6C1] pt-4 text-xs">
                                        <div className="flex flex-col text-left">
                                            <span className="text-[10px] text-[#8C7A68]">寄件人 (SENDER)</span>
                                            <span className="font-serif font-bold text-[#2C241E]">
                                                {author || '小橘用户'} · 小橘文档
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-end text-right">
                                            <span className="rounded border border-[#1D4ED8]/30 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#1D4ED8]">
                                                POSTAGE PAID
                                            </span>
                                            <span className="mt-1 text-[10px] text-[#8C7A68]">
                                                投递至 · 浩瀚星河
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 样式 2: 灵感小票 (Thermal Receipt) */}
                            {currentStyle === 'receipt' && (
                                <div className="relative overflow-hidden bg-[#F8F9FA] px-6 py-6 font-mono text-slate-800 shadow-2xl sm:px-8">
                                    {/* 顶部撕纸锯齿 */}
                                    <div className="absolute inset-x-0 top-0 flex h-2.5 overflow-hidden">
                                        {Array.from({length: 26}).map((_, i) => (
                                            <div
                                                key={i}
                                                className="h-3 w-4 shrink-0 -translate-y-1.5 rotate-45 border border-slate-300 bg-slate-100"
                                            />
                                        ))}
                                    </div>

                                    {/* 小票头部 */}
                                    <div className="pt-2 text-center">
                                        <div className="flex items-center justify-center gap-1.5 text-xs font-bold tracking-widest text-slate-900">
                                            <OrangeFruitIcon className="h-4 w-4" />
                                            <span>小橘灵感小票</span>
                                        </div>
                                        <p className="text-[10px] tracking-wider text-slate-400">
                                            O-DOC INSPIRATION RECEIPT
                                        </p>
                                        <div className="my-3 border-b border-dashed border-slate-300" />
                                        <div className="space-y-1 text-left text-xs text-slate-600">
                                            <div className="flex justify-between">
                                                <span>单号 (ORDER):</span>
                                                <span className="font-semibold text-slate-900">
                                                    MM-{memo.memoId.slice(0, 8).toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>时间 (TIME):</span>
                                                <span>{yearNum}-{monthNum}-{dayNum} {timeStr}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>记录人 (BY):</span>
                                                <span className="font-semibold text-slate-900">{author || '用户'}</span>
                                            </div>
                                        </div>
                                        <div className="my-3 border-b border-dashed border-slate-300" />
                                    </div>

                                    {/* 小票内容区 */}
                                    <div className="py-2 text-left">
                                        <div className="mb-2 text-[10px] font-bold text-slate-400">
                                            [ 记录项目: 随想闪念 ]
                                        </div>
                                        <div
                                            className={`leading-relaxed text-slate-800 break-words ${
                                                isShort ? 'text-base font-semibold' : 'text-sm'
                                            }`}
                                        >
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    p: ({children}) => <p className="mb-3 last:mb-0 whitespace-pre-line">{children}</p>,
                                                    code: ({children}) => (
                                                        <code className="bg-slate-200 px-1 py-0.5 rounded text-xs">{children}</code>
                                                    ),
                                                }}
                                            >
                                                {memo.content}
                                            </ReactMarkdown>
                                        </div>

                                        <div className="mt-4 border-b border-dashed border-slate-300 pb-3 text-xs space-y-1 text-slate-500">
                                            {memo.tag && (
                                                <div className="flex justify-between">
                                                    <span>分类 (TAG):</span>
                                                    <span className="font-semibold text-slate-700">#{memo.tag}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between">
                                                <span>字数 (QTY):</span>
                                                <span>{contentLength} 字符</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-slate-900">
                                                <span>金额 (AMOUNT):</span>
                                                <span>FREE / 无价</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 小票条形码与尾部 */}
                                    <div className="pt-2 text-center">
                                        {/* 模拟条形码 */}
                                        <div className="flex h-10 items-stretch justify-center gap-[2px] opacity-80">
                                            {[2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 2, 4, 1, 2, 3, 1, 2, 4, 1, 3].map((w, i) => (
                                                <div
                                                    key={i}
                                                    className="bg-slate-900"
                                                    style={{width: `${w}px`}}
                                                />
                                            ))}
                                        </div>
                                        <span className="mt-1 block text-[10px] tracking-[0.25em] text-slate-400">
                                            * {yearNum}{monthNum}{dayNum} *
                                        </span>
                                        <p className="mt-2 text-[10px] text-slate-400">
                                            *** 灵感闪烁 · 感谢您记录此刻想法 ***
                                        </p>
                                    </div>

                                    {/* 底部撕纸锯齿 */}
                                    <div className="absolute inset-x-0 bottom-0 flex h-2.5 overflow-hidden">
                                        {Array.from({length: 26}).map((_, i) => (
                                            <div
                                                key={i}
                                                className="h-3 w-4 shrink-0 translate-y-1.5 rotate-45 border border-slate-300 bg-slate-100"
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 样式 3: 拍立得快照 (Polaroid Snapshot) */}
                            {currentStyle === 'polaroid' && (
                                <div className="relative max-w-[430px] rounded-2xl bg-white p-4 pb-8 shadow-2xl sm:p-5 sm:pb-9">
                                    {/* 顶部中央和纸胶带 */}
                                    <div className="absolute -top-3 left-1/2 z-20 h-6 w-28 -translate-x-1/2 -rotate-1 rounded-xs border-x border-dashed border-amber-400/50 bg-amber-300/80 shadow-xs backdrop-blur-xs" />

                                    {/* 拍立得照片区域 */}
                                    <div className="relative flex min-h-[300px] flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 text-slate-100 shadow-inner">
                                        {/* 照片顶部信息 */}
                                        <div className="flex items-center justify-between text-xs text-slate-300">
                                            <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                                <span>REC</span>
                                                <span className="opacity-50">|</span>
                                                <span>O-DOC SNAP</span>
                                            </div>
                                            <span className="font-mono text-[11px] text-amber-300/90">
                                                {yearNum}.{monthNum}.{dayNum} {weekdayName}
                                            </span>
                                        </div>

                                        {/* 照片内正文 */}
                                        <div className="py-6">
                                            <div
                                                className={`break-words tracking-wide leading-relaxed text-slate-100 ${
                                                    isShort ? 'text-lg sm:text-xl font-medium sm:leading-loose' : 'text-sm sm:text-base'
                                                }`}
                                            >
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        p: ({children}) => <p className="mb-3 last:mb-0 whitespace-pre-line">{children}</p>,
                                                        blockquote: ({children}) => (
                                                            <blockquote className="my-2 border-l-2 border-amber-400 pl-3 italic text-amber-200">
                                                                {children}
                                                            </blockquote>
                                                        ),
                                                    }}
                                                >
                                                    {memo.content}
                                                </ReactMarkdown>
                                            </div>

                                            {memo.tag && (
                                                <div className="mt-4">
                                                    <span className="inline-block rounded-full bg-white/15 px-3 py-0.5 text-xs font-medium text-white backdrop-blur-xs">
                                                        #{memo.tag}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* 照片内底栏 */}
                                        <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-white/10 pt-3">
                                            <span>SHUTTER 1/250 · ISO 400</span>
                                            <span>MEMOS FLASH</span>
                                        </div>
                                    </div>

                                    {/* 拍立得下方宽边（签名栏） */}
                                    <div className="mt-4 flex items-end justify-between px-2 pt-2 text-xs">
                                        <div className="flex flex-col text-left">
                                            <span className="text-[10px] font-serif text-slate-400">记录签名</span>
                                            <span className="font-serif font-bold text-slate-800 text-sm">
                                                ✍️ {author || '小橘用户'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-slate-500">
                                            <div className="flex gap-0.5">
                                                <span className="h-2.5 w-1 bg-cyan-500 rounded-xs" />
                                                <span className="h-2.5 w-1 bg-magenta-500 bg-pink-500 rounded-xs" />
                                                <span className="h-2.5 w-1 bg-yellow-400 rounded-xs" />
                                            </div>
                                            <span className="font-mono text-[10px] font-bold tracking-tight">
                                                INSTAX 400
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 样式 4: 杂志大刊 (Editorial Magazine) */}
                            {currentStyle === 'magazine' && (
                                <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#0A0E17] p-7 text-white shadow-2xl sm:p-9 font-sans">
                                    {/* 杂志报头 */}
                                    <div className="border-b border-slate-800 pb-4">
                                        <div className="flex items-baseline justify-between">
                                            <div className="flex items-center gap-2">
                                                <OrangeFruitIcon className="h-4 w-4" />
                                                <span className="text-sm font-black tracking-[0.25em] text-white">
                                                    ODOC ESSAY
                                                </span>
                                            </div>
                                            <div className="font-mono text-[11px] text-orange-500 font-semibold tracking-wider">
                                                VOL. {yearNum} · NO. {monthNum}
                                            </div>
                                        </div>
                                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-widest">
                                            <span>COLLECTION OF THOUGHTS</span>
                                            <span>{yearNum}.{monthNum}.{dayNum} / {weekdayName}</span>
                                        </div>
                                    </div>

                                    {/* 杂志正文引言 */}
                                    <div className="py-8">
                                        <span className="float-left mr-3 select-none font-serif text-5xl font-black leading-none text-orange-500">
                                            “
                                        </span>
                                        <div
                                            className={`break-words tracking-wide leading-relaxed text-slate-200 ${
                                                isShort ? 'text-lg sm:text-xl font-normal sm:leading-loose' : 'text-sm sm:text-base leading-relaxed'
                                            }`}
                                        >
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    p: ({children}) => <p className="mb-4 last:mb-0 whitespace-pre-line">{children}</p>,
                                                    blockquote: ({children}) => (
                                                        <blockquote className="my-3 border-l-2 border-orange-500 pl-4 italic text-slate-300">
                                                            {children}
                                                        </blockquote>
                                                    ),
                                                }}
                                            >
                                                {memo.content}
                                            </ReactMarkdown>
                                        </div>

                                        {memo.tag && (
                                            <div className="mt-6 flex items-center gap-2">
                                                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-orange-400">
                                                    SECTION // #{memo.tag}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* 杂志尾注 */}
                                    <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-[11px] text-slate-400">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] uppercase tracking-wider text-slate-400">WRITER</span>
                                            <span className="font-bold text-slate-200">
                                                {author ? author.toUpperCase() : 'ODOC USER'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-slate-400">PAGE {dayNum}</span>
                                            <div className="h-3 w-[1px] bg-slate-700" />
                                            <span className="font-semibold text-slate-300">小橘深度文摘</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 样式 5: 手账便签 (Vintage Journal / Grid Notebook) */}
                            {currentStyle === 'journal' && (
                                <div
                                    className="relative overflow-hidden rounded-3xl border border-[#E3DAC9] bg-[#FDFCF7] p-6 pl-12 text-[#2D2A26] shadow-xl sm:p-7 sm:pl-14"
                                    style={{
                                        backgroundImage: 'radial-gradient(#d8d0c2 1.2px, transparent 1.2px)',
                                        backgroundSize: '18px 18px',
                                    }}
                                >
                                    {/* 左侧活页打孔与装订红线 */}
                                    <div className="pointer-events-none absolute bottom-0 left-3.5 top-0 flex flex-col justify-around py-8">
                                        {[1, 2, 3, 4].map((i) => (
                                            <div
                                                key={i}
                                                className="h-3.5 w-3.5 rounded-full border border-slate-300/80 bg-slate-200/90 shadow-inner"
                                            />
                                        ))}
                                    </div>
                                    <div className="pointer-events-none absolute bottom-0 left-9 top-0 w-[1px] bg-rose-300/40" />

                                    {/* 右上角回形针装饰 */}
                                    <div className="absolute right-6 top-3 text-slate-400">
                                        <Paperclip className="h-5 w-5 rotate-45 opacity-60" />
                                    </div>

                                    {/* 手账头部 */}
                                    <div className="border-b border-[#E8DFC9] pb-3">
                                        <div className="flex items-center justify-between pr-8">
                                            <span className="text-xs font-bold tracking-widest text-[#8C6D4F]">
                                                MEMO JOURNAL · 日常手账
                                            </span>
                                            {/* 天气心情打勾 */}
                                            <div className="flex items-center gap-1 text-xs">
                                                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-orange-500 bg-orange-100 text-orange-600 font-bold">
                                                    <Sun className="h-3 w-3" />
                                                </span>
                                                <span className="text-slate-300">/ ⛅ / 🌧️</span>
                                            </div>
                                        </div>
                                        <div className="mt-1 flex items-baseline gap-2 font-mono text-xs text-[#7A6A58]">
                                            <span className="font-semibold text-[#3C3228]">DATE:</span>
                                            <span>{yearNum}.{monthNum}.{dayNum}</span>
                                            <span className="rounded bg-[#F0E6D2] px-1.5 py-0.2 text-[10px] font-bold text-[#8C5D35]">
                                                {weekdayName}
                                            </span>
                                        </div>
                                    </div>

                                    {/* 手账正文 */}
                                    <div className="py-5 sm:py-6">
                                        <div
                                            className={`break-words tracking-wide leading-relaxed text-[#2D2A26] ${
                                                isShort ? 'text-lg sm:text-xl font-medium sm:leading-loose' : 'text-sm sm:text-base'
                                            }`}
                                        >
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    p: ({children}) => <p className="mb-3.5 last:mb-0 whitespace-pre-line">{children}</p>,
                                                    blockquote: ({children}) => (
                                                        <blockquote className="my-2 border-l-2 border-amber-600/60 pl-3 italic text-[#5C4530]">
                                                            {children}
                                                        </blockquote>
                                                    ),
                                                }}
                                            >
                                                {memo.content}
                                            </ReactMarkdown>
                                        </div>

                                        {memo.tag && (
                                            <div className="mt-5">
                                                <span className="rounded-md border border-dashed border-[#B88E62] bg-[#FAF3E6] px-2.5 py-1 text-xs font-semibold text-[#8C5D35]">
                                                    🏷️ #{memo.tag}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* 手账底部：记录者与复古火漆印章 */}
                                    <div className="flex items-end justify-between border-t border-[#E8DFC9] pt-3 text-xs">
                                        <div className="flex flex-col text-left">
                                            <span className="text-[10px] text-[#8C7A68]">手账记录者</span>
                                            <span className="font-bold text-[#3C3228]">
                                                ✍️ {author || '小橘用户'}
                                            </span>
                                        </div>

                                        {/* 红色手账火漆印章 */}
                                        <div className="flex h-12 w-12 -rotate-6 flex-col items-center justify-center rounded-full border-2 border-red-700/80 p-0.5 text-center text-red-700 shadow-2xs">
                                            <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-dashed border-red-700/60">
                                                <span className="text-[7px] font-black tracking-tighter">小橘手账</span>
                                                <span className="text-[6px] font-bold">APPROVED</span>
                                                <span className="text-[6px] opacity-75">{yearNum}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <p className="mx-auto mt-3 max-w-[440px] text-center text-xs text-slate-400">
                        当前版式：<strong className="text-slate-700">{activeMeta.name}</strong>（{activeMeta.tagline}）
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
                                <Check className="h-4 w-4" /> 已复制海报图片到剪贴板！
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
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                        >
                            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-500" />}
                            {copied ? '已复制' : '复制海报'}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={download}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50"
                        >
                            <Download className="h-4 w-4" />
                            {busy ? '正在生成…' : '下载海报'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
