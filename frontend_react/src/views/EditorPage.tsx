import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Article from './Article';
import {
    Save, ArrowLeft, Eye, Edit3,
    Heading1, Heading2, Heading3, Heading4, Heading5,
    Quote, Code, List, CheckSquare,
    Table as TableIcon, Sigma, Type, Minus,
    X, Tag, Folder, Plus, ChevronDown, FileText
} from 'lucide-react';

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

// 1. 模拟父级文章列表 (实际应从API获取当前文集下的其他文章)
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

const COMMANDS: CommandItem[] = [
    { id: 'text', label: '文本', icon: <Type size={18} />, value: '', desc: '开始像往常一样输入' },
    { id: 'h1', label: '标题 1', icon: <Heading1 size={18} />, value: '# ', desc: '一级大标题' },
    { id: 'h2', label: '标题 2', icon: <Heading2 size={18} />, value: '## ', desc: '二级中标题' },
    { id: 'h3', label: '标题 3', icon: <Heading3 size={18} />, value: '### ', desc: '三级小标题' },
    { id: 'h4', label: '标题 4', icon: <Heading4 size={18} />, value: '#### ', desc: '四级标题' },
    { id: 'h5', label: '标题 5', icon: <Heading5 size={18} />, value: '##### ', desc: '五级标题' },
    { id: 'ul', label: '项目符号列表', icon: <List size={18} />, value: '- ', desc: '创建一个简单的列表' },
    { id: 'ol', label: '有序列表', icon: <List size={18} />, value: '1. ', desc: '创建一个带序号的列表' },
    { id: 'todo', label: '待办清单', icon: <CheckSquare size={18} />, value: '- [ ] ', desc: '跟踪任务完成情况' },
    { id: 'quote', label: '引用', icon: <Quote size={18} />, value: '> ', desc: '引用一段话' },
    { id: 'code', label: '代码块', icon: <Code size={18} />, value: '```\n\n```', cursorOffset: -4, desc: '插入代码片段' },
    { id: 'math', label: '数学公式', icon: <Sigma size={18} />, value: '$$\n\n$$', cursorOffset: -3, desc: '插入 KaTex 公式' },
    { id: 'divider', label: '分割线', icon: <Minus size={18} />, value: '---\n', desc: '视觉分割线' },
    { id: 'table', label: '表格', icon: <TableIcon size={18} />, value: '\n| 表头1 | 表头2 |\n| --- | --- |\n| 内容1 | 内容2 |\n', desc: '插入简单的表格' },
];

const CATEGORIES: Category[] = [
    { id: 'algo', name: '算法与数据结构', color: 'bg-blue-600' },
    { id: 'backend', name: '后端研发', color: 'bg-violet-600' },
    { id: 'frontend', name: '前端开发', color: 'bg-pink-600' },
    { id: 'devops', name: '运维部署', color: 'bg-orange-600' },
    { id: 'product', name: '产品经理', color: 'bg-teal-600' },
];

export default function EditorPage() {
    const navigate = useNavigate();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // --- 文档状态 ---
    const [title, setTitle] = useState("未命名文档");
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [tags, setTags] = useState(['笔记', 'Draft']);
    const [tagInput, setTagInput] = useState('');

    // 2. 新增：父级文章状态
    const [parentArticle, setParentArticle] = useState<ParentArticleItem>(MOCK_PARENT_ARTICLES[0]);
    const [isParentOpen, setIsParentOpen] = useState(false);
    const [isCategoryOpen, setIsCategoryOpen] = useState(false);

    // 获取今日日期并格式化
    const todayStr = new Date().toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\//g, '-');

    const [content, setContent] = useState(`> 💡 **提示**: 布局与预览细节优化完毕！

## 1. 修复内容
- **重复展示移除**: 预览模式下删除了顶部重复的标题和标签栏，现在由文章组件统一渲染，更加清爽。
- **日期动态更新**: 预览时的日期现在显示为 **${todayStr}**，不再是写死的旧日期。
- **布局优化**: 编辑器内容区高度自适应，底部信息不再被遮挡。

## 2. 交互测试
- 尝试修改标题、分类或标签，按下 \`Cmd + E\` 切换预览，查看同步效果。
`);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // --- 命令菜单状态 (保持不变) ---
    const [showMenu, setShowMenu] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [slashIndex, setSlashIndex] = useState(-1);

    const filteredCommands = COMMANDS.filter(cmd =>
        cmd.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.id.includes(searchQuery.toLowerCase())
    );

    // ... (交互逻辑 useEffects, getCaretCoordinates, handleChange, handleKeyDown 等函数保持不变) ...
    // --- 自动滚动菜单 ---
    useEffect(() => {
        if (showMenu && menuRef.current) {
            const selectedElement = menuRef.current.children[selectedIndex];
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex, showMenu]);

    // --- 辅助：计算光标像素坐标 ---
    const getCaretCoordinates = () => {
        const textarea = textareaRef.current;
        if (!textarea) return { top: 0, left: 0 };

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
        const rect = textarea.getBoundingClientRect(); // 相对于视口

        document.body.removeChild(div);

        return {
            top: rect.top + offsetTop - textarea.scrollTop + 30,
            left: rect.left + offsetLeft - textarea.scrollLeft
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
                setMenuPosition(coords);
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
        // 全局快捷键拦截 Cmd+E / Ctrl+E
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

    const executeCommand = (command: CommandItem) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const beforeSlash = content.substring(0, slashIndex);
        const afterCursor = content.substring(textarea.selectionEnd);

        const insertValue = command.value;
        const newContent = beforeSlash + insertValue + afterCursor;
        setContent(newContent);
        closeMenu();

        const cursorOffset = command.cursorOffset || 0;
        const newCursorPos = beforeSlash.length + insertValue.length + cursorOffset;

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(newCursorPos, newCursorPos);
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

            {/* Header (保持不变) */}
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

                {/* --- 编辑模式 (Fixed Layout) --- */}
                <div className={`absolute inset-0 p-4 sm:p-6 lg:px-8 flex flex-col items-center transition-opacity duration-200 ${isPreviewMode ? 'opacity-0 pointer-events-none z-0' : 'opacity-100 z-10'}`}>

                    {/* “白纸”容器 */}
                    <div className="w-full max-w-5xl h-full bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col relative overflow-hidden">

                        {/* Meta Data Bar */}
                        <div className="px-6 sm:px-12 pt-6 pb-2 flex flex-col sm:flex-row sm:items-center gap-4 border-b border-transparent shrink-0">
                            {/* Category */}
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
                                                <button
                                                    key={cat.id}
                                                    onClick={() => { setCategory(cat); setIsCategoryOpen(false); }}
                                                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${cat.color}`}></span>
                                                    {cat.name}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 2. 新增：Parent Article Dropdown */}
                            <div className="relative z-10">
                                <button
                                    onClick={() => setIsParentOpen(!isParentOpen)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-medium transition-colors border border-slate-200 max-w-[200px]"
                                    title="设置父级文章"
                                >
                                    <FileText className="w-3.5 h-3.5" />
                                    <span className="truncate">父级: {parentArticle.title}</span>
                                    <ChevronDown className="w-3 h-3 opacity-50" />
                                </button>
                                {isParentOpen && (
                                    <>
                                        <div className="fixed inset-0" onClick={() => setIsParentOpen(false)}></div>
                                        <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-100 py-1 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                                            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-medium">
                                                选择父级文章
                                            </div>
                                            <div className="max-h-60 overflow-y-auto">
                                                {MOCK_PARENT_ARTICLES.map(p => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => { setParentArticle(p); setIsParentOpen(false); }}
                                                        className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 ${p.id === parentArticle.id ? 'text-orange-600 bg-orange-50 font-medium' : 'text-slate-700'}`}
                                                    >
                                                        {p.id === 'root' ? <Minus className="w-3 h-3 opacity-50" /> : <FileText className="w-3 h-3 opacity-50" />}
                                                        <span className="truncate">{p.title}</span>
                                                        {p.id === parentArticle.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-500"></div>}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

                            {/* Tags */}
                            <div className="flex flex-wrap items-center gap-2 flex-1">
                                {tags.map(tag => (
                                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                                        <Tag className="w-3 h-3 opacity-50" />
                                        {tag}
                                        <button onClick={() => handleRemoveTag(tag)} className="ml-1 text-indigo-400 hover:text-indigo-800 focus:outline-none"><X className="w-3 h-3" /></button>
                                    </span>
                                ))}
                                <div className="relative flex items-center">
                                    <Plus className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={tagInput}
                                        onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={handleAddTag}
                                        placeholder="添加标签..."
                                        className="pl-6 pr-3 py-1 text-xs bg-transparent border-none outline-none focus:ring-0 placeholder:text-slate-400 min-w-[80px]"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Textarea */}
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            className="flex-1 w-full p-6 sm:px-12 resize-none outline-none text-slate-700 text-lg leading-relaxed selection:bg-orange-100 selection:text-orange-900 font-mono overflow-y-auto"
                            placeholder="输入 / 呼出命令菜单..."
                            spellCheck={false}
                            autoFocus
                        />

                        {/* Slash Menu ... (同上，保持不变) */}
                        {showMenu && (
                            <div
                                className="fixed z-50 w-64 bg-white rounded-xl shadow-2xl ring-1 ring-slate-900/5 overflow-hidden animate-in fade-in zoom-in-95 duration-75 flex flex-col max-h-72"
                                style={{
                                    top: menuPosition.top,
                                    left: Math.min(menuPosition.left, window.innerWidth - 280)
                                }}
                            >
                                <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                                    <span>选择区块</span>
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
                        {/* 重点修改：这里不再手动渲染 Header，而是直接将属性传给 Article 组件 */}
                        {/* Article 组件内部会渲染美观的头部 */}

                        {/* 注意：我们在 Article.jsx 中已经做了修改，
                            如果不传入 children 或 contentWithSyntax 逻辑不变，
                            它会使用传入的 title, category, tags, date 等 props 来渲染头部。
                        */}

                        <Article
                            isEmbedded={true}
                            content={content}
                            scrollContainerId="preview-scroll-container"
                            // 传递动态属性
                            title={title}
                            category={category.name}
                            tags={tags}
                            date={todayStr}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}