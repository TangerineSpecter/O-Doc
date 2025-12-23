import Article from './Article';
import {EditorHeader} from '../components/Editor/EditorHeader';
import {EditorMetaBar} from '../components/Editor/EditorMetaBar';
import {SlashMenu} from '../components/Editor/SlashMenu';
import ImageLinkModal from '../components/common/ImageLinkModal';
import VideoLinkModal from '../components/common/VideoLinkModal';
import {useEditor} from '../hooks/useEditor';
import {BubbleMenu} from '../components/Editor/BubbleMenu';
import ConfirmationModal from '../components/common/ConfirmationModal';
import { Sparkles } from 'lucide-react';

export default function EditorPage() {
    const {
        textareaRef, fileInputRef, attachmentInputRef,
        title, setTitle,
        content,
        category, setCategory,
        categories, loadingCategories, // 添加分类列表和加载状态
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
        handleSelectionChange,
        applyFormat,
        isGeneratingTags,
        onGenerateTags,
        isGeneratingTitle,
        onGenerateTitle,
        // AI Polish related (Updated)
        isPolishing,
        onPolish,
        isPolishConfirmOpen,
        onPolishConfirm,
        onPolishCancel
    } = useEditor();

    // 获取今日日期用于预览
    const todayStr = new Date().toLocaleDateString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).replace(/\//g, '-');

    return (
        <div className="h-screen flex flex-col bg-slate-50 font-sans overflow-hidden">
            {/* Hidden Inputs */}
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onImageUpload}/>
            <input type="file" ref={attachmentInputRef} className="hidden" multiple onChange={onAttachmentUpload}/>

            {/* Header */}
            <EditorHeader
                title={title}
                setTitle={setTitle}
                isSaving={isSaving}
                onSave={onSave}
                isPreviewMode={isPreviewMode}
                onTogglePreview={onTogglePreview}
                onBack={onBack}
                isGeneratingTitle={isGeneratingTitle}
                onGenerateTitle={onGenerateTitle}
                isPolishing={isPolishing}
                onPolish={onPolish}
            />

            {/* Main Content */}
            <div className="flex-1 relative w-full overflow-hidden">

                {/* --- Edit Mode --- */}
                <div
                    className={`absolute inset-0 p-4 sm:p-6 lg:px-8 flex flex-col items-center transition-opacity duration-200 ${isPreviewMode ? 'opacity-0 pointer-events-none z-0' : 'opacity-100 z-10'}`}>
                    <div
                        className={`w-full max-w-5xl h-full bg-white rounded-xl shadow-sm border flex flex-col relative overflow-hidden transition-all duration-300 ${isPolishing ? 'border-purple-400 shadow-[0_0_20px_rgba(192,132,252,0.3)]' : 'border-slate-200'}`}>

                        {/* Magic Overlay - Displayed when polishing */}
                        {isPolishing && (
                            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/40 backdrop-blur-sm animate-in fade-in duration-500">
                                {/* Glowing orb effect */}
                                <div className="relative">
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-orange-500 blur-xl animate-pulse opacity-70"></div>
                                    <div className="relative bg-white/90 p-4 rounded-full shadow-2xl border border-white/50">
                                        <Sparkles className="w-8 h-8 text-purple-600 animate-spin" style={{ animationDuration: '3s' }} />
                                    </div>
                                </div>
                                <div className="mt-6 space-y-2 text-center">
                                    <h3 className="text-xl font-bold bg-gradient-to-r from-purple-600 via-fuchsia-600 to-orange-600 bg-clip-text text-transparent animate-pulse">
                                        AI 正在施展魔法...
                                    </h3>
                                    <p className="text-sm text-slate-500 font-medium">正在优化文章结构与文笔</p>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-fuchsia-500 to-orange-500 opacity-50"></div>
                            </div>
                        )}

                        {/* Meta Bar */}
                        <EditorMetaBar
                            category={category}
                            setCategory={setCategory}
                            categories={categories}
                            loadingCategories={loadingCategories}
                            parentArticle={parentArticle}
                            setParentArticle={setParentArticle}
                            parentArticles={parentArticles}
                            loadingParentArticles={loadingParentArticles}
                            tags={tags}
                            onAddTag={onAddTag}
                            onRemoveTag={onRemoveTag}
                            attachments={attachments}
                            onUploadClick={() => attachmentInputRef.current?.click()}
                            onRemoveAttachment={onRemoveAttachment}
                            isUploadingAttachment={isUploadingAttachment}
                            isGeneratingTags={isGeneratingTags}
                            onGenerateTags={onGenerateTags}
                        />

                        {/* Textarea */}
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={onTextChange}
                            onKeyDown={onKeyDown}
                            onPaste={onPaste}
                            // 新增监听：选区变化
                            onSelect={handleSelectionChange}
                            onMouseUp={handleSelectionChange}
                            onKeyUp={(e) => {
                                // 移动光标时也检查选区
                                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Shift'].includes(e.key)) {
                                    handleSelectionChange();
                                }
                            }}
                            className="flex-1 w-full p-6 sm:px-12 resize-none outline-none text-slate-700 text-lg leading-relaxed selection:bg-orange-100 selection:text-orange-900 font-mono overflow-y-auto"
                            placeholder="输入 / 呼出命令菜单，支持粘贴图片..."
                            spellCheck={false}
                            autoFocus
                        />

                        {/* Slash Menu */}
                        <SlashMenu
                            isOpen={showMenu}
                            position={menuPosition}
                            commands={commands}
                            selectedIndex={selectedIndex}
                            onSelect={onExecuteCommand}
                            setSelectedIndex={setSelectedIndex}
                        />

                        {/* 新增：Bubble Menu */}
                        <BubbleMenu
                            isOpen={showBubbleMenu}
                            position={bubbleMenuPosition}
                            onFormat={applyFormat}
                        />

                        {/* Footer Status */}
                        <div
                            className="h-8 border-t border-slate-50 flex items-center justify-center text-[10px] text-slate-400 bg-white shrink-0">
                            Markdown 编辑模式 · 字数 {content.length}
                        </div>
                    </div>
                </div>

                {/* --- Preview Mode --- */}
                <div
                    id="preview-scroll-container"
                    className={`absolute inset-0 overflow-y-auto bg-slate-50 transition-opacity duration-200 ${isPreviewMode ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'}`}
                >
                    <div className="max-w-5xl mx-auto py-8 sm:px-6 lg:px-8 min-h-full">
                        <Article
                            isEmbedded={true}
                            content={content}
                            scrollContainerId="preview-scroll-container"
                            title={title}
                            category={category?.name || ''} // 支持可选分类
                            tags={tags}
                            date={todayStr}
                            attachments={attachments}
                        />
                    </div>
                </div>

            </div>

            {/* Image Link Modal */}
            <ImageLinkModal
                isOpen={isImageLinkModalOpen}
                onClose={onImageLinkCancel}
                onConfirm={onImageLinkConfirm}
            />

            {/* Video Link Modal */}
            <VideoLinkModal
                isOpen={isVideoLinkModalOpen}
                onClose={onVideoLinkCancel}
                onConfirm={onVideoLinkConfirm}
            />

            {/* AI Polish Confirmation Modal */}
            <ConfirmationModal
                isOpen={isPolishConfirmOpen}
                onClose={onPolishCancel}
                onConfirm={onPolishConfirm}
                title="确认 AI 润色"
                description={
                    <div className="space-y-2">
                        <p>AI 润色将重新生成并<span className="font-bold text-red-600">覆盖当前编辑器中的所有内容</span>。</p>
                        <p>此操作不可撤销，建议您先保存当前版本。</p>
                        <p>确定要继续吗？</p>
                    </div>
                }
                confirmText="开始施法"
                cancelText="再想想"
                type="warning"
            />
        </div>
    );
}