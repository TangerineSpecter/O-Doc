import {useEffect, useRef, useState} from 'react';
import {exportObservation, type ObservationExportSelection} from '../api/tokenUsage';

export function useObservationExport() {
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => () => controllerRef.current?.abort(), []);

    const download = async (selection: ObservationExportSelection) => {
        if (controllerRef.current) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        setExporting(true);
        setError('');
        try {
            // Freeze the visible selection when the user clicks, even if the filter changes.
            const blob = await exportObservation({...selection, requestIds: [...selection.requestIds]}, controller.signal);
            if (controller.signal.aborted) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `activity-observation-${selection.startDate}-${selection.endDate}.json`;
            document.body.appendChild(link);
            try {link.click();} finally {
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 0);
            }
        } catch {
            if (!controller.signal.aborted) setError('导出失败，请刷新观测数据后重试。');
        } finally {
            if (!controller.signal.aborted) setExporting(false);
            if (controllerRef.current === controller) controllerRef.current = null;
        }
    };

    return {download, exporting, error, clearError: () => setError('')};
}
