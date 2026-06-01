import Article from './Article';
import {EditorHeader} from '../components/Editor/EditorHeader';
import {EditorMetaBar} from '../components/Editor/EditorMetaBar';
import {SlashMenu} from '../components/Editor/SlashMenu';
import ImageLinkModal from '../components/common/ImageLinkModal';
import VideoLinkModal from '../components/common/VideoLinkModal';
import {useEditor} from '../hooks/useEditor';
import {BubbleMenu} from '../components/Editor/BubbleMenu';
import ConfirmationModal from '../components/common/ConfirmationModal';
import {ArrowUp, Loader2, Sparkles, Wand2} from 'lucide-react';
import {useMemo} from 'react';
import {getPreviewShortcutLabel} from '../utils/keyboard';
import {useAuth} from '../contexts/AuthContext';

// 1. 优化后的星星：更加晶莹剔透
const MagicStar = ({styleClass, delay, top, left, size}: {
    styleClass: string,
    delay: string,
    top: string,
    left: string,
    size: number
}) => (
    <div className={`pointer-events-none absolute z-20 animate-magic-sparkle ${styleClass}`}
         style={{top, left, animationDelay: delay}}>
        <svg
            style={{filter: 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.8))'}} // 纯白高亮发光
            fill="none"
            viewBox="0 0 68 68"
            height={size}
            width={size}
        >
            <path
                fill="white"
                d="M26.5 25.5C19.0043 33.3697 0 34 0 34C0 34 19.1013 35.3684 26.5 43.5C33.234 50.901 34 68 34 68C34 68 36.9884 50.7065 44.5 43.5C51.6431 36.647 68 34 68 34C68 34 51.6947 32.0939 44.5 25.5C36.5605 18.2235 34 0 34 0C34 0 33.6591 17.9837 26.5 25.5Z"
            />
        </svg>
    </div>
);

// 2. 重做后的流星：头部是发光粒子，尾巴是极细的渐变，模拟“彗星”划过
const ShootingStar = ({delay, top, left}: { delay: string, top: string, left: string }) => (
    <div
        className="absolute z-10 animate-shooting-star opacity-0"
        style={{top, left, animationDelay: delay}}
    >
        {/* 头部：高亮粒子 */}
        <div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-[3px] bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,1)]"/>
        {/* 尾巴：极细，带一点点紫色的拖尾，长度适中 */}
        <div className="w-[60px] h-[1px] bg-gradient-to-r from-transparent via-purple-300 to-white opacity-80"/>
    </div>
);

const AiContinueBox = ({
    isOpen,
    position,
    value,
    onChange,
    onSubmit,
    onClose,
    isLoading
}: {
    isOpen: boolean;
    position: { top: number; left: number };
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onClose: () => void;
    isLoading: boolean;
}) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed z-[70] w-[min(720px,calc(100vw-32px))] rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5 animate-in fade-in zoom-in-95 duration-150"
            style={{
                top: Math.min(position.top, window.innerHeight - 120),
                left: position.left
            }}
        >
            <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                    <Wand2 className="h-5 w-5"/>
                </div>
                <input
                    autoFocus
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSubmit();
                        }
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            onClose();
                        }
                    }}
                    placeholder="使用 AI 编辑（@ 提醒以使用技能）"
                    className="min-w-0 flex-1 border-none bg-transparent text-base font-medium text-slate-700 outline-none placeholder:text-slate-400 focus:ring-0"
                    disabled={isLoading}
                />
                <button
                    onClick={onSubmit}
                    disabled={isLoading}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-300 text-white transition-colors hover:bg-orange-500 disabled:cursor-wait disabled:bg-slate-300"
                    title="提交 AI 续写"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <ArrowUp className="h-4 w-4"/>}
                </button>
            </div>
        </div>
    );
};

export default function EditorPage() {
    const { userInfo } = useAuth();
    const currentAuthor = userInfo?.nickname || userInfo?.username || '';

    const {
        textareaRef, fileInputRef, attachmentInputRef,
        title, setTitle,
        content,
        category, setCategory,
        categories, loadingCategories,
        parentArticle, setParentArticle,
        parentArticles, loadingParentArticles,
        tags, onAddTag, onRemoveTag,
        attachments, onAttachmentUpload, onRemoveAttachment,
        isSaving, onSave,
        isPreviewMode, onTogglePreview, onBack,
        isUploadingAttachment,
        isImageLinkModalOpen, onImageLinkConfirm, onImageLinkCancel,
        isVideoLinkModalOpen, onVideoLinkConfirm, onVideoLinkCancel,
        showMenu, menuPosition, commands, selectedIndex, setSelectedIndex, onExecuteCommand,
        onImageUpload, onTextChange, onKeyDown, onPaste,
        showBubbleMenu,
        bubbleMenuPosition,
        showAiLineHint,
        aiLineHintPosition,
        isAiContinueOpen,
        aiContinuePosition,
        aiContinuePrompt,
        setAiContinuePrompt,
        isAiContinuing,
        handleSelectionChange,
        applyFormat,
        onTextAreaFocus,
        onTextAreaScroll,
        onCloseAiContinue,
        onSubmitAiContinue,
        isGeneratingTags,
        onGenerateTags,
        isGeneratingTitle,
        onGenerateTitle,
        // AI Polishing
        isPolishing,
        onPolish,
        isPolishConfirmOpen,
        onPolishConfirm,
        onPolishCancel
    } = useEditor();

    const todayStr = new Date().toLocaleDateString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).replace(/\//g, '-');
    const previewShortcutLabel = getPreviewShortcutLabel();

    // 星星数据
    const stars = useMemo(() => {
        return [...Array(25)].map((_, i) => ({
            id: i,
            size: Math.random() * 6 + 3, // 稍微小一点，更精致
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            delay: `${Math.random() * 3}s`
        }));
    }, []);

    // 流星数据
    const shootingStars = useMemo(() => {
        return [...Array(5)].map((_, i) => ({
            id: i,
            top: `${Math.random() * 60}%`, // 主要在上半部分划过
            left: `${Math.random() * 80}%`,
            delay: `${Math.random() * 6}s`
        }));
    }, []);

    return (
        <div className="h-screen flex flex-col bg-slate-50 font-sans overflow-hidden">
            <style>{`
                /* 慢速旋转 */
                @keyframes rotate-slow {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                /* 反向旋转 */
                @keyframes rotate-reverse {
                    0% { transform: rotate(360deg); }
                    100% { transform: rotate(0deg); }
                }
                /* 星星呼吸闪烁 */
                @keyframes magic-sparkle {
                    0%, 100% { opacity: 0; transform: scale(0.2); }
                    50% { opacity: 1; transform: scale(1); filter: drop-shadow(0 0 5px white); }
                }
                /* 流星划过：速度更快，路径更倾斜 */
                @keyframes shooting-star {
                    0% { transform: translateX(0) translateY(0) rotate(-35deg) scaleX(0.5); opacity: 0; }
                    10% { opacity: 1; transform: translateX(50px) translateY(35px) rotate(-35deg) scaleX(1); }
                    100% { transform: translateX(250px) translateY(175px) rotate(-35deg) scaleX(0.5); opacity: 0; }
                }
                /* 核心呼吸 */
                @keyframes core-pulse {
                    0%, 100% { box-shadow: 0 0 20px rgba(168, 85, 247, 0.2); transform: scale(1); }
                    50% { box-shadow: 0 0 50px rgba(168, 85, 247, 0.6); transform: scale(1.05); }
                }
                /* 能量汇聚线条 */
                @keyframes dash {
                    to { stroke-dashoffset: 0; }
                }

                .magic-flow-bg {
                    background: conic-gradient(from 0deg, #020617 0deg, #1e1b4b 90deg, #020617 180deg, #2e1065 270deg, #020617 360deg);
                    animation: rotate-slow 20s linear infinite;
                }
            `}</style>

            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onImageUpload}/>
            <input type="file" ref={attachmentInputRef} className="hidden" multiple onChange={onAttachmentUpload}/>

            <EditorHeader
                title={title} setTitle={setTitle} isSaving={isSaving} onSave={onSave}
                isPreviewMode={isPreviewMode} onTogglePreview={onTogglePreview} onBack={onBack}
                isGeneratingTitle={isGeneratingTitle} onGenerateTitle={onGenerateTitle}
                isPolishing={isPolishing} onPolish={onPolish}
            />

            <div className="flex-1 relative w-full overflow-hidden">

                <div
                    className={`absolute inset-0 p-4 sm:p-6 lg:px-8 flex flex-col items-center transition-opacity duration-200 ${isPreviewMode ? 'opacity-0 pointer-events-none z-0' : 'opacity-100 z-10'}`}>

                    <div className={`w-full max-w-5xl h-full rounded-xl relative flex flex-col overflow-hidden transition-all duration-500
                        ${isPolishing ? 'transform scale-[1.002] z-50 shadow-[0_0_60px_rgba(0,0,0,0.3)]' : 'border border-slate-200 shadow-sm'}
                    `}>

                        {/* 🌟 1. 魔法背景层 */}
                        {isPolishing && (
                            <div className="absolute inset-0 overflow-hidden rounded-xl bg-slate-950">
                                {/* 深邃星云背景 */}
                                <div className="absolute inset-[-50%] magic-flow-bg opacity-60 blur-3xl"/>
                                <div className="absolute inset-0 bg-slate-950/70"/>
                                {/* 压暗一层，突出光效 */}

                                {/* 闪烁的星星 */}
                                {stars.map(star => (
                                    <MagicStar key={star.id} styleClass="" size={star.size} top={star.top}
                                               left={star.left} delay={star.delay}/>
                                ))}

                                {/* 划过的流星 */}
                                {shootingStars.map(star => (
                                    <ShootingStar key={`shot-${star.id}`} top={star.top} left={star.left}
                                                  delay={star.delay}/>
                                ))}
                            </div>
                        )}

                        <div
                            className={`flex-1 w-full h-full rounded-[10px] flex flex-col relative overflow-hidden z-10 transition-colors duration-500 ${isPolishing ? 'bg-transparent' : 'bg-white'}`}>

                            {/* 🌟 2. 核心遮罩 (Center Core) - 完全重构 */}
                            {isPolishing && (
                                <div
                                    className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none">

                                    {/* 核心能量体结构 */}
                                    <div className="relative mb-10 w-32 h-32 flex items-center justify-center">

                                        {/* 外层光环 1: 细虚线旋转 */}
                                        <div
                                            className="absolute inset-0 rounded-full border border-dashed border-purple-500/30 animate-[rotate-slow_10s_linear_infinite]"/>

                                        {/* 外层光环 2: 略小一点的反向旋转 */}
                                        <div
                                            className="absolute inset-2 rounded-full border-[1px] border-indigo-400/20 animate-[rotate-reverse_8s_linear_infinite]"/>

                                        {/* 能量汇聚环: 模拟能量流入 */}
                                        <svg
                                            className="absolute inset-0 w-full h-full animate-[rotate-slow_4s_linear_infinite] opacity-60">
                                            <circle cx="64" cy="64" r="30" fill="none" stroke="url(#gradient-ring)"
                                                    strokeWidth="2" strokeDasharray="20 100" strokeLinecap="round"/>
                                            <defs>
                                                <linearGradient id="gradient-ring" x1="0%" y1="0%" x2="100%" y2="0%">
                                                    <stop offset="0%" stopColor="#a855f7"/>
                                                    <stop offset="100%" stopColor="#e879f9"/>
                                                </linearGradient>
                                            </defs>
                                        </svg>

                                        {/* 核心发光本体：去掉实心背景，保留光晕 */}
                                        <div className="relative flex items-center justify-center z-10">
                                            {/* 强烈的背光 */}
                                            <div
                                                className="absolute inset-[-10px] bg-purple-500/20 rounded-full blur-xl animate-pulse"/>

                                            {/* 中心图标：纯净的白色带光晕 */}
                                            <Sparkles
                                                className="w-12 h-12 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.9)] animate-pulse"
                                                style={{animationDuration: '2s'}}
                                            />

                                            {/* 装饰性小星 */}
                                            <Sparkles
                                                className="absolute -top-4 -right-4 w-5 h-5 text-purple-200 animate-bounce"
                                                style={{animationDuration: '3s'}}/>
                                            <Loader2
                                                className="absolute inset-[-40px] w-[calc(100%+80px)] h-[calc(100%+80px)] text-purple-500/10 animate-[rotate-slow_3s_linear_infinite]"/>
                                        </div>
                                    </div>

                                    {/* 文字部分 */}
                                    <div className="text-center space-y-3 z-10">
                                        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-100 to-white tracking-[0.2em] drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                                            AI 施法中
                                        </h2>
                                        <div
                                            className="flex items-center justify-center gap-2 text-indigo-200/60 text-xs font-medium tracking-[0.3em] uppercase">
                                            <span className="w-8 h-[1px] bg-indigo-500/50"></span>
                                            <span>Weaving Magic</span>
                                            <span className="w-8 h-[1px] bg-indigo-500/50"></span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Meta Bar - 润色时隐藏 */}
                            <div
                                className={`transition-all duration-500 ${isPolishing ? 'opacity-0 translate-y-[-10px]' : 'opacity-100 translate-y-0'} relative z-20`}>
                                <EditorMetaBar
                                    category={category} setCategory={setCategory} categories={categories}
                                    loadingCategories={loadingCategories}
                                    parentArticle={parentArticle} setParentArticle={setParentArticle}
                                    parentArticles={parentArticles} loadingParentArticles={loadingParentArticles}
                                    tags={tags} onAddTag={onAddTag} onRemoveTag={onRemoveTag}
                                    attachments={attachments} onUploadClick={() => attachmentInputRef.current?.click()}
                                    onRemoveAttachment={onRemoveAttachment}
                                    isUploadingAttachment={isUploadingAttachment} isGeneratingTags={isGeneratingTags}
                                    onGenerateTags={onGenerateTags}
                                />
                            </div>

                            {/* Textarea - 润色时完全隐去 */}
                            <textarea
                                ref={textareaRef}
                                value={content}
                                onChange={onTextChange}
                                onKeyDown={onKeyDown}
                                onPaste={onPaste}
                                onFocus={onTextAreaFocus}
                                onScroll={onTextAreaScroll}
                                onSelect={handleSelectionChange}
                                onMouseUp={handleSelectionChange}
                                onKeyUp={(e) => {
                                    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Shift'].includes(e.key)) handleSelectionChange();
                                }}
                                readOnly={isPolishing}
                                className={`editor-writing-text flex-1 w-full max-w-4xl mx-auto px-6 py-7 sm:px-12 sm:py-9 resize-none outline-none bg-transparent text-[#2c3e50] text-[17px] sm:text-[18px] leading-[1.75] caret-orange-500 placeholder:text-slate-300 selection:bg-orange-100 selection:text-orange-950 overflow-y-auto transition-all duration-700
                                    ${isPolishing ? 'opacity-0 blur-xl scale-95' : 'opacity-100 blur-0 scale-100'}
                                `}
                                placeholder="输入 / 呼出命令菜单，支持粘贴图片..."
                                spellCheck={false}
                                autoFocus
                            />

                            {showAiLineHint && !showMenu && !isAiContinueOpen && (
                                <div
                                    className="pointer-events-none fixed z-30 text-[17px] sm:text-[18px] leading-none text-slate-400/80"
                                    style={{
                                        top: aiLineHintPosition.top + 4,
                                        left: aiLineHintPosition.left
                                    }}
                                >
                                    按 space（空格）以启用 AI，按“/”启用命令，{previewShortcutLabel} 预览
                                </div>
                            )}

                            <AiContinueBox
                                isOpen={isAiContinueOpen}
                                position={aiContinuePosition}
                                value={aiContinuePrompt}
                                onChange={setAiContinuePrompt}
                                onSubmit={onSubmitAiContinue}
                                onClose={onCloseAiContinue}
                                isLoading={isAiContinuing}
                            />

                            <SlashMenu isOpen={showMenu} position={menuPosition} commands={commands}
                                       selectedIndex={selectedIndex} onSelect={onExecuteCommand}
                                       setSelectedIndex={setSelectedIndex}/>
                            <BubbleMenu isOpen={showBubbleMenu} position={bubbleMenuPosition} onFormat={applyFormat}/>

                            <div
                                className={`h-8 border-t border-slate-50 flex items-center justify-center text-[10px] text-slate-400 bg-white shrink-0 z-20 transition-all duration-500 ${isPolishing ? 'opacity-0' : 'opacity-100'}`}>
                                Markdown 编辑模式 · 字数 {content.length}
                            </div>
                        </div>
                    </div>
                </div>

                <div id="preview-scroll-container"
                     className={`absolute inset-0 overflow-y-auto bg-slate-50 transition-opacity duration-200 ${isPreviewMode ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
                    <div className="max-w-5xl mx-auto py-8 sm:px-6 lg:px-8 min-h-full">
                        <Article isEmbedded={true} content={content} scrollContainerId="preview-scroll-container"
                                 title={title} category={category?.name || ''} tags={tags} date={todayStr}
                                 attachments={attachments}
                                 authorName={currentAuthor}/>
                    </div>
                </div>
            </div>

            <ImageLinkModal isOpen={isImageLinkModalOpen} onClose={onImageLinkCancel} onConfirm={onImageLinkConfirm}/>
            <VideoLinkModal isOpen={isVideoLinkModalOpen} onClose={onVideoLinkCancel} onConfirm={onVideoLinkConfirm}/>
            <ConfirmationModal
                isOpen={isPolishConfirmOpen} onClose={onPolishCancel} onConfirm={onPolishConfirm}
                title="✨AI 润色"
                description={<div className="space-y-2"><p>AI 魔法将为您润色文章。</p></div>}
                confirmText="开始润色" cancelText="取消"
            />
        </div>
    );
}
