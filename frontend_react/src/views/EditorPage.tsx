import Article from './Article';
import { EditorHeader } from '../components/Editor/EditorHeader';
import { EditorMetaBar } from '../components/Editor/EditorMetaBar';
import { SlashMenu } from '../components/Editor/SlashMenu';
import ImageLinkModal from '../components/common/ImageLinkModal';
import VideoLinkModal from '../components/common/VideoLinkModal';
import { useEditor } from '../hooks/useEditor';

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
        onImageUpload, onTextChange, onKeyDown, onPaste
    } = useEditor();

    // 获取今日日期用于预览
    const todayStr = new Date().toLocaleDateString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).replace(/\//g, '-');

    return (
        <div className="h-screen flex flex-col bg-slate-50 font-sans overflow-hidden">
            {/* Hidden Inputs */}
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onImageUpload} />
            <input type="file" ref={attachmentInputRef} className="hidden" multiple onChange={onAttachmentUpload} />

            {/* Header */}
            <EditorHeader
                title={title}
                setTitle={setTitle}
                isSaving={isSaving}
                onSave={onSave}
                isPreviewMode={isPreviewMode}
                onTogglePreview={onTogglePreview}
                onBack={onBack}
            />

            {/* Main Content */}
            <div className="flex-1 relative w-full overflow-hidden">

                {/* --- Edit Mode --- */}
                <div className={`absolute inset-0 p-4 sm:p-6 lg:px-8 flex flex-col items-center transition-opacity duration-200 ${isPreviewMode ? 'opacity-0 pointer-events-none z-0' : 'opacity-100 z-10'}`}>
                    <div className="w-full max-w-5xl h-full bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col relative overflow-hidden">

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
                        />

                        {/* Textarea */}
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={onTextChange}
                            onKeyDown={onKeyDown}
                            onPaste={onPaste}
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

                        {/* Footer Status */}
                        <div className="h-8 border-t border-slate-50 flex items-center justify-center text-[10px] text-slate-400 bg-white shrink-0">
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
        </div>
    );
}