import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Article from './Article';
import { Save, ArrowLeft, Eye, Edit3, Heading1, Heading2, Heading3, Heading4, Heading5, Quote, Code, List, CheckSquare, Table as TableIcon, Sigma, Type, Minus, X, Tag, Folder, Plus, ChevronDown, FileText, Paperclip, Image as ImageIcon, Video as VideoIcon, Loader2, Workflow, File } from 'lucide-react';

// 定义分类接口
interface Category {
    id: string;
    name: string;
    color: string;
}

// 定义命令接口
interface CommandItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    value: string;
    desc: string;
    cursorOffset?: number;
}

// 定义附件接口
export interface AttachmentItem {
    id: string;
    name: string;
    size: string;
    url: string;
    type: string;
}

// 模拟父级文章列表
interface ParentArticleItem {
    id: string;
    title: string;
}
const MOCK_PARENT_ARTICLES: ParentArticleItem[] = [
    { id: 'root', title: '无 (作为顶级文章)' },
    { id: '1', title: '小橘部署指南' },
    { id: '2', title: 'Docker 基础概念' },
    { id: '3', title: '常见问题 FAQ' },
];

const CATEGORIES: Category[] = [
    { id: 'algo', name: '算法与数据结构', color: 'bg-blue-600' },
    { id: 'backend', name: '后端研发', color: 'bg-violet-600' },
    { id: 'frontend', name: '前端开发', color: 'bg-pink-600' },
    { id: 'devops', name: '运维部署', color: 'bg-orange-600' },
    { id: 'product', name: '产品经理', color: 'bg-teal-600' },
];

// 限制常量
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 图片 5MB
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 附件 10MB

export default function EditorPage() {
    const navigate = useNavigate();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // 隐藏的文件输入框引用
    const fileInputRef = useRef<HTMLInputElement>(null); // 图片
    const attachmentInputRef = useRef<HTMLInputElement>(null); // 附件

    // --- 文档状态 ---
    const [title, setTitle] = useState("未命名文档");
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [tags, setTags] = useState(['笔记', 'Draft']);
    const [tagInput, setTagInput] = useState('');

    // --- 附件状态 ---
    const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

    // --- 父级文章状态 ---
    const [parentArticle, setParentArticle] = useState<ParentArticleItem>(MOCK_PARENT_ARTICLES[0]);
    const [isParentOpen, setIsParentOpen] = useState(false);
    const [isCategoryOpen, setIsCategoryOpen] = useState(false);

    // 获取今日日期
    const todayStr = new Date().toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\//g, '-');

    const [content, setContent] = useState(`> 💡 **提示**: 试一下插入图片、视频和 Mermaid 图表功能吧！

## 1. 图片测试
试试复制一张图片粘贴到这里，或者使用 \`/图片\` 命令。

## 2. Mermaid 图表
使用 \`/图表\` 命令插入一个流程图。
`);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // --- 命令菜单状态 ---
    const [showMenu, setShowMenu] = useState(false);
    // position 增加 placement 属性，用于控制向上还是向下弹出
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, placement: 'bottom' });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [slashIndex, setSlashIndex] = useState(-1);

    // --- 模拟上传函数 (通用) ---
    const mockUpload = async (file: File): Promise<string> => {
        return new Promise((resolve) => {
            setTimeout(() => {
                // 真实场景：调用 API 上传，返回 URL
                const fakeUrl = URL.createObjectURL(file);
                resolve(fakeUrl);
            }, 1000);
        });
    };

    // --- 1. 附件处理逻辑 (最大 10MB) ---
    const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // 检查大小
        for (let i = 0; i < files.length; i++) {
            if (files[i].size > MAX_ATTACHMENT_SIZE) {
                alert(`文件 ${files[i].name} 超过 10MB 限制`);
                if (attachmentInputRef.current) attachmentInputRef.current.value = '';
                return;
            }
        }

        setIsUploadingAttachment(true);
        const newAttachments: AttachmentItem[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const url = await mockUpload(file);
                newAttachments.push({
                    id: `att-${Date.now()}-${i}`,
                    name: file.name,
                    size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
                    type: file.name.split('.').pop()?.toUpperCase() || 'FILE',
                    url: url
                });
            } catch (err) {
                console.error("附件上传失败", err);
                alert(`文件 ${file.name} 上传失败`);
            }
        }

        setAttachments(prev => [...prev, ...newAttachments]);
        setIsUploadingAttachment(false);
        if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    // --- 2. 图片/文本插入处理逻辑 (修复滚动跳动) ---
    const insertTextAtCursor = (text: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        // 关键点：记录当前的滚动位置
        const scrollTop = textarea.scrollTop;

        const before = content.substring(0, start);
        const after = content.substring(end);

        const newContent = before + text + after;
        setContent(newContent);

        // 恢复焦点并移动光标，同时恢复滚动位置
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(start + text.length, start + text.length);
                // 关键点：恢复滚动位置
                textareaRef.current.scrollTop = scrollTop;
            }
        }, 0);
    };

    const processImageUpload = async (file: File) => {
        if (file.size > MAX_IMAGE_SIZE) {
            alert("图片大小不能超过 5MB");
            return;
        }

        const placeholder = `![上传中... ${file.name}]()`;
        insertTextAtCursor(placeholder);

        try {
            const url = await mockUpload(file);
            setContent(prev => prev.replace(placeholder, `![${file.name}](${url})`));
        } catch (error) {
            alert("图片上传失败");
            setContent(prev => prev.replace(placeholder, ''));
        }
    };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processImageUpload(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) processImageUpload(file);
                return;
            }
        }
    };

    // --- 3. 视频处理逻辑 ---
    const handleInsertVideo = () => {
        const url = prompt("请输入视频地址 (URL):", "https://");
        if (url) {
            const videoTag = `\n<video src="${url}" controls width="100%"></video>\n`;
            insertTextAtCursor(videoTag);
        }
    };

    // --- COMMANDS 定义 ---
    const COMMANDS: CommandItem[] = [
        { id: 'image', label: '图片', icon: <ImageIcon size={18} />, value: '', desc: '上传并插入图片 (Max 5MB)' },
        { id: 'video', label: '视频', icon: <VideoIcon size={18} />, value: '', desc: '插入视频地址' },
        {
            id: 'mermaid',
            label: 'Mermaid 图表',
            icon: <Workflow size={18} />,
            value: '\n```mermaid\ngraph TD\n    A[Start] --> B{Is it?}\n    B -- Yes --> C[OK]\n    B -- No --> D[End]\n```\n',
            cursorOffset: 0,
            desc: '插入流程图/时序图等'
        },
        { id: 'text', label: '文本', icon: <Type size={18} />, value: '', desc: '开始像往常一样输入' },
        { id: 'h1', label: '标题 1', icon: <Heading1 size={18} />, value: '# ', desc: '一级大标题' },
        { id: 'h2', label: '标题 2', icon: <Heading2 size={18} />, value: '## ', desc: '二级中标题' },
        { id: 'h3', label: '标题 3', icon: <Heading3 size={18} />, value: '### ', desc: '三级小标题' },
        { id: 'h4', label: '标题 4', icon: <Heading4 size={18} />, value: '#### ', desc: '四级小标题' },
        { id: 'h5', label: '标题 5', icon: <Heading5 size={18} />, value: '##### ', desc: '五级小标题' },
        { id: 'ul', label: '项目符号列表', icon: <List size={18} />, value: '- ', desc: '创建一个简单的列表' },
        { id: 'ol', label: '有序列表', icon: <List size={18} />, value: '1. ', desc: '创建一个带序号的列表' },
        { id: 'todo', label: '待办清单', icon: <CheckSquare size={18} />, value: '- [ ] ', desc: '跟踪任务完成情况' },
        { id: 'quote', label: '引用', icon: <Quote size={18} />, value: '> ', desc: '引用一段话' },
        { id: 'code', label: '代码块', icon: <Code size={18} />, value: '```\n\n```', cursorOffset: -4, desc: '插入代码片段' },
        { id: 'math', label: '数学公式', icon: <Sigma size={18} />, value: '$$\n\n$$', cursorOffset: -3, desc: '插入 KaTex 公式' },
        { id: 'divider', label: '分割线', icon: <Minus size={18} />, value: '---\n', desc: '视觉分割线' },
        { id: 'table', label: '表格', icon: <TableIcon size={18} />, value: '\n| 表头1 | 表头2 |\n| --- | --- |\n| 内容1 | 内容2 |\n', desc: '插入简单的表格' },
    ];

    const filteredCommands = COMMANDS.filter(cmd =>
        cmd.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.id.includes(searchQuery.toLowerCase())
    );

    // --- 自动滚动菜单 ---
    useEffect(() => {
        if (showMenu && menuRef.current) {
            const selectedElement = menuRef.current.children[selectedIndex];
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex, showMenu]);

    // --- 辅助：计算光标像素坐标 + 溢出检测 ---
    const getCaretCoordinates = () => {
        const textarea = textareaRef.current;
        if (!textarea) return { top: 0, left: 0, placement: 'bottom' };

        const { selectionStart } = textarea;
        const div = document.createElement('div');
        const style = window.getComputedStyle(textarea);
        Array.from(style).forEach(prop => {
            div.style[prop as any] = style.getPropertyValue(prop);
        });
        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.whiteSpace = 'pre-wrap';
        div.style.top = '0';
        div.style.left = '0';
        div.style.width = style.width;

        const textContent = textarea.value.substring(0, selectionStart);
        div.textContent = textContent;

        const span = document.createElement('span');
        span.textContent = '|';
        div.appendChild(span);

        document.body.appendChild(div);

        const { offsetLeft, offsetTop } = span;
        const rect = textarea.getBoundingClientRect();

        document.body.removeChild(div);

        // 基础位置：光标底部 + 滚动偏移
        const top = rect.top + offsetTop - textarea.scrollTop + 30;
        const left = rect.left + offsetLeft - textarea.scrollLeft;

        // --- 溢出检测逻辑 ---
        const MENU_HEIGHT = 300;
        const viewportHeight = window.innerHeight;

        let finalTop = top;
        let placement = 'bottom';

        if (top + MENU_HEIGHT > viewportHeight) {
            placement = 'top';
            finalTop = top - MENU_HEIGHT - 40;
        }

        return {
            top: finalTop,
            left: left,
            placement: placement
        };
    };

    // --- 交互逻辑 ---

    const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            if (!tags.includes(tagInput.trim())) {
                setTags([...tags, tagInput.trim()]);
            }
            setTagInput('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(tag => tag !== tagToRemove));
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const newCursorPos = e.target.selectionStart;
        setContent(newValue);

        if (showMenu) {
            if (newCursorPos <= slashIndex) {
                closeMenu();
                return;
            }
            const query = newValue.substring(slashIndex + 1, newCursorPos);
            if (query.includes(' ') || query.includes('\n')) {
                closeMenu();
            } else {
                setSearchQuery(query);
                setSelectedIndex(0);
            }
            return;
        }

        const charBefore = newValue.charAt(newCursorPos - 1);
        if (charBefore === '/') {
            const charBeforeSlash = newValue.charAt(newCursorPos - 2);
            if (!charBeforeSlash || /\s/.test(charBeforeSlash)) {
                const coords = getCaretCoordinates();
                setMenuPosition({
                    top: coords.top,
                    left: coords.left,
                    placement: coords.placement
                });
                setSlashIndex(newCursorPos - 1);
                setShowMenu(true);
                setSearchQuery('');
                setSelectedIndex(0);
            }
        }
    };

    const togglePreview = (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        setIsPreviewMode(prev => !prev);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyE') {
            e.preventDefault();
            togglePreview();
            return;
        }

        if (!showMenu) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            executeCommand(filteredCommands[selectedIndex]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeMenu();
        }
    };

    // --- 菜单执行逻辑 (修复滚动跳动) ---
    const executeCommand = (command: CommandItem) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        // 1. 特殊命令：图片
        if (command.id === 'image') {
            fileInputRef.current?.click();
            closeMenu();
            const beforeSlash = content.substring(0, slashIndex);
            const afterCursor = content.substring(textarea.selectionEnd);
            setContent(beforeSlash + afterCursor);
            return;
        }

        // 2. 特殊命令：视频
        if (command.id === 'video') {
            closeMenu();
            const beforeSlash = content.substring(0, slashIndex);
            const afterCursor = content.substring(textarea.selectionEnd);
            setContent(beforeSlash + afterCursor);
            setTimeout(handleInsertVideo, 100);
            return;
        }

        // 关键点：记录滚动位置
        const scrollTop = textarea.scrollTop;

        // 3. 通用文本插入
        const beforeSlash = content.substring(0, slashIndex);
        const afterCursor = content.substring(textarea.selectionEnd);

        const insertValue = command.value;
        const newContent = beforeSlash + insertValue + afterCursor;
        setContent(newContent);
        closeMenu();

        const cursorOffset = command.cursorOffset || 0;
        const newCursorPos = beforeSlash.length + insertValue.length + cursorOffset;

        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                // 关键点：恢复滚动位置
                textareaRef.current.scrollTop = scrollTop;
            }
        }, 0);
    };

    const closeMenu = () => {
        setShowMenu(false);
        setSlashIndex(-1);
        setSearchQuery('');
    };

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => {
            setIsSaving(false);
            alert("保存成功！");
        }, 800);
    };

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.code === 'KeyE') {
                e.preventDefault();
                togglePreview();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    return (
        <div className="h-screen flex flex-col bg-slate-50 font-sans overflow-hidden">

            <input type="file" ref={fileInputRef} className="hidden" accept="image/png, image/jpeg, image/gif, image/webp" onChange={handleImageChange} />
            <input type="file" ref={attachmentInputRef} className="hidden" multiple onChange={handleAttachmentChange} />

            {/* Header */}
            <header className="h-14 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 z-40 flex-shrink-0 relative">
                <div className="flex items-center gap-4 flex-1">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1 max-w-lg relative group">
                        <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                            <Edit3 className="w-4 h-4 text-slate-300 group-hover:text-orange-400 transition-colors" />
                        </div>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full pl-9 pr-4 py-1.5 bg-transparent border border-transparent hover:border-slate-200 focus:border-orange-500/50 rounded-md text-slate-800 font-bold text-lg outline-none transition-all placeholder:text-slate-300"
                            placeholder="请输入文档标题..."
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                    <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-md border border-slate-200/60">
                        <span className={`w-2 h-2 rounded-full ${isSaving ? 'bg-orange-400 animate-pulse' : 'bg-green-400'}`}></span>
                        <span className="text-xs text-slate-500 font-medium">{isSaving ? '保存中...' : '已保存'}</span>
                    </div>

                    <button
                        onClick={togglePreview}
                        className={`
                            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all select-none
                            ${isPreviewMode
                                ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-sm'
                                : 'text-slate-600 hover:bg-slate-100 border border-transparent'}
                        `}
                        title="快捷键 Cmd+E"
                    >
                        {isPreviewMode ? <Eye className="w-4 h-4" /> : <Type className="w-4 h-4" />}
                        <span className="hidden sm:inline">{isPreviewMode ? '预览模式' : '编辑模式'}</span>
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-black text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        <span>保存</span>
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <div className="flex-1 relative w-full overflow-hidden">

                {/* --- 编辑模式 --- */}
                <div className={`absolute inset-0 p-4 sm:p-6 lg:px-8 flex flex-col items-center transition-opacity duration-200 ${isPreviewMode ? 'opacity-0 pointer-events-none z-0' : 'opacity-100 z-10'}`}>

                    <div className="w-full max-w-5xl h-full bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col relative overflow-hidden">

                        {/* Meta Data Bar */}
                        <div className="px-6 sm:px-12 pt-6 pb-4 border-b border-dashed border-slate-200 flex flex-col gap-4 shrink-0">

                            {/* 行 1 */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="relative z-20">
                                    <button
                                        onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-medium transition-colors border border-slate-200"
                                    >
                                        <Folder className="w-3.5 h-3.5" />
                                        <span>{category.name}</span>
                                        <ChevronDown className="w-3 h-3 opacity-50" />
                                    </button>
                                    {isCategoryOpen && (
                                        <>
                                            <div className="fixed inset-0" onClick={() => setIsCategoryOpen(false)}></div>
                                            <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-100 py-1 animate-in fade-in zoom-in-95 duration-100">
                                                {CATEGORIES.map(cat => (
                                                    <button key={cat.id} onClick={() => { setCategory(cat); setIsCategoryOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full ${cat.color}`}></span>{cat.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="relative z-10">
                                    <button onClick={() => setIsParentOpen(!isParentOpen)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-medium transition-colors border border-slate-200 max-w-[200px]">
                                        <FileText className="w-3.5 h-3.5" /><span className="truncate">父级: {parentArticle.title}</span><ChevronDown className="w-3 h-3 opacity-50" />
                                    </button>
                                    {isParentOpen && (
                                        <>
                                            <div className="fixed inset-0" onClick={() => setIsParentOpen(false)}></div>
                                            <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-100 py-1 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                                                <div className="max-h-60 overflow-y-auto">
                                                    {MOCK_PARENT_ARTICLES.map(p => (
                                                        <button key={p.id} onClick={() => { setParentArticle(p); setIsParentOpen(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 ${p.id === parentArticle.id ? 'text-orange-600 bg-orange-50 font-medium' : 'text-slate-700'}`}>
                                                            {p.id === 'root' ? <Minus className="w-3 h-3 opacity-50" /> : <FileText className="w-3 h-3 opacity-50" />}<span className="truncate">{p.title}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

                                <div className="flex flex-wrap items-center gap-2 flex-1">
                                    {tags.map(tag => (
                                        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                                            <Tag className="w-3 h-3 opacity-50" />{tag}
                                            <button onClick={() => handleRemoveTag(tag)} className="ml-1 text-indigo-400 hover:text-indigo-800 focus:outline-none"><X className="w-3 h-3" /></button>
                                        </span>
                                    ))}
                                    <div className="relative flex items-center">
                                        <Plus className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                                        <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleAddTag} placeholder="添加标签..." className="pl-6 pr-3 py-1 text-xs bg-transparent border-none outline-none focus:ring-0 placeholder:text-slate-400 min-w-[80px]" />
                                    </div>
                                </div>
                            </div>

                            {/* 行 2：附件管理 */}
                            <div className="flex flex-col gap-3 pt-1">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <Paperclip className="w-3 h-3" /> 附件列表 ({attachments.length})
                                    </h4>
                                    <button
                                        onClick={() => attachmentInputRef.current?.click()}
                                        disabled={isUploadingAttachment}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 border border-slate-200 rounded-full text-xs text-slate-600 transition-colors shadow-sm"
                                    >
                                        {isUploadingAttachment ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                        添加附件
                                    </button>
                                </div>

                                {attachments.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                        {attachments.map(att => (
                                            <div key={att.id} className="relative group flex items-start gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-white hover:border-orange-200 hover:shadow-md transition-all duration-200">
                                                <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0 shadow-sm text-slate-500">
                                                    <File className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[11px] font-medium text-slate-700 truncate leading-tight mb-0.5" title={att.name}>{att.name}</div>
                                                    <div className="text-[9px] text-slate-400 font-mono">{att.size}</div>
                                                </div>
                                                <button
                                                    onClick={() => removeAttachment(att.id)}
                                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-all scale-90 hover:scale-100"
                                                >
                                                    <X className="w-3 h-3" strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Textarea */}
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            className="flex-1 w-full p-6 sm:px-12 resize-none outline-none text-slate-700 text-lg leading-relaxed selection:bg-orange-100 selection:text-orange-900 font-mono overflow-y-auto"
                            placeholder="输入 / 呼出命令菜单，支持粘贴图片..."
                            spellCheck={false}
                            autoFocus
                        />

                        {/* Slash Menu */}
                        {showMenu && (
                            <div
                                className={`fixed z-50 w-64 bg-white rounded-xl shadow-2xl ring-1 ring-slate-900/5 overflow-hidden flex flex-col max-h-72 animate-in fade-in zoom-in-95 duration-75`}
                                style={{
                                    top: menuPosition.top,
                                    left: Math.min(menuPosition.left, window.innerWidth - 280),
                                    // 确保菜单不会被遮挡
                                }}
                            >
                                <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                                    <span>插入内容</span>
                                    <span className="text-[9px] bg-slate-200 px-1 rounded">↑↓ 选择</span>
                                </div>
                                <div ref={menuRef} className="overflow-y-auto flex-1 py-1 scroll-smooth">
                                    {filteredCommands.length > 0 ? (
                                        filteredCommands.map((cmd, idx) => (
                                            <button
                                                key={cmd.id}
                                                onClick={() => executeCommand(cmd)}
                                                onMouseEnter={() => setSelectedIndex(idx)}
                                                className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${idx === selectedIndex ? 'bg-orange-50' : 'bg-white hover:bg-slate-50'}`}
                                            >
                                                <div className={`w-9 h-9 rounded border flex items-center justify-center flex-shrink-0 shadow-sm ${idx === selectedIndex ? 'bg-white border-orange-200 text-orange-500' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                                    {cmd.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-sm font-medium ${idx === selectedIndex ? 'text-slate-900' : 'text-slate-700'}`}>{cmd.label}</div>
                                                    <div className="text-xs text-slate-400 truncate">{cmd.desc}</div>
                                                </div>
                                                {idx === selectedIndex && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mr-1" />}
                                            </button>
                                        ))
                                    ) : (
                                        <div className="px-4 py-8 flex flex-col items-center justify-center text-slate-400"><X size={20} className="mb-2 opacity-50" /><span className="text-xs">未找到命令</span></div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="h-8 border-t border-slate-50 flex items-center justify-center text-[10px] text-slate-400 bg-white shrink-0">
                            Markdown 编辑模式 · 字数 {content.length}
                        </div>
                    </div>
                </div>

                {/* --- 预览模式 --- */}
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
                            category={category.name}
                            tags={tags}
                            date={todayStr}
                            attachments={attachments}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}