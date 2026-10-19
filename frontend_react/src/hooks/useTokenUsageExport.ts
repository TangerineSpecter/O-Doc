import {useEffect, useRef, useState} from 'react';
import {exportTokenReport, type TokenExportFilters} from '../api/tokenUsage';
import {shanghaiDay} from '../utils/tokenUsage';

export function useTokenUsageExport(filters: TokenExportFilters) {
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState('');
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => () => controllerRef.current?.abort(), []);

    const download = async () => {
        if (controllerRef.current) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        setExporting(true);
        setExportError('');
        // 冻结点击时的筛选，后续筛选切换不改变这份报告的范围。
        const params = {...filters};
        try {
            const blob = await exportTokenReport(params, controller.signal);
            if (controller.signal.aborted) return;
            const url = URL.createObjectURL(blob);
            try {
                const link = document.createElement('a');
                link.href = url;
                link.download = params.include_content
                    ? `agent-token-details-${params.record_id}-${Date.now()}.json`
                    : `agent-token-usage-${shanghaiDay()}-${Date.now()}.json`;
                document.body.appendChild(link);
                try {link.click();} finally {link.remove();}
            } finally {
                URL.revokeObjectURL(url);
            }
        } catch {
            if (!controller.signal.aborted) setExportError(params.include_content
                ? '任务明细导出失败，请重试。'
                : '用量报告导出失败，请重试；大量历史可缩小日期范围后导出。');
        } finally {
            if (!controller.signal.aborted) setExporting(false);
            if (controllerRef.current === controller) controllerRef.current = null;
        }
    };

    return {exporting, exportError, download};
}
