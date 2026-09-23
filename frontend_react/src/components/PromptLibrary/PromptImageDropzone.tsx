import {useEffect, useRef, useState} from 'react';
import {ImagePlus, UploadCloud, X} from 'lucide-react';

interface Props {
    files: File[];
    onChange: (files: File[]) => void;
    compact?: boolean;
}

const MAX_IMAGES = 12;
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const ACCEPTED_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif)$/i;

interface FilePreviewProps {
    file: File;
    onRemove: () => void;
}

function FilePreview({file, onRemove}: FilePreviewProps) {
    const [preview, setPreview] = useState<{file: File; url: string} | null>(null);

    useEffect(() => {
        let active = true;
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            if (active && typeof reader.result === 'string') setPreview({file, url: reader.result});
        });
        reader.readAsDataURL(file);
        return () => {
            active = false;
            if (reader.readyState === FileReader.LOADING) reader.abort();
        };
    }, [file]);

    const previewUrl = preview?.file === file ? preview.url : '';

    return (
        <div className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {previewUrl ? (
                <img src={previewUrl} alt={file.name} className="h-full w-full object-cover"/>
            ) : (
                <span className="flex h-full w-full items-center justify-center" aria-label={`${file.name} 正在生成预览`}>
                    <span className="h-5 w-5 animate-pulse rounded-md bg-slate-200"/>
                </span>
            )}
            <button
                type="button"
                onClick={onRemove}
                className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 text-white opacity-90 transition-opacity hover:bg-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={`移除 ${file.name}`}
            >
                <X className="h-3 w-3"/>
            </button>
        </div>
    );
}

export default function PromptImageDropzone({files, onChange, compact = false}: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    const addFiles = (incoming: File[]) => {
        const unique = new Map(files.map(file => [`${file.name}:${file.size}:${file.lastModified}`, file]));
        incoming.filter(file => ACCEPTED_TYPES.has(file.type) || (!file.type && ACCEPTED_EXTENSIONS.test(file.name))).forEach(file => unique.set(`${file.name}:${file.size}:${file.lastModified}`, file));
        onChange(Array.from(unique.values()).slice(0, MAX_IMAGES));
    };

    return (
        <div>
            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                multiple
                className="hidden"
                onChange={event => {
                    addFiles(Array.from(event.target.files || []));
                    event.target.value = '';
                }}
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={event => { event.preventDefault(); setDragging(true); }}
                onDragOver={event => event.preventDefault()}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
                onDrop={event => {
                    event.preventDefault();
                    setDragging(false);
                    addFiles(Array.from(event.dataTransfer.files));
                }}
                className={`flex w-full items-center justify-center rounded-xl border border-dashed transition-colors ${compact ? 'min-h-20 px-3 py-3' : 'min-h-28 px-4 py-4'} ${dragging ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-300 bg-slate-50/60 text-slate-500 hover:border-orange-300 hover:bg-orange-50/50'}`}
            >
                <span className="flex flex-col items-center gap-1 text-center">
                    {dragging ? <UploadCloud className="h-6 w-6 text-orange-500"/> : <ImagePlus className="h-6 w-6 text-orange-400"/>}
                    <span className="text-xs font-semibold">{dragging ? '松开即可添加' : '拖拽图片到这里，或点击选择'}</span>
                    <span className="text-[10px] text-slate-400">PNG / JPG / WebP / GIF / AVIF，最多 {MAX_IMAGES} 张</span>
                </span>
            </button>

            {files.length > 0 && (
                <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {files.map((file, index) => <FilePreview key={`${file.name}:${file.size}:${file.lastModified}`} file={file} onRemove={() => onChange(files.filter((_, position) => position !== index))}/>)}
                </div>
            )}
        </div>
    );
}
