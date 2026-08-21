import {useEffect, useRef, useState} from 'react';
import type {RefObject} from 'react';

export const useArticlePrintExport = (
    articlePrintRef: RefObject<HTMLDivElement | null>,
    onError: (message: string) => void,
) => {
    const printCloneRef = useRef<HTMLDivElement | null>(null);
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    useEffect(() => {
        const removePrintClone = () => {
            document.body.classList.remove('article-printing');
            printCloneRef.current?.remove();
            printCloneRef.current = null;
        };
        const handleAfterPrint = () => {
            removePrintClone();
            setIsExportingPdf(false);
        };
        window.addEventListener('afterprint', handleAfterPrint);
        return () => {
            window.removeEventListener('afterprint', handleAfterPrint);
            removePrintClone();
        };
    }, []);

    const handleExportPdf = async () => {
        if (isExportingPdf || !articlePrintRef.current) return;

        setIsExportingPdf(true);
        try {
            await document.fonts?.ready;
            printCloneRef.current?.remove();

            const clone = articlePrintRef.current.cloneNode(true) as HTMLDivElement;
            clone.classList.add('article-print-clone');
            clone.classList.remove('article-print-page');
            document.body.appendChild(clone);
            document.body.classList.add('article-printing');
            printCloneRef.current = clone;

            await new Promise(requestAnimationFrame);
            window.print();
        } catch (error) {
            console.error('Failed to open print dialog:', error);
            onError('打开导出窗口失败，请稍后重试');
            document.body.classList.remove('article-printing');
            printCloneRef.current?.remove();
            printCloneRef.current = null;
            setIsExportingPdf(false);
        }
    };

    return {isExportingPdf, handleExportPdf};
};
