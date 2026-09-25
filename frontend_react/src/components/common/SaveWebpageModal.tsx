import {useRef, useState} from 'react';
import {
    FileCode2, FileText, Globe2, ImageDown, Link as LinkIcon, Loader2,
    ScanText, Sparkles, UploadCloud, X
} from 'lucide-react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

interface CommonImportOptions {
    importMode?: 'extract' | 'original';
    useAiExtraction: boolean;
    needPolishing: boolean;
}

export type WebpageImportOptions = CommonImportOptions & (
    {sourceType: 'url'; url: string}
    | {sourceType: 'file'; files: File[]}
);

export interface WebpageImportProgress {
    completed: number;
    total: number;
    currentFile?: string;
}

interface SaveWebpageModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (
        options: WebpageImportOptions,
        onProgress: (progress: WebpageImportProgress) => void,
    ) => Promise<void>;
}

interface ImportOptionProps {
    checked: boolean;
    disabled: boolean;
    title: string;
    description: string;
    icon: typeof ScanText;
    onChange: (checked: boolean) => void;
}

const ACCEPTED_FILE_PATTERN = /\.(?:html?|md|markdown|zip)$/i;
const MAX_IMPORT_FILE_BYTES = 30 * 1024 * 1024;
const MAX_IMPORT_FILE_COUNT = 50;

const ImportOption = ({checked, disabled, title, description, icon: Icon, onChange}: ImportOptionProps) => (
    <label className={`group flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${checked ? 'border-orange-300 bg-orange-50/80 shadow-sm shadow-orange-100' : 'border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/30'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} className="peer sr-only"/>
        <span aria-hidden="true" className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${checked ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500 group-hover:text-orange-600'}`}>
            <Icon size={16}/>
        </span>
        <span className="min-w-0 flex-1">
            <span className={`block text-sm font-semibold ${checked ? 'text-orange-800' : 'text-slate-700'}`}>{title}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
        </span>
        <span aria-hidden="true" className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${checked ? 'border-orange-500 bg-orange-500' : 'border-slate-300 bg-white'}`}>
            {checked && <span className="h-2 w-2 rounded-sm bg-white"/>}
        </span>
    </label>
);

export default function SaveWebpageModal({isOpen, onClose, onConfirm}: SaveWebpageModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [sourceType, setSourceType] = useState<'url' | 'file'>('url');
    const [url, setUrl] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [useAiExtraction, setUseAiExtraction] = useState(false);
    const [needPolishing, setNeedPolishing] = useState(false);
    const [importMode, setImportMode] = useState<'extract' | 'original'>('extract');
    const [isLoading, setIsLoading] = useState(false);
    const [importProgress, setImportProgress] = useState<WebpageImportProgress | null>(null);
    const [error, setError] = useState('');

    const resetForm = () => {
        setSourceType('url');
        setUrl('');
        setFiles([]);
        setIsDragging(false);
        setUseAiExtraction(false);
        setNeedPolishing(false);
        setImportMode('extract');
        setIsLoading(false);
        setImportProgress(null);
        setError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        if (isLoading) return;
        resetForm();
        onClose();
    };
    useEscapeDismissal(isOpen, handleClose);

    const selectFiles = (nextFiles: File[]) => {
        if (!nextFiles.length) return;
        if (nextFiles.length > MAX_IMPORT_FILE_COUNT) {
            setFiles([]);
            setError(`一次最多导入 ${MAX_IMPORT_FILE_COUNT} 个文件`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        const unsupportedFiles = nextFiles.filter(file => !ACCEPTED_FILE_PATTERN.test(file.name));
        if (unsupportedFiles.length) {
            setFiles([]);
            setError(`有 ${unsupportedFiles.length} 个文件格式不支持，仅支持 HTML、HTM、MD、Markdown 和 ZIP`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        const oversizedFiles = nextFiles.filter(file => file.size > MAX_IMPORT_FILE_BYTES);
        if (oversizedFiles.length) {
            setFiles([]);
            setError(`有 ${oversizedFiles.length} 个文件超过 30 MB`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        const uniqueFiles = nextFiles.filter((file, index) => nextFiles.findIndex(candidate => (
            candidate.name === file.name
            && candidate.size === file.size
            && candidate.lastModified === file.lastModified
        )) === index);
        setFiles(uniqueFiles);
        setError('');
    };

    const handleSubmit = async () => {
        const normalizedUrl = url.trim();
        if (sourceType === 'url' && !normalizedUrl) {
            setError('请输入有效的网址');
            return;
        }
        if (sourceType === 'url' && !/^https?:\/\//i.test(normalizedUrl)) {
            setError('网址必须以 http:// 或 https:// 开头');
            return;
        }
        if (sourceType === 'file' && !files.length) {
            setError('请选择需要导入的笔记文件');
            return;
        }
        if (sourceType === 'file' && files.some(file => !(importMode === 'original' ? /\.(html?|zip)$/i : /\.(html?|md|markdown)$/i).test(file.name))) {
            setError(importMode === 'original' ? '原样导入请选择 HTML、HTM 或 ZIP' : '解析导入请选择 HTML 或 Markdown');
            return;
        }

        try {
            setIsLoading(true);
            setImportProgress(null);
            setError('');
            if (sourceType === 'url') {
                await onConfirm(
                    {sourceType, url: normalizedUrl, useAiExtraction, needPolishing},
                    setImportProgress,
                );
            } else if (files.length) {
                await onConfirm(
                    {sourceType, files, importMode, useAiExtraction: importMode === 'extract' && useAiExtraction, needPolishing: importMode === 'extract' && needPolishing},
                    setImportProgress,
                );
            }
            resetForm();
        } catch {
            setIsLoading(false);
            setImportProgress(null);
        }
    };

    if (!isOpen) return null;
    const loadingLabel = importProgress && importProgress.total > 1
        ? `正在导入 ${Math.min(importProgress.completed + 1, importProgress.total)}/${importProgress.total}`
        : useAiExtraction ? 'AI 识别与保存中...' : '解析并保存中...';

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleClose}/>
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-600"><Globe2 size={19}/></div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">导入文章到知识库</h3>
                            <p className="mt-0.5 text-xs text-slate-500">从网址或本地文件识别正文与原始图片</p>
                        </div>
                    </div>
                    <button type="button" onClick={handleClose} disabled={isLoading} aria-label="关闭文章导入弹窗" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-600 disabled:opacity-50"><X size={19}/></button>
                </div>

                <div className="max-h-[72vh] space-y-5 overflow-y-auto p-6">
                    <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="文章导入来源">
                        {([{id: 'url' as const, label: '网址导入', icon: LinkIcon}, {id: 'file' as const, label: '文件导入', icon: FileCode2}]).map(item => (
                            <button key={item.id} type="button" role="tab" aria-selected={sourceType === item.id} disabled={isLoading} onClick={() => { setSourceType(item.id); setError(''); }} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${sourceType === item.id ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                <item.icon size={16}/>{item.label}
                            </button>
                        ))}
                    </div>

                    {sourceType === 'url' ? (
                        <div className="space-y-2">
                            <label htmlFor="webpage-import-url" className="block text-sm font-semibold text-slate-700">目标网址 <span className="text-red-500">*</span></label>
                            <div className="group relative">
                                <LinkIcon size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500"/>
                                <input id="webpage-import-url" type="url" value={url} maxLength={500} onChange={event => { setUrl(event.target.value); setError(''); }} onKeyDown={event => { if (event.key === 'Enter' && !isLoading) void handleSubmit(); }} placeholder="https://example.com/article" className={`w-full rounded-lg border bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition-all ${error ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'}`} autoFocus/>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <span className="block text-sm font-semibold text-slate-700">文章文件 <span className="text-red-500">*</span></span>
                            <div className="flex gap-3 text-sm text-slate-600">
                                <label><input type="radio" checked={importMode === 'extract'} disabled={isLoading} onChange={() => setImportMode('extract')}/> 解析为可编辑笔记</label>
                                <label><input type="radio" checked={importMode === 'original'} disabled={isLoading} onChange={() => setImportMode('original')}/> 保留原样 HTML</label>
                            </div>
                            {importMode === 'original' && <p className="text-xs leading-5 text-slate-500">保留静态页面样式，正文只读；支持 HTML 与素材目录打包为 ZIP，不执行脚本。</p>}
                            <input ref={fileInputRef} type="file" multiple accept=".html,.htm,.md,.markdown,.zip,text/html,text/markdown" disabled={isLoading} onChange={event => selectFiles(Array.from(event.target.files || []))} className="sr-only"/>
                            <button type="button" disabled={isLoading} onClick={() => fileInputRef.current?.click()} onDragOver={event => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={event => { event.preventDefault(); setIsDragging(false); selectFiles(Array.from(event.dataTransfer.files)); }} className={`flex w-full items-center gap-4 rounded-xl border border-dashed px-4 py-5 text-left transition-all ${isDragging ? 'border-orange-500 bg-orange-50' : files.length ? 'border-orange-300 bg-orange-50/50' : 'border-slate-300 bg-slate-50/60 hover:border-orange-300 hover:bg-orange-50/40'}`}>
                                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${files.length ? 'bg-orange-500 text-white' : 'bg-white text-orange-500 shadow-sm'}`}>{files.length ? <FileText size={20}/> : <UploadCloud size={21}/>}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-slate-700">{files.length ? `已选择 ${files.length} 个文件` : '点击选择或拖入一个或多个文章文件'}</span>
                                    <span className="mt-1 block text-xs text-slate-500">HTML / HTM / MD / Markdown / ZIP，单文件最大 30 MB，最多 50 个</span>
                                </span>
                            </button>
                            {files.length > 0 && (
                                <div className="max-h-24 space-y-1 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                    {files.map(file => <div key={`${file.name}-${file.size}-${file.lastModified}`} className="truncate">{file.name}</div>)}
                                </div>
                            )}
                            {isLoading && importProgress?.currentFile && (
                                <p className="truncate text-xs text-orange-600">正在处理：{importProgress.currentFile}</p>
                            )}
                        </div>
                    )}

                    {error && <p className="text-xs font-medium text-red-500">{error}</p>}

                    <div className={`space-y-3 ${sourceType === 'file' && importMode === 'original' ? 'hidden' : ''}`}>
                        <ImportOption checked={useAiExtraction} disabled={isLoading} title="AI 正文提取" description="从 HTML 候选或 Markdown 中清除残余噪声；失败时自动使用普通结果。" icon={ScanText} onChange={setUseAiExtraction}/>
                        <ImportOption checked={needPolishing} disabled={isLoading} title="AI 智能润色" description="正文录入后在后台优化表达和 Markdown 排版，不改变文章原意。" icon={Sparkles} onChange={setNeedPolishing}/>
                    </div>

                    <div className="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
                        <ImageDown size={15} className="mt-0.5 shrink-0 text-orange-500"/>
                        <span>{sourceType === 'file' ? '支持批量导入；HTML 存档中的内嵌正文图片会优先直接保存，单个文件失败不会影响其他文件。' : '正文图片会优先按原图保存到本地资源库；无法下载时保留外链。'}</span>
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                    <button type="button" onClick={handleClose} disabled={isLoading} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">取消</button>
                    <button type="button" onClick={() => void handleSubmit()} disabled={isLoading} className="flex min-w-28 items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70">
                        {isLoading && <Loader2 size={16} className="animate-spin"/>}{isLoading ? loadingLabel : sourceType === 'file' && files.length > 1 ? `批量导入 (${files.length})` : '开始导入'}
                    </button>
                </div>
            </div>
        </div>
    );
}
