import {useState} from 'react';
import {ImagePlus, Package, Pencil, Trash2} from 'lucide-react';
import {useItemIconLibraryActions} from '../../hooks/useItemIconLibraryActions';
import {useItemImages} from '../../hooks/useItemImages';
import type {ItemIcon} from '../../types/api/itemIcons';
import {useToast} from '../common/ToastProvider';
import {ItemIconImage} from './ItemIconImage';
import {ItemIconUploadForm} from './ItemIconUploadForm';
import {ItemImagePagination} from './ItemImagePagination';
import WorldDialog from './WorldDialog';

export function ItemIconLibraryDialog({onClose}: {onClose: () => void}) {
    const [search, setSearch] = useState('');
    const [rename, setRename] = useState<ItemIcon | null>(null);
    const [name, setName] = useState('');
    const [deleting, setDeleting] = useState<ItemIcon | null>(null);
    const [uploadOpen, setUploadOpen] = useState(false);
    const state = useItemImages('library', search, '', 'all');
    const toast = useToast();
    const actions = useItemIconLibraryActions(state.reload);
    const finish = (saved: boolean, close: () => void) => {
        if (saved) {close(); toast.success('修改已保存');}
    };

    return <WorldDialog title="物品图标库" description="管理已上传的图片，并在图鉴条目中复用。" onClose={onClose} size="wide">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <input type="search" placeholder="搜索图标或已关联物品名称" aria-label="搜索图标库" value={search}
                onChange={event => {setSearch(event.target.value); state.setPage(1);}}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"/>
            <button type="button" onClick={() => {setUploadOpen(true); actions.reset();}}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600"><ImagePlus size={14}/>上传图标</button>
        </div>
        <p className="my-3 text-xs text-slate-400">图标会压缩为 256 × 256 WebP。仍被图鉴或背包物品引用的图片不能删除。</p>
        {(state.error || actions.error) && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-600">{state.error || actions.error}</p>}
        {state.loading ? <p className="py-10 text-center text-sm text-slate-400">正在加载图标…</p> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {state.icons.map(icon => <div key={icon.id} className="rounded-xl border border-slate-200 p-3">
                <div className="grid h-24 place-items-center rounded-lg bg-slate-50"><ItemIconImage src={icon.url} alt={icon.name} className="h-20 w-20" fallback={<Package className="h-7 w-7 text-slate-300"/>}/></div>
                <p className="mt-3 truncate text-xs font-medium text-slate-700" title={icon.name}>{icon.name}</p>
                <p className="mt-1 text-[11px] text-slate-400">{icon.width} × {icon.height} · {(icon.size / 1024).toFixed(1)} KB</p>
                <div className="mt-2 flex items-center justify-between gap-1"><span className="text-[11px] text-slate-500">{icon.usageCount} 处引用</span><div className="flex">
                    <button type="button" aria-label={`修改${icon.name}名称`} onClick={() => {setRename(icon); setName(icon.name); actions.reset();}} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><Pencil size={14}/></button>
                    <button type="button" disabled={icon.usageCount > 0} title={icon.usageCount ? '先解除图鉴或物品关联才能删除' : '删除图标'} aria-label={`删除${icon.name}`} onClick={() => {setDeleting(icon); actions.reset();}} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"><Trash2 size={14}/></button>
                </div></div>
            </div>)}
            {state.icons.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-400">图标库还没有图片，上传后即可在图鉴中使用。</p>}
        </div>}
        <ItemImagePagination page={state.page} total={state.total} pageSize={state.pageSize} disabled={state.loading} onPage={state.setPage}/>
        {uploadOpen && <WorldDialog title="上传物品图标" onClose={() => {if (!actions.busy) setUploadOpen(false);}}>
            <ItemIconUploadForm busy={actions.busy} onUpload={actions.upload}/>
            {actions.uploaded && <div role="status" className="mt-4 flex items-center gap-3 rounded-xl bg-green-50 p-3"><ItemIconImage src={actions.uploaded.url} alt={actions.uploaded.name} className="h-16 w-16" fallback={<Package className="h-6 w-6 text-slate-300"/>}/><p className="text-xs text-green-700">{actions.uploaded.duplicate ? '已复用相同图片' : '图标已保存'} · {actions.uploaded.width} × {actions.uploaded.height} · {(actions.uploaded.size / 1024).toFixed(1)} KB</p></div>}
            {actions.error && <p role="alert" className="mt-3 text-xs text-red-600">{actions.error}</p>}
        </WorldDialog>}
        {rename && <WorldDialog title="修改图标名称" onClose={() => {if (!actions.busy) setRename(null);}}>
            <label className="block text-xs text-slate-600">图标名称<input value={name} maxLength={200} disabled={actions.busy} onChange={event => setName(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"/></label>
            {actions.error && <p role="alert" className="mt-2 text-xs text-red-600">{actions.error}</p>}
            <button type="button" disabled={actions.busy || !name.trim()} onClick={() => void actions.rename(rename.id, name.trim()).then(saved => finish(saved, () => setRename(null)))} className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-xs text-white disabled:opacity-40">保存名称</button>
        </WorldDialog>}
        {deleting && <WorldDialog title="删除图标" onClose={() => {if (!actions.busy) setDeleting(null);}}>
            <p className="text-sm text-slate-600">删除“{deleting.name}”？图片文件将一同删除。</p>
            {actions.error && <p role="alert" className="mt-2 text-xs text-red-600">{actions.error}</p>}
            <button type="button" disabled={actions.busy} onClick={() => void actions.remove(deleting.id).then(saved => finish(saved, () => setDeleting(null)))} className="mt-4 rounded-lg bg-red-500 px-4 py-2 text-xs text-white disabled:opacity-40">确认删除</button>
        </WorldDialog>}
    </WorldDialog>;
}
