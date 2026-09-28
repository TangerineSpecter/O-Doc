export function ItemImagePagination({page, total, pageSize, disabled, onPage}: {
    page: number; total: number; pageSize: number; disabled?: boolean; onPage: (page: number) => void;
}) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>共 {total} 项 · 第 {page} / {pages} 页</span>
        <div className="flex gap-2">
            <button type="button" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">上一页</button>
            <button type="button" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">下一页</button>
        </div>
    </div>;
}
