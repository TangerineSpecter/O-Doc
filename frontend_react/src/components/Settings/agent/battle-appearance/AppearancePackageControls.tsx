import {useRef} from 'react';
import {Download, Upload} from 'lucide-react';

interface Props {
    disabled: boolean;
    canExport: boolean;
    onExport: () => void;
    onImport: (file?: File) => void;
}
export function AppearancePackageControls({disabled, canExport, onExport, onImport}: Props) {
    const input = useRef<HTMLInputElement>(null);
    const style = 'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50';
    return <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <button type="button" disabled={disabled || !canExport} onClick={onExport} className={style}><Download className="h-4 w-4"/>导出形象包</button>
        <button type="button" disabled={disabled} onClick={() => input.current?.click()} className={style}><Upload className="h-4 w-4"/>导入形象包</button>
        <input ref={input} type="file" accept=".json,application/json" className="hidden" onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; onImport(file);}}/>
        <p className="text-xs leading-5 text-slate-500">完整保留角色素材与双手、武器布局；导入后检查并保存。不会更换职业或装备。</p>
    </div>;
}
