import { useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import type { QuantSource } from '../../types/api/quant';
import { ReportMarkdown } from './ReportMarkdown';
import { QuantModal } from './ui';

/** Read the selected source's saved description without changing its original text. */
export function SourceDescription({ source }: { source: QuantSource }) {
    const [open, setOpen] = useState(false);
    const description = source.payload.description || '';
    const hasDescription = Boolean(description.trim());
    return (
        <>
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                disabled={!hasDescription}
                onClick={() => setOpen(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/30 focus-visible:outline-2 focus-visible:outline-orange-500 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-white"
            >
                <FileText size={18} className="shrink-0 text-orange-500" />
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900">作者说明</span>
                    <span className="mt-1 block text-xs text-slate-500">
                        {hasDescription ? '查看添加此来源时保存的说明与使用方法' : '此来源未填写作者说明'}
                    </span>
                </span>
                {hasDescription && <ChevronRight size={18} className="shrink-0 text-slate-400" />}
            </button>
            {open && (
                <QuantModal title="作者说明" subtitle="添加当前来源时保存的原始说明" close={() => setOpen(false)} wide>
                    <ReportMarkdown text={description} preserveOriginal />
                </QuantModal>
            )}
        </>
    );
}
