import {useEffect, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import {CommandItem} from '../components/Editor/SlashMenu';
import {AttachmentItem, Category, ParentArticleItem} from '../components/Editor/EditorMetaBar';
import {createArticle, getArticleDetail, getArticlesByAnthology, updateArticle} from '../api/article';
import {getCategoryList} from '../api/category';
import {useToast} from '../components/common/ToastProvider';
import {uploadResource} from '../api/resources';
import {AIConfigError, continueWritingWithAI, generateTagsWithAI, generateTitleWithAI, polishArticleWithAI} from '../api/ai';
import {
    CheckSquare,
    Code,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Highlighter,
    ImageIcon,
    List,
    Minus,
    Quote,
    Sigma,
    Table as TableIcon,
    Type,
    Underline,
    Video as VideoIcon,
    Workflow
} from 'lucide-react';

// --- Constants ---
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

const isPreviewShortcut = (event: KeyboardEvent | React.KeyboardEvent) => {
    return (event.metaKey || event.ctrlKey) && event.code === 'KeyE';
};

const getLineStartIndex = (text: string, position: number) => {
    return text.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
};

const getLineEndIndex = (text: string, position: number) => {
    const nextLineIndex = text.indexOf('\n', position);
    return nextLineIndex === -1 ? text.length : nextLineIndex;
};

const escapeHtmlAttribute = (value: string) => {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

const getBilibiliEmbedUrl = (url: string) => {
    try {
        const parsedUrl = new URL(url);
        const host = parsedUrl.hostname.replace(/^www\./, '');
        if (!['bilibili.com', 'm.bilibili.com', 'player.bilibili.com'].includes(host)) return null;

        if (host === 'player.bilibili.com') return parsedUrl.toString();

        const bvid = parsedUrl.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1]
            || parsedUrl.searchParams.get('bvid');
        if (!bvid) return null;

        const page = parsedUrl.searchParams.get('p') || parsedUrl.searchParams.get('page') || '1';
        const embedUrl = new URL('https://player.bilibili.com/player.html');
        embedUrl.searchParams.set('bvid', bvid);
        embedUrl.searchParams.set('page', page);
        embedUrl.searchParams.set('high_quality', '1');
        return embedUrl.toString();
    } catch {
        return null;
    }
};

const createVideoEmbedMarkup = (url: string) => {
    const bilibiliEmbedUrl = getBilibiliEmbedUrl(url);
    if (bilibiliEmbedUrl) {
        return `\n<iframe src="${escapeHtmlAttribute(bilibiliEmbedUrl)}" width="100%" height="480" frameborder="0" allowfullscreen></iframe>\n`;
    }

    return `\n<video src="${escapeHtmlAttribute(url)}" controls width="100%"></video>\n`;
};

// 1. 定义颜色映射 (与 CategoriesPage/Article 保持一致)
const THEME_DOT_COLORS: Record<string, string> = {
    blue: 'bg-blue-600',
    emerald: 'bg-emerald-600',
    orange: 'bg-orange-600',
    pink: 'bg-pink-600',
    violet: 'bg-violet-600',
    cyan: 'bg-cyan-600',
    sky: 'bg-sky-600',
    amber: 'bg-amber-600',
    slate: 'bg-slate-500',
};

// React Node 需要在组件中渲染，这里定义配置，图标在组件中实例化或者这里直接用
// 这里直接用 React Node 是可以的，只要 Hook 文件是 .tsx 或者引入了 React
const COMMANDS_CONFIG: Omit<CommandItem, 'icon'>[] = [
    {id: 'image', label: '图片', value: '', desc: '上传并插入图片 (Max 5MB)'},
    {id: 'imageLink', label: '图片链接', value: '', desc: '通过URL插入图片'},
    {id: 'video', label: '视频', value: '', desc: '插入视频地址'},
    {
        id: 'mermaid',
        label: 'Mermaid 图表',
        value: '\n```mermaid\ngraph TD\n    A[Start] --> B{Is it?}\n    B -- Yes --> C[OK]\n    B -- No --> D[End]\n```\n',
        cursorOffset: 0,
        desc: '插入流程图/时序图等'
    },
    {id: 'text', label: '文本', value: '', desc: '开始像往常一样输入'},
    {id: 'h1', label: '标题 1', value: '# ', desc: '一级大标题'},
    {id: 'h2', label: '标题 2', value: '## ', desc: '二级中标题'},
    {id: 'h3', label: '标题 3', value: '### ', desc: '三级小标题'},
    {id: 'h4', label: '标题 4', value: '#### ', desc: '四级小标题'},
    {id: 'h5', label: '标题 5', value: '##### ', desc: '五级小标题'},
    {id: 'ul', label: '项目符号列表', value: '- ', desc: '创建一个简单的列表'},
    {id: 'ol', label: '有序列表', value: '1. ', desc: '创建一个带序号的列表'},
    {id: 'todo', label: '待办清单', value: '- [ ] ', desc: '跟踪任务完成情况'},
    {id: 'quote', label: '引用', value: '> ', desc: '引用一段话'},
    {id: 'quoteDanger', label: '红色引用', value: '>d ', desc: '插入红色提示引用'},
    {id: 'quoteWarning', label: '黄色引用', value: '>w ', desc: '插入黄色提示引用'},
    {id: 'quoteInfo', label: '灰色引用', value: '>i ', desc: '插入灰色提示引用'},
    {id: 'code', label: '代码块', value: '```\n\n```', cursorOffset: -4, desc: '插入代码片段'},
    {id: 'math', label: '数学公式', value: '$$\n\n$$', cursorOffset: -3, desc: '插入 KaTex 公式'},
    {id: 'divider', label: '分割线', value: '---\n', desc: '视觉分割线'},
    {
        id: 'table',
        label: '表格',
        value: '\n| 表头1 | 表头2 |\n| --- | --- |\n| 内容1 | 内容2 |\n',
        desc: '插入简单的表格'
    }
];

// Helper to add icons
const getCommandsWithIcons = (): CommandItem[] => {
    // 简单映射，实际项目中可以更优
    const icons: Record<string, React.ReactNode> = {
        image: <ImageIcon size={18}/>,
        imageLink: <ImageIcon size={18}/>,
        video: <VideoIcon size={18}/>,
        mermaid: <Workflow size={18}/>,
        text: <Type size={18}/>,
        h1: <Heading1 size={18}/>,
        h2: <Heading2 size={18}/>,
        h3: <Heading3 size={18}/>,
        h4: <Heading4 size={18}/>,
        h5: <Heading5 size={18}/>,
        ul: <List size={18}/>,
        ol: <List size={18}/>,
        todo: <CheckSquare size={18}/>,
        quote: <Quote size={18}/>,
        quoteDanger: <Quote size={18}/>,
        quoteWarning: <Quote size={18}/>,
        quoteInfo: <Quote size={18}/>,
        code: <Code size={18}/>,
        math: <Sigma size={18}/>,
        divider: <Minus size={18}/>,
        table: <TableIcon size={18}/>,
        underline: <Underline size={18}/>,
        wave: <Sigma size={18}/>,
        watercolor: <Highlighter size={18}/>
    };
    return COMMANDS_CONFIG.map(c => ({...c, icon: icons[c.id] || <Type size={18}/>}));
};

export const useEditor = () => {
    // Refs
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachmentInputRef = useRef<HTMLInputElement>(null);
    const [isGeneratingTags, setIsGeneratingTags] = useState(false);
    const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
    const [isPolishing, setIsPolishing] = useState(false);
    // 新增：AI润色确认弹窗状态
    const [isPolishConfirmOpen, setIsPolishConfirmOpen] = useState(false);

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
    const [parentArticles, setParentArticles] = useState<ParentArticleItem[]>([{
        id: 'root',
        title: '无 (作为顶级文章)'
    }]);
    const [loadingParentArticles, setLoadingParentArticles] = useState<boolean>(true);
    const [parentArticle, setParentArticle] = useState<ParentArticleItem | null>({
        id: 'root',
        title: '无 (作为顶级文章)'
    });
    const [tags, setTags] = useState<string[]>([]);
    const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

    // State: UI
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isImageLinkModalOpen, setIsImageLinkModalOpen] = useState(false);
    const [isVideoLinkModalOpen, setIsVideoLinkModalOpen] = useState(false);
    const [showAiLineHint, setShowAiLineHint] = useState(false);
    const [aiLineHintPosition, setAiLineHintPosition] = useState({top: 0, left: 0});
    const [isAiContinueOpen, setIsAiContinueOpen] = useState(false);
    const [aiContinuePosition, setAiContinuePosition] = useState({top: 0, left: 0});
    const [aiContinuePrompt, setAiContinuePrompt] = useState('');
    const [aiContinueInsertPosition, setAiContinueInsertPosition] = useState(0);
    const [isAiContinuing, setIsAiContinuing] = useState(false);

    // State: Slash Menu
    const [showMenu, setShowMenu] = useState(false);
    const [menuPosition, setMenuPosition] = useState({top: 0, left: 0});
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [slashIndex, setSlashIndex] = useState(-1);
    // 保存使用斜杠命令上传图片时的插入位置
    const [imageInsertPosition, setImageInsertPosition] = useState<number | null>(null);
    // 保存使用斜杠命令打开链接弹窗时的插入位置，避免弹窗抢焦点后丢失光标
    const [linkInsertPosition, setLinkInsertPosition] = useState<number | null>(null);

    const commands = getCommandsWithIcons().filter(cmd =>
        cmd.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.id.includes(searchQuery.toLowerCase())
    );

    // --- 新增 State: 气泡菜单 ---
    const [showBubbleMenu, setShowBubbleMenu] = useState(false);
    const [bubbleMenuPosition, setBubbleMenuPosition] = useState({top: 0, left: 0});

    // --- Helpers ---

    const isCursorAtLineStart = () => {
        const textarea = textareaRef.current;
        if (!textarea || textarea.selectionStart !== textarea.selectionEnd) return false;
        return textarea.selectionStart === getLineStartIndex(textarea.value, textarea.selectionStart);
    };

    const isCurrentLineBlank = () => {
        const textarea = textareaRef.current;
        if (!textarea || textarea.selectionStart !== textarea.selectionEnd) return false;
        const lineStart = getLineStartIndex(textarea.value, textarea.selectionStart);
        const lineEnd = getLineEndIndex(textarea.value, textarea.selectionStart);
        return textarea.value.slice(lineStart, lineEnd).trim().length === 0;
    };

    // 增加 index 参数，允许计算任意位置的坐标（默认是当前光标）
    const getCaretCoordinates = (index: number | null = null) => {
        const textarea = textareaRef.current;
        if (!textarea) return {top: 0, left: 0};

        // 如果未传入 index，则使用当前光标位置
        const cursorPos = index !== null ? index : textarea.selectionStart;

        const div = document.createElement('div');
        const style = window.getComputedStyle(textarea);
        Array.from(style).forEach(prop => div.style[prop as any] = style.getPropertyValue(prop));
        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.whiteSpace = 'pre-wrap';
        div.style.width = style.width;

        // 截取到目标位置的文本
        div.textContent = textarea.value.substring(0, cursorPos);

        const span = document.createElement('span');
        span.textContent = '|'; // 模拟光标字符
        div.appendChild(span);
        document.body.appendChild(div);

        const {offsetLeft, offsetTop} = span;
        const rect = textarea.getBoundingClientRect();
        document.body.removeChild(div);

        // 计算绝对坐标
        let top = rect.top + offsetTop - textarea.scrollTop;
        let left = rect.left + offsetLeft - textarea.scrollLeft;

        return {top, left};
    };

    const updateAiLineHint = () => {
        const textarea = textareaRef.current;
        if (!textarea || showMenu || isAiContinueOpen || isPolishing) {
            setShowAiLineHint(false);
            return;
        }

        if (!isCursorAtLineStart() || !isCurrentLineBlank()) {
            setShowAiLineHint(false);
            return;
        }

        const coords = getCaretCoordinates();
        setAiLineHintPosition({
            top: coords.top,
            left: coords.left + 2
        });
        setShowAiLineHint(true);
    };

    // --- 新增：处理选区变化 ---
    // 在 onSelect, onKeyUp, onMouseUp 时触发
    const handleSelectionChange = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const {selectionStart, selectionEnd} = textarea;
        updateAiLineHint();

        // 如果没有选中文本，或者正在显示 Slash 菜单，则隐藏气泡菜单
        if (selectionStart === selectionEnd || showMenu) {
            setShowBubbleMenu(false);
            return;
        }

        // 计算选区结束位置的坐标，作为菜单显示位置
        // 为了体验更好，我们取 selectionEnd（选区尾部）或者计算选区中心（比较复杂，这里先用尾部优化）
        // 优化：计算选区中心大概位置。这里简单实现为选区结尾位置上方。
        const coords = getCaretCoordinates(selectionEnd);

        // 稍微向上偏移，留出菜单高度空间
        setBubbleMenuPosition({
            top: coords.top,
            left: coords.left
        });
        setShowBubbleMenu(true);
    };

    // --- 新增：应用格式 ---
    const applyFormat = (type: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = content.substring(start, end);
        let formattedText = selectedText;

        switch (type) {
            case 'bold':
                formattedText = `**${selectedText}**`;
                break;
            case 'italic':
                formattedText = `*${selectedText}*`;
                break;
            case 'strike':
                formattedText = `~~${selectedText}~~`;
                break;
            case 'code':
                formattedText = `\`${selectedText}\``;
                break;
            // --------- 修改这里：匹配你 useArticle.ts 中的正则 ---------
            case 'underline':
                // 对应正则：/\+\+(.*?)\+\+/ -> custom-underline-red
                formattedText = `++${selectedText}++`;
                break;
            case 'wave':
                // 对应正则：/\^\^(.*?)\^\^/ -> custom-underline-wavy
                formattedText = `^^${selectedText}^^`;
                break;
            case 'watercolor':
                // 对应正则：/==(.*?)==/ -> custom-watercolor
                formattedText = `==${selectedText}==`;
                break;
            // --------------------------------------------------------
        }

        // 执行替换
        const newContent = content.substring(0, start) + formattedText + content.substring(end);
        setContent(newContent);
        setShowAiLineHint(false);

        // 恢复焦点并保持选中
        setTimeout(() => {
            textarea.focus();
            const newEnd = start + formattedText.length;
            textarea.setSelectionRange(newEnd, newEnd);
            setShowBubbleMenu(false); // 应用后隐藏菜单
        }, 0);
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
            updateAiLineHint();
        }, 0);
    };

    const insertTextAtPosition = (text: string, position: number, cursorOffset = 0) => {
        const textarea = textareaRef.current;
        const insertPosition = Math.max(0, Math.min(position, content.length));
        const scrollTop = textarea?.scrollTop ?? 0;
        const newContent = content.substring(0, insertPosition) + text + content.substring(insertPosition);
        setContent(newContent);
        setTimeout(() => {
            if (!textarea) return;
            textarea.focus();
            const newPos = insertPosition + text.length + cursorOffset;
            textarea.setSelectionRange(newPos, newPos);
            textarea.scrollTop = scrollTop;
            updateAiLineHint();
        }, 0);
    };

    // --- Actions ---
    const handleSave = async () => {
        setIsSaving(true);
        try {
            // 总是传递实际的分类ID，包括未分类（'uncategorized'）
            const categoryIdToSave = category?.id;
            const parentIdToSave = parentArticle?.id === 'root' ? '' : parentArticle?.id;

            if (articleId) {
                // 更新现有文章 - 不需要文集ID
                const articleData = {
                    title,
                    content,
                    parentId: parentIdToSave,
                    categoryId: categoryIdToSave,
                    tags: tags.length > 0 ? tags : ['笔记'], // 默认为['笔记']，如果用户未添加任何标签
                    assets: attachments.map(att => att.id) // 传递附件ID数组
                };

                await updateArticle(articleId, articleData);
                toast.success("文章更新成功！");
                // 保持在编辑页面，可以更新本地状态
                // 可以选择重新加载文章详情以保持数据同步
            } else {
                // 创建新文章 - 需要文集ID
                const collId = getCollId();
                if (!collId) {
                    toast.error("请选择文集！");
                    setIsSaving(false);
                    return;
                }

                const articleData = {
                    title,
                    content,
                    collId,
                    parentId: parentIdToSave,
                    categoryId: categoryIdToSave,
                    tags: tags.length > 0 ? tags : ['笔记'], // 默认为['笔记']，如果用户未添加任何标签
                    assets: attachments.map(att => att.id) // 传递附件ID数组
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
        if (file.size > MAX_IMAGE_SIZE) {
            toast.error("图片大小不能超过 5MB");
            return;
        }

        // Generate unique placeholder
        const placeholder = generateUniquePlaceholder();

        // Check if this is from slash command
        if (imageInsertPosition !== null) {
            // 修改 2：简化逻辑，直接在记录的位置插入占位符
            // 因为 content 中的命令文本已经在 executeCommand 中被移除了，这里不需要再处理 residue
            setContent(prev => {
                return prev.substring(0, imageInsertPosition) + placeholder + prev.substring(imageInsertPosition);
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
        } catch (error) {
            console.error('上传图片失败:', error);
            const err = error as Error;
            toast.error(err.message || '上传失败')
            // Remove placeholder on error
            setContent(prev => prev.replace(placeholder, ''));
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;

        for (let i = 0; i < files.length; i++) {
            if (files[i].size > MAX_ATTACHMENT_SIZE) {
                toast.error(`文件 ${files[i].name} 超过 10MB`);
                return;
            }
        }

        setIsUploadingAttachment(true);
        const newAtts: AttachmentItem[] = [];
        for (let i = 0; i < files.length; i++) {
            try {
                const response = await uploadResource(files[i], 'attachment');
                newAtts.push({
                    id: response.id,
                    name: files[i].name,
                    size: files[i].size,
                    type: files[i].name.split('.').pop()?.toUpperCase() || 'FILE',
                    url: `/api/resource/download/${response.id}`
                });
            } catch {
                toast.error("上传失败");
            }
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
            // 修改 1：在打开文件选择框前，先从 content 中移除斜杠命令文本
            const textarea = textareaRef.current;
            if (textarea) {
                const beforeSlash = content.substring(0, slashIndex);
                const afterCursor = content.substring(textarea.selectionEnd);
                const newContent = beforeSlash + afterCursor;
                setContent(newContent);
            }

            // 保存斜杠命令位置（即现在的插入点）
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
            const textarea = textareaRef.current;
            if (!textarea) return;
            const insertPosition = slashIndex;
            const selectionEnd = textarea.selectionEnd;
            closeMenu();
            setContent(prev => prev.substring(0, insertPosition) + prev.substring(selectionEnd));
            setLinkInsertPosition(insertPosition);
            setIsImageLinkModalOpen(true);
            return;
        }
        if (cmd.id === 'video') {
            const textarea = textareaRef.current;
            if (!textarea) return;
            const insertPosition = slashIndex;
            const selectionEnd = textarea.selectionEnd;
            closeMenu();
            setContent(prev => prev.substring(0, insertPosition) + prev.substring(selectionEnd));
            setLinkInsertPosition(insertPosition);
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

    const closeMenu = () => {
        setShowMenu(false);
        setSlashIndex(-1);
        setSearchQuery('');
    };

    const handleImageLinkConfirm = (url: string, altText: string) => {
        const imageMarkdown = `![${altText || '图片'}](${url})`;
        if (linkInsertPosition !== null) {
            insertTextAtPosition(imageMarkdown, linkInsertPosition);
            setLinkInsertPosition(null);
        } else {
            insertTextAtCursor(imageMarkdown);
        }
        setIsImageLinkModalOpen(false);
    };

    const handleImageLinkCancel = () => {
        setLinkInsertPosition(null);
        setIsImageLinkModalOpen(false);
    };

    const handleVideoLinkConfirm = (url: string) => {
        const videoHtml = createVideoEmbedMarkup(url);
        if (linkInsertPosition !== null) {
            insertTextAtPosition(videoHtml, linkInsertPosition);
            setLinkInsertPosition(null);
        } else {
            insertTextAtCursor(videoHtml);
        }
        setIsVideoLinkModalOpen(false);
    };

    const handleVideoLinkCancel = () => {
        setLinkInsertPosition(null);
        setIsVideoLinkModalOpen(false);
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const pos = e.target.selectionStart;
        setContent(val);
        setShowAiLineHint(false);

        if (showMenu) {
            if (pos <= slashIndex) {
                closeMenu();
                return;
            }
            const query = val.substring(slashIndex + 1, pos);
            if (query.includes(' ') || query.includes('\n')) closeMenu();
            else {
                setSearchQuery(query);
                setSelectedIndex(0);
            }
            setTimeout(updateAiLineHint, 0);
            return;
        }

        // 输入文字时隐藏气泡
        setShowBubbleMenu(false);

        if (val.charAt(pos - 1) === '/' && (!val.charAt(pos - 2) || /\s/.test(val.charAt(pos - 2)))) {
            const coords = getCaretCoordinates();
            setMenuPosition(coords);
            setSlashIndex(pos - 1);
            setShowMenu(true);
            setSelectedIndex(0);
        }
        setTimeout(updateAiLineHint, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (isPreviewShortcut(e)) {
            e.preventDefault();
            e.stopPropagation();
            handleTogglePreview();
            return;
        }
        if (!showMenu && e.key === ' ' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && isCursorAtLineStart() && isCurrentLineBlank()) {
            const coords = getCaretCoordinates();
            const textarea = textareaRef.current;
            e.preventDefault();
            setShowAiLineHint(false);
            setAiContinuePrompt('');
            setAiContinueInsertPosition(textarea?.selectionStart || 0);
            setAiContinuePosition({
                top: coords.top + 30,
                left: Math.max(16, Math.min(coords.left, window.innerWidth - 720))
            });
            setIsAiContinueOpen(true);
            return;
        }
        if (!showMenu) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % commands.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + commands.length) % commands.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            executeCommand(commands[selectedIndex]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeMenu();
        }
    };

    const closeAiContinue = () => {
        setIsAiContinueOpen(false);
        setAiContinuePrompt('');
        setIsAiContinuing(false);
        setTimeout(() => {
            textareaRef.current?.focus();
            updateAiLineHint();
        }, 0);
    };

    const submitAiContinue = async () => {
        if (isAiContinuing) return;

        setIsAiContinuing(true);
        try {
            const generatedText = await continueWritingWithAI(content, aiContinuePrompt.trim());
            if (!generatedText.trim()) {
                toast.error('AI 没有返回可插入内容');
                return;
            }

            const prefix = aiContinueInsertPosition > 0 && content[aiContinueInsertPosition - 1] !== '\n' ? '\n' : '';
            const nextText = `${prefix}${generatedText.trim()}`;
            const newContent = content.slice(0, aiContinueInsertPosition) + nextText + content.slice(aiContinueInsertPosition);
            setContent(newContent);
            setIsAiContinueOpen(false);
            setAiContinuePrompt('');

            setTimeout(() => {
                const textarea = textareaRef.current;
                if (!textarea) return;
                const nextCursor = aiContinueInsertPosition + nextText.length;
                textarea.focus();
                textarea.setSelectionRange(nextCursor, nextCursor);
                updateAiLineHint();
            }, 0);
        } catch (error) {
            if (error instanceof AIConfigError) {
                toast.error(error.message);
            } else {
                toast.error('AI 续写失败');
            }
        } finally {
            setIsAiContinuing(false);
        }
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
                        size: att.size || 0,
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
                const data = await getCategoryList(); // 获取分类列表（包含未分类，因为未分类已入库）

                const mappedCategories = data.map((item) => {
                    // 获取主题色，默认为蓝色
                    const themeId = item.themeId || 'blue';
                    const dotColor = THEME_DOT_COLORS[themeId] || THEME_DOT_COLORS['blue'];

                    return {
                        id: item.categoryId,
                        name: item.name,
                        // 使用映射后的颜色，如果是未分类则使用灰色
                        color: item.categoryId === 'uncategorized' ? 'bg-slate-400' : dotColor
                    };
                });
                setCategories(mappedCategories);

                // 如果没有分类，默认选中未分类（如果存在），否则选中第一个分类
                if (!category && mappedCategories.length > 0) {
                    // 优先查找未分类
                    const uncategorized = mappedCategories.find(cat => cat.id === 'uncategorized');
                    // 如果找到未分类则选中，否则选中第一个分类
                    setCategory(uncategorized || mappedCategories[0]);
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
                {id: 'root', title: '无 (作为顶级文章)'},
                ...articles.map(article => ({
                    id: article.articleId,
                    title: article.title
                }))
            ];
            setParentArticles(parentOptions);
        } catch (error) {
            console.error('加载父级文章失败:', error);
            toast.error('加载父级文章失败');
            setParentArticles([{id: 'root', title: '无 (作为顶级文章)'}]);
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
                setParentArticles([{id: 'root', title: '无 (作为顶级文章)'}]);
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
            if (isPreviewShortcut(e)) {
                e.preventDefault();
                handleTogglePreview();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // 新增：处理 AI 生成标签
    const handleGenerateTags = async () => {
        // 简单校验：如果没有标题和内容，不生成
        if (!title && content.length < 10) {
            toast.error('请先输入一些内容再生成标签');
            return;
        }

        setIsGeneratingTags(true);

        try {
            const newTags = await generateTagsWithAI(title, content);

            if (newTags.length === 0) {
                toast.error('AI 未能生成有效标签，请重试');
                return;
            }

            const mergedTags = Array.from(new Set([...tags, ...newTags]));
            setTags(mergedTags);
            toast.success(`已生成 ${newTags.length} 个标签`);
        } catch (error) {
            if (error instanceof AIConfigError) {
                toast.error(error.message);
                return;
            }
            toast.error('AI 生成标签失败');
        } finally {
            setIsGeneratingTags(false);
        }
    };

    // 新增：处理 AI 生成标题
    const handleGenerateTitle = async () => {
        if (!content || content.length < 10) {
            toast.error('文章内容太少，无法生成标题');
            return;
        }
        setIsGeneratingTitle(true);
        try {
            const newTitle = await generateTitleWithAI(content);
            if (newTitle) {
                setTitle(newTitle);
                toast.success('标题已生成');
            } else {
                toast.error('AI 未能生成标题');
            }
        } catch (error) {
            if (error instanceof AIConfigError) {
                toast.error(error.message);
                return;
            }
            toast.error('生成标题失败');
        } finally {
            setIsGeneratingTitle(false);
        }
    };

    // 修改：点击润色按钮，仅打开确认弹窗
    const handlePolish = () => {
        if (!content || content.length < 10) {
            toast.error('内容为空，无法润色');
            return;
        }
        setIsPolishConfirmOpen(true);
    };

    // 新增：确认润色后执行的逻辑
    const handlePolishConfirm = async () => {
        setIsPolishConfirmOpen(false); // 关闭弹窗
        setIsPolishing(true); // 开启加载状态（魔法动画）

        try {
            const polishedContent = await polishArticleWithAI(content);
            if (polishedContent) {
                setContent(polishedContent);
                toast.success('文章润色完成！');
            } else {
                toast.error('AI 返回内容为空');
            }
        } catch (error) {
            if (error instanceof AIConfigError) {
                toast.error(error.message);
                return;
            }
            toast.error('润色失败，请稍后重试');
        } finally {
            setIsPolishing(false);
        }
    };

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
        onTextAreaFocus: updateAiLineHint,
        onTextAreaScroll: updateAiLineHint,
        onExecuteCommand: executeCommand,
        onCloseAiContinue: closeAiContinue,
        onSubmitAiContinue: submitAiContinue,
        // Image Link Actions
        onImageLinkConfirm: handleImageLinkConfirm,
        onImageLinkCancel: handleImageLinkCancel,
        // Video Link Actions
        onVideoLinkConfirm: handleVideoLinkConfirm,
        onVideoLinkCancel: handleVideoLinkCancel,
        isGeneratingTags,
        onGenerateTags: handleGenerateTags,
        isGeneratingTitle,
        onGenerateTitle: handleGenerateTitle,

        // AI Polish related (Updated)
        isPolishing,
        onPolish: handlePolish, // 点击按钮打开弹窗
        isPolishConfirmOpen,
        onPolishConfirm: handlePolishConfirm, // 弹窗确认后执行
        onPolishCancel: () => setIsPolishConfirmOpen(false) // 弹窗取消
    };
};
