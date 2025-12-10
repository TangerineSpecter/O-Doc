import {useEffect, useRef, useState} from 'react';
import {useNavigate, useLocation, useParams} from 'react-router-dom';
import {CommandItem} from '../components/Editor/SlashMenu';
import {AttachmentItem, Category, ParentArticleItem} from '../components/Editor/EditorMetaBar';
import {createArticle, updateArticle, getArticlesByAnthology, getArticleDetail} from '../api/article';
import {getCategoryList} from '../api/category';
import {useToast} from '../components/common/ToastProvider';
import { uploadResource } from '../api/resources';
import {
    CheckSquare,
    Code,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    ImageIcon,
    List,
    Minus,
    Quote,
    Sigma,
    Table as TableIcon,
    Type,
    Video as VideoIcon,
    Workflow,
    Underline,
    Highlighter
} from 'lucide-react';

// --- Constants ---
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export const CATEGORIES: Category[] = [];

// 移除模拟数据，改为从API获取

// --- Commands Config ---
// React Node 需要在组件中渲染，这里定义配置，图标在组件中实例化或者这里直接用
// 这里直接用 React Node 是可以的，只要 Hook 文件是 .tsx 或者引入了 React
const COMMANDS_CONFIG: Omit<CommandItem, 'icon'>[] = [
    { id: 'image', label: '图片', value: '', desc: '上传并插入图片 (Max 5MB)' },
    { id: 'imageLink', label: '图片链接', value: '', desc: '通过URL插入图片' },
    { id: 'video', label: '视频', value: '', desc: '插入视频地址' },
    { id: 'mermaid', label: 'Mermaid 图表', value: '\n```mermaid\ngraph TD\n    A[Start] --> B{Is it?}\n    B -- Yes --> C[OK]\n    B -- No --> D[End]\n```\n', cursorOffset: 0, desc: '插入流程图/时序图等' },
    { id: 'text', label: '文本', value: '', desc: '开始像往常一样输入' },
    { id: 'h1', label: '标题 1', value: '# ', desc: '一级大标题' },
    { id: 'h2', label: '标题 2', value: '## ', desc: '二级中标题' },
    { id: 'h3', label: '标题 3', value: '### ', desc: '三级小标题' },
    { id: 'h4', label: '标题 4', value: '#### ', desc: '四级小标题' },
    { id: 'h5', label: '标题 5', value: '##### ', desc: '五级小标题' },
    { id: 'ul', label: '项目符号列表', value: '- ', desc: '创建一个简单的列表' },
    { id: 'ol', label: '有序列表', value: '1. ', desc: '创建一个带序号的列表' },
    { id: 'todo', label: '待办清单', value: '- [ ] ', desc: '跟踪任务完成情况' },
    { id: 'quote', label: '引用', value: '> ', desc: '引用一段话' },
    { id: 'code', label: '代码块', value: '```\n\n```', cursorOffset: -4, desc: '插入代码片段' },
    { id: 'math', label: '数学公式', value: '$$\n\n$$', cursorOffset: -3, desc: '插入 KaTex 公式' },
    { id: 'divider', label: '分割线', value: '---\n', desc: '视觉分割线' },
    { id: 'table', label: '表格', value: '\n| 表头1 | 表头2 |\n| --- | --- |\n| 内容1 | 内容2 |\n', desc: '插入简单的表格' },
    { id: 'underline', label: '下划线', value: '++红色下划线重点++', cursorOffset: -2, desc: '添加红色下划线重点标记' },
    { id: 'wave', label: '波浪线', value: '^^天蓝色波浪线^^', cursorOffset: -2, desc: '添加天蓝色波浪线标记' },
    { id: 'watercolor', label: '水彩标记', value: '==重点水彩标记==', cursorOffset: -2, desc: '添加重点水彩标记' },
];

// Helper to add icons
const getCommandsWithIcons = (): CommandItem[] => {
    // 简单映射，实际项目中可以更优
    const icons: Record<string, React.ReactNode> = {
        image: <ImageIcon size={18} />, imageLink: <ImageIcon size={18} />, video: <VideoIcon size={18} />, mermaid: <Workflow size={18} />,
        text: <Type size={18} />, h1: <Heading1 size={18} />, h2: <Heading2 size={18} />,
        h3: <Heading3 size={18} />, h4: <Heading4 size={18} />, h5: <Heading5 size={18} />,
        ul: <List size={18} />, ol: <List size={18} />, todo: <CheckSquare size={18} />,
        quote: <Quote size={18} />, code: <Code size={18} />, math: <Sigma size={18} />,
        divider: <Minus size={18} />, table: <TableIcon size={18} />,
        underline: <Underline size={18} />, wave: <Sigma size={18} />, watercolor: <Highlighter size={18} />
    };
    return COMMANDS_CONFIG.map(c => ({ ...c, icon: icons[c.id] || <Type size={18} /> }));
};

export const useEditor = () => {
    // Refs
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachmentInputRef = useRef<HTMLInputElement>(null);
    
    // Router
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();
    
    // 获取文章ID（编辑模式）
    const articleId = params.docId;
    
    // 获取collId
    const getCollId = () => {
        // 首先尝试从搜索参数中获取
        const searchParams = new URLSearchParams(location.search);
        const collId = searchParams.get('collId');
        if (collId) return collId;
        
        // 然后尝试从路径参数中获取 (编辑模式下的路径可能包含collId)
        const pathParts = location.pathname.split('/');
        const collIndex = pathParts.indexOf('coll');
        if (collIndex !== -1 && collIndex + 1 < pathParts.length) {
            return pathParts[collIndex + 1];
        }
        
        return null;
    };

    // State: Content
    const [title, setTitle] = useState("未命名文档");
    const [content, setContent] = useState(`> 💡 **提示**: 试一下插入图片、视频和 Mermaid 图表功能吧！\n\n## 1. 图片测试\n试试复制一张图片粘贴到这里，或者使用 \`/图片\` 命令。\n\n## 2. Mermaid 图表\n使用 \`/图表\` 命令插入一个流程图。\n`);

    // Toast
    const toast = useToast();
    
    // State: Meta
    const [categories, setCategories] = useState<Category[]>([]);
    const [loadingCategories, setLoadingCategories] = useState<boolean>(true);
    const [category, setCategory] = useState<Category | null>(null);
    const [parentArticles, setParentArticles] = useState<ParentArticleItem[]>([{ id: 'root', title: '无 (作为顶级文章)' }]);
    const [loadingParentArticles, setLoadingParentArticles] = useState<boolean>(true);
    const [parentArticle, setParentArticle] = useState<ParentArticleItem | null>({ id: 'root', title: '无 (作为顶级文章)' });
    const [tags, setTags] = useState<string[]>([]);
    const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

    // State: UI
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isImageLinkModalOpen, setIsImageLinkModalOpen] = useState(false);
    const [isVideoLinkModalOpen, setIsVideoLinkModalOpen] = useState(false);

    // State: Slash Menu
    const [showMenu, setShowMenu] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [slashIndex, setSlashIndex] = useState(-1);
    // 保存使用斜杠命令上传图片时的插入位置
    const [imageInsertPosition, setImageInsertPosition] = useState<number | null>(null);

    const commands = getCommandsWithIcons().filter(cmd =>
        cmd.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.id.includes(searchQuery.toLowerCase())
    );

    // --- Helpers ---

    const getCaretCoordinates = () => {
        const textarea = textareaRef.current;
        if (!textarea) return { top: 0, left: 0 };
        const { selectionStart } = textarea;
        const div = document.createElement('div');
        const style = window.getComputedStyle(textarea);
        Array.from(style).forEach(prop => div.style[prop as any] = style.getPropertyValue(prop));
        div.style.position = 'absolute'; div.style.visibility = 'hidden'; div.style.whiteSpace = 'pre-wrap';
        div.style.width = style.width;
        div.textContent = textarea.value.substring(0, selectionStart);
        const span = document.createElement('span'); span.textContent = '|'; div.appendChild(span);
        document.body.appendChild(div);
        const { offsetLeft, offsetTop } = span;
        const rect = textarea.getBoundingClientRect();
        document.body.removeChild(div);

        let top = rect.top + offsetTop - textarea.scrollTop + 30;
        const MENU_HEIGHT = 300;
        if (top + MENU_HEIGHT > window.innerHeight) top -= (MENU_HEIGHT + 40);

        return { top, left: rect.left + offsetLeft - textarea.scrollLeft };
    };

    const insertTextAtCursor = (text: string, cursorOffset = 0) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const scrollTop = textarea.scrollTop;
        const newContent = content.substring(0, start) + text + content.substring(end);
        setContent(newContent);
        setTimeout(() => {
            textarea.focus();
            const newPos = start + text.length + cursorOffset;
            textarea.setSelectionRange(newPos, newPos);
            textarea.scrollTop = scrollTop;
        }, 0);
    };

    // --- Actions ---
    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (articleId) {
                // 更新现有文章 - 不需要文集ID
                const articleData = {
                    title,
                    content,
                    parentId: parentArticle?.id === 'root' ? undefined : parentArticle?.id,
                    categoryId: category?.id, // 转换为undefined而不是null以匹配接口类型
                    tags: tags.length > 0 ? tags : ['笔记'] // 默认为['笔记']，如果用户未添加任何标签
                };
                
                await updateArticle(articleId, articleData);
                toast.success("文章更新成功！");
                // 保持在编辑页面，可以更新本地状态
                // 可以选择重新加载文章详情以保持数据同步
            } else {
                // 创建新文章 - 需要文集ID
                const collId = getCollId();
                if (!collId) {
                    alert("请选择文集！");
                    setIsSaving(false);
                    return;
                }

                const articleData = {
                    title,
                    content,
                    collId,
                    parentId: parentArticle?.id === 'root' ? undefined : parentArticle?.id,
                    categoryId: category?.id, // 转换为undefined而不是null以匹配接口类型
                    tags: tags.length > 0 ? tags : ['笔记'] // 默认为['笔记']，如果用户未添加任何标签
                };
                
                const result = await createArticle(articleData);
                toast.success("文章创建成功！");
                // 跳转到文章详情页
                navigate(`/article/${collId}/${result.articleId}`);
            }
        } catch (error) {
            console.error("保存文章失败:", error);
            const err = error as Error;
            toast.error(err.message || '保存文章失败');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTogglePreview = () => setIsPreviewMode(prev => !prev);

    const handleAddTag = (tag: string) => {
        if (!tags.includes(tag)) setTags([...tags, tag]);
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(tag => tag !== tagToRemove));
    };

    // 生成唯一占位符
    const generateUniquePlaceholder = () => {
        return `![上传中... ${Date.now()}${Math.random().toString(36).substr(2, 9)}]()`;
    };

    // --- File Handling ---
    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_IMAGE_SIZE) { alert("图片大小不能超过 5MB"); return; }

        // Generate unique placeholder
        const placeholder = generateUniquePlaceholder();
        
        // Check if this is from slash command
        if (imageInsertPosition !== null) {
            // Clean up slash command text first
            setContent(prev => {
                // Remove the slash command text
                const cleanContent = prev.substring(0, imageInsertPosition) + prev.substring(textareaRef.current!.selectionEnd);
                // Insert placeholder at the correct position
                return cleanContent.substring(0, imageInsertPosition) + placeholder + cleanContent.substring(imageInsertPosition);
            });
            // Reset the insert position
            setImageInsertPosition(null);
        } else {
            // Normal image upload, insert at cursor position
            insertTextAtCursor(placeholder);
        }

        try {
            const response = await uploadResource(file);
            // Replace placeholder with actual image link
            setContent(prev => prev.replace(placeholder, `![${file.name}](/api/resource/view/${response.id})`));
            
            // Add to attachments
            setAttachments(prev => [...prev, {
                id: response.id,
                name: file.name,
                size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
                type: file.name.split('.').pop()?.toUpperCase() || 'IMAGE',
                url: `/api/resource/download/${response.id}`
            }]);
        } catch (err) {
            console.error('上传图片失败:', err);
            alert("上传失败");
            // Remove placeholder on error
            setContent(prev => prev.replace(placeholder, ''));
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;

        for (let i = 0; i < files.length; i++) {
            if (files[i].size > MAX_ATTACHMENT_SIZE) { alert(`文件 ${files[i].name} 超过 10MB`); return; }
        }

        setIsUploadingAttachment(true);
        const newAtts: AttachmentItem[] = [];
        for (let i = 0; i < files.length; i++) {
            try {
                const response = await uploadResource(files[i]);
                newAtts.push({
                    id: response.id,
                    name: files[i].name,
                    size: (files[i].size / 1024 / 1024).toFixed(2) + ' MB',
                    type: files[i].name.split('.').pop()?.toUpperCase() || 'FILE',
                    url: `/api/resource/download/${response.id}`
                });
            } catch { alert("上传失败"); }
        }
        setAttachments(prev => [...prev, ...newAtts]);
        setIsUploadingAttachment(false);
        if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) {
                    // Reuse image upload logic but tricky without event, simulate it
                    const placeholder = generateUniquePlaceholder();
                    // Simplified paste logic for brevity
                    insertTextAtCursor(placeholder);
                    uploadResource(file).then(response => setContent(prev => prev.replace(placeholder, `![image](/api/resource/view/${response.id})`)));
                }
                return;
            }
        }
    };

    // --- Command Handling ---
    const executeCommand = (cmd: CommandItem) => {
        if (cmd.id === 'image') {
            // 保存斜杠命令位置，用于后续清理
            setImageInsertPosition(slashIndex);
            // 触发文件选择
            fileInputRef.current?.click();
            closeMenu();
            
            // 设置超时，防止用户取消选择后状态不一致
            setTimeout(() => {
                setImageInsertPosition(null);
            }, 5000); // 5秒后重置
            return;
        }
        if (cmd.id === 'imageLink') {
            closeMenu();
            setContent(prev => prev.substring(0, slashIndex) + prev.substring(textareaRef.current!.selectionEnd));
            setIsImageLinkModalOpen(true);
            return;
        }
        if (cmd.id === 'video') {
            closeMenu();
            setContent(prev => prev.substring(0, slashIndex) + prev.substring(textareaRef.current!.selectionEnd));
            setIsVideoLinkModalOpen(true);
            return;
        }

        const textarea = textareaRef.current;
        if (!textarea) return;

        const beforeSlash = content.substring(0, slashIndex);
        const afterCursor = content.substring(textarea.selectionEnd);
        const newContent = beforeSlash + cmd.value + afterCursor;

        setContent(newContent);
        closeMenu();

        const newCursor = beforeSlash.length + cmd.value.length + (cmd.cursorOffset || 0);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(newCursor, newCursor);
        }, 0);
    };

    const closeMenu = () => { setShowMenu(false); setSlashIndex(-1); setSearchQuery(''); };

    const handleImageLinkConfirm = (url: string, altText: string) => {
        insertTextAtCursor(`![${altText || '图片'}](${url})`);
        setIsImageLinkModalOpen(false);
    };

    const handleImageLinkCancel = () => {
        setIsImageLinkModalOpen(false);
    };

    const handleVideoLinkConfirm = (url: string) => {
        insertTextAtCursor(`\n<video src="${url}" controls width="100%"></video>\n`);
        setIsVideoLinkModalOpen(false);
    };

    const handleVideoLinkCancel = () => {
        setIsVideoLinkModalOpen(false);
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const pos = e.target.selectionStart;
        setContent(val);

        if (showMenu) {
            if (pos <= slashIndex) { closeMenu(); return; }
            const query = val.substring(slashIndex + 1, pos);
            if (query.includes(' ') || query.includes('\n')) closeMenu();
            else { setSearchQuery(query); setSelectedIndex(0); }
            return;
        }

        if (val.charAt(pos - 1) === '/' && (!val.charAt(pos - 2) || /\s/.test(val.charAt(pos - 2)))) {
            const coords = getCaretCoordinates();
            setMenuPosition(coords);
            setSlashIndex(pos - 1);
            setShowMenu(true);
            setSelectedIndex(0);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyE') {
            e.preventDefault(); handleTogglePreview(); return;
        }
        if (!showMenu) return;

        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (prev + 1) % commands.length); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (prev - 1 + commands.length) % commands.length); }
        else if (e.key === 'Enter') { e.preventDefault(); executeCommand(commands[selectedIndex]); }
        else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    };

    // Load article detail if editing existing article
    useEffect(() => {
        const loadArticleDetail = async () => {
            if (!articleId) return; // 如果没有文章ID，说明是新建文章
            
            try {
                const articleDetail = await getArticleDetail(articleId);
                
                // 设置文章内容
                setTitle(articleDetail.title);
                setContent(articleDetail.content);
                
                // 设置分类
                if (articleDetail.categoryDetail) {
                    const articleCategory = {
                        id: articleDetail.categoryDetail.categoryId,
                        name: articleDetail.categoryDetail.name,
                        color: articleDetail.categoryDetail.categoryId === 'uncategorized' ? 'bg-slate-400' : 'bg-blue-600'
                    };
                    setCategory(articleCategory);
                }
                
                // 设置标签
                if (articleDetail.tagDetails && articleDetail.tagDetails.length > 0) {
                    const tagNames = articleDetail.tagDetails.map(tag => tag.name);
                    setTags(tagNames);
                }
                
                // 设置附件
                if (articleDetail.attachments && articleDetail.attachments.length > 0) {
                    const mappedAttachments = articleDetail.attachments.map(att => ({
                        id: att.id,
                        name: att.name,
                        size: att.size ? `${att.size} MB` : '未知大小',
                        type: att.type || 'FILE',
                        url: att.url
                    }));
                    setAttachments(mappedAttachments);
                }
                
                // 设置父级文章
                if (articleDetail.parentDetail) {
                    const parentArticleData = {
                        id: articleDetail.parentDetail.articleId,
                        title: articleDetail.parentDetail.title
                    };
                    setParentArticle(parentArticleData);
                    
                    // 将父级文章添加到列表中，确保它在下拉框中显示
                    setParentArticles(prev => {
                        const exists = prev.some(item => item.id === parentArticleData.id);
                        if (!exists) {
                            return [parentArticleData, ...prev];
                        }
                        return prev;
                    });
                }
                
                // 根据文章的文集ID加载父级文章列表
                if (articleDetail.collId) {
                    loadParentArticlesByCollId(articleDetail.collId);
                }
                
            } catch (error) {
                console.error('加载文章详情失败:', error);
                toast.error('加载文章详情失败');
            }
        };
        
        loadArticleDetail();
    }, [articleId, toast]);

    // Load categories
     useEffect(() => {
         const loadCategories = async () => {
             try {
                 const data = await getCategoryList(true); // 获取包含未分类的分类列表
                // 映射API返回的CategoryItem到前端Category接口
                // 添加color属性（可以基于themeId或其他字段生成，这里使用默认颜色方案）
                const colorMap = ['bg-blue-600', 'bg-violet-600', 'bg-pink-600', 'bg-orange-600', 'bg-teal-600'];
                
                const mappedCategories = data.map((item, index) => ({
                    id: item.categoryId, // 映射categoryId到id
                    name: item.name,
                    color: item.categoryId === 'uncategorized' ? 'bg-slate-400' : colorMap[index % colorMap.length] // 未分类使用灰色
                }));
                setCategories(mappedCategories);
                
                // 只有在新建文章且没有设置分类的情况下才设置默认分类
                if (!articleId && !category && mappedCategories.length > 0) {
                    setCategory(mappedCategories[0]);
                }
             } catch {
                 toast.error('加载分类失败');
             } finally {
                 setLoadingCategories(false);
             }
         };
         loadCategories();
     }, []); // 空依赖数组，只在组件挂载时加载一次

    // 根据文集ID加载父级文章列表的函数
    const loadParentArticlesByCollId = async (collId: string) => {
        try {
            setLoadingParentArticles(true);
            const articles = await getArticlesByAnthology(collId);
            // 转换文章列表为父级文章选项格式
            const parentOptions = [
                { id: 'root', title: '无 (作为顶级文章)' },
                ...articles.map(article => ({
                    id: article.articleId,
                    title: article.title
                }))
            ];
            setParentArticles(parentOptions);
        } catch (error) {
            console.error('加载父级文章失败:', error);
            toast.error('加载父级文章失败');
            setParentArticles([{ id: 'root', title: '无 (作为顶级文章)' }]);
        } finally {
            setLoadingParentArticles(false);
        }
    };

    // Load parent articles based on current anthology
    useEffect(() => {
        // 如果已经通过文章详情加载了父级文章列表，则跳过
        if (articleId && parentArticles.length > 1) {
            return;
        }
        
        const loadParentArticles = async () => {
            const collId = getCollId();
            if (!collId) {
                setParentArticles([{ id: 'root', title: '无 (作为顶级文章)' }]);
                setLoadingParentArticles(false);
                return;
            }
            
            await loadParentArticlesByCollId(collId);
        };
        
        loadParentArticles();
    }, [getCollId(), toast, articleId]);

    // Global shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.code === 'KeyE') { e.preventDefault(); handleTogglePreview(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    return {
        // Refs
        textareaRef, fileInputRef, attachmentInputRef,
        // State
        title, setTitle,
        content,
        category, setCategory,
        categories,
        loadingCategories,
        parentArticle, setParentArticle,
        parentArticles,
        loadingParentArticles,
        tags,
        attachments, setAttachments,
        isSaving, isPreviewMode, isUploadingAttachment,
        isImageLinkModalOpen, isVideoLinkModalOpen,
        showMenu, menuPosition, selectedIndex, setSelectedIndex,
        commands,
        // Actions
        onSave: handleSave,
        onTogglePreview: handleTogglePreview,
        onAddTag: handleAddTag,
        onRemoveTag: handleRemoveTag,
        onBack: () => window.history.back(),
        // File Actions
        onImageUpload: handleImageChange,
        onAttachmentUpload: handleAttachmentChange,
        onRemoveAttachment: (id: string) => setAttachments(prev => prev.filter(a => a.id !== id)),
        onPaste: handlePaste,
        // Editor Actions
        onTextChange: handleTextChange,
        onKeyDown: handleKeyDown,
        onExecuteCommand: executeCommand,
        // Image Link Actions
        onImageLinkConfirm: handleImageLinkConfirm,
        onImageLinkCancel: handleImageLinkCancel,
        // Video Link Actions
        onVideoLinkConfirm: handleVideoLinkConfirm,
        onVideoLinkCancel: handleVideoLinkCancel
    };
};