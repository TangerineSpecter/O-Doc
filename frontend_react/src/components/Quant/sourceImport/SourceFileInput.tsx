import { useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { FileCode2, Upload } from 'lucide-react';
import { decodeImportedSource, SOURCE_IMPORT_ACCEPT, SOURCE_IMPORT_LIMITS, type ImportedSource } from '../../../utils/quantSourceImport';
import type { QuantIntakeInput } from '../../../types/api/quant';
import { CodeEditor } from '../CodeEditor';

export function SourceFileInput({ code, language, disabled, onChange, onImport }: {
    code: string;
    language: Exclude<QuantIntakeInput['language'], 'auto'>;
    disabled: boolean;
    onChange: (code: string) => void;
    onImport: (source: ImportedSource) => void;
}) {
    const picker = useRef<HTMLInputElement>(null);
    const currentCode = useRef(code);
    const requestId = useRef(0);
    const [dragging, setDragging] = useState(false);
    const [reading, setReading] = useState(false);
    const [error, setError] = useState('');
    const [pending, setPending] = useState<ImportedSource | null>(null);
    useLayoutEffect(() => { currentCode.current = code; }, [code]);

    const load = async (files: FileList | File[]) => {
        const id = ++requestId.current;
        setPending(null);
        setError('');
        if (files.length !== 1) {
            setError('请一次选择一个源码文件。');
            setReading(false);
            return;
        }
        const file = files[0];
        if (file.size > SOURCE_IMPORT_LIMITS.bytes) {
            setError(SOURCE_IMPORT_LIMITS.byteMessage);
            setReading(false);
            return;
        }
        setReading(true);
        try {
            const source = decodeImportedSource(await file.arrayBuffer(), file.name);
            if (id !== requestId.current) return;
            if (currentCode.current.trim()) setPending(source);
            else onImport(source);
        } catch (reason) {
            if (id === requestId.current) setError(reason instanceof Error ? reason.message : '读取文件失败，请重试。');
        } finally {
            if (id === requestId.current) setReading(false);
        }
    };
    const fileDrag = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

    return <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-700">源代码</span>
            <button type="button" disabled={disabled || reading} onClick={() => picker.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-orange-200 hover:text-orange-600 disabled:opacity-50">
                <Upload size={13} />选择源码文件
            </button>
            <input ref={picker} type="file" accept={SOURCE_IMPORT_ACCEPT} className="hidden" aria-label="选择源码文件" disabled={disabled || reading}
                onChange={event => { const files = event.currentTarget.files; if (files?.length) void load(files); event.currentTarget.value = ''; }} />
        </div>
        <p className="text-xs leading-5 text-slate-500">拖入源码文件或点击选择，自动填入代码并识别语言。</p>
        <div className={`relative rounded-xl ${dragging ? 'ring-2 ring-orange-400' : ''}`}
            onDragEnter={event => { if (fileDrag(event)) { event.preventDefault(); setDragging(true); } }}
            onDragOver={event => { if (fileDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; } }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
            onDropCapture={event => {
                if (!fileDrag(event)) return;
                event.preventDefault(); event.stopPropagation(); setDragging(false);
                if (!disabled) void load(event.dataTransfer.files);
            }}>
            <CodeEditor value={code} onChange={onChange} language={language} />
            {dragging && <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-orange-50/90 text-sm font-semibold text-orange-700">
                <FileCode2 size={18} className="mr-2" />松开以读取源码
            </div>}
        </div>
        {reading && <p role="status" className="text-xs text-slate-500">正在读取源码…</p>}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {pending && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>源码框已有内容，是否替换为所选文件的内容？</span>
            <div className="flex gap-2">
                <button type="button" onClick={() => setPending(null)} className="rounded-md px-2 py-1 font-medium hover:bg-amber-100">保留原内容</button>
                <button type="button" onClick={() => { onImport(pending); setPending(null); }} className="rounded-md bg-amber-700 px-2 py-1 font-medium text-white hover:bg-amber-800">替换源码</button>
            </div>
        </div>}
    </div>;
}
