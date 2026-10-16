import {useState} from 'react';
import {Download, LoaderCircle} from 'lucide-react';
import {downloadCatalogWorkbook, type CatalogExportSheet} from '../../utils/catalogSpreadsheet';

export default function DataExportButton({sheets, fileName, disabled = false}: {
    sheets: CatalogExportSheet[]; fileName: string; disabled?: boolean;
}) {
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');

    const exportData = async () => {
        setExporting(true);
        setError('');
        try {
            await downloadCatalogWorkbook(fileName, sheets);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '导出失败，请重试');
        } finally {
            setExporting(false);
        }
    };

    return <div className="inline-flex flex-col items-end gap-1">
        <button
            type="button"
            onClick={() => void exportData()}
            disabled={disabled || exporting || sheets.length === 0}
            aria-busy={exporting}
            title={`按图鉴显示名称导出，共 ${sheets.length} 个工作表，不包含图标图片`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-xs transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
        >
            {exporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin"/> : <Download className="h-3.5 w-3.5 text-orange-500"/>}
            {exporting ? '生成中…' : '导出 Excel'}
        </button>
        {error && <span role="alert" className="max-w-56 text-right text-[11px] text-red-600">{error}</span>}
    </div>;
}
