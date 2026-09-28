import {useState} from 'react';
import {ImagePlus, Package, Pencil, RefreshCw, Trash2} from 'lucide-react';
import {useItemIconLibraryActions} from '../../hooks/useItemIconLibraryActions';
import {useItemImages} from '../../hooks/useItemImages';
import type {InventoryItem} from '../../types/api/travel';
import type {ItemIcon, PictureFilter} from '../../types/api/itemIcons';
import {Select} from '../common/Select';
import {useToast} from '../common/ToastProvider';
import {ItemIconPicker} from './ItemIconPicker';
import {ItemIconImage} from './ItemIconImage';
import {ItemIconUploadForm} from './ItemIconUploadForm';
import {ItemImagePagination} from './ItemImagePagination';
import WorldDialog from './WorldDialog';

export function WorldItemImages() {
    const [mode, setMode] = useState<'items' | 'library'>('items');
    const [search, setSearch] = useState('');
    const [agentId, setAgentId] = useState('');
    const [picture, setPicture] = useState<PictureFilter>('all');
    const [editing, setEditing] = useState<InventoryItem | null>(null);
    const [rename, setRename] = useState<ItemIcon | null>(null);
    const [name, setName] = useState('');
    const [deleting, setDeleting] = useState<ItemIcon | null>(null);
    const [uploadOpen, setUploadOpen] = useState(false);
    const state = useItemImages(mode, search, agentId, picture);
    const toast = useToast();
    const actions = useItemIconLibraryActions(state.reload);
    const {busy, error, uploaded} = actions;
    const finish = (saved: boolean, close: () => void) => {
        if (saved) {close(); toast.success('修改已保存');}
    };
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-full bg-slate-100 p-1">
                {(['items', 'library'] as const).map(value => <button key={value} type="button" onClick={() => {setMode(value); setSearch(''); state.setPage(1);}} className={`rounded-full px-4 py-1.5 text-xs font-medium ${mode === value ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}>{value === 'items' ? '物品列表' : '图标库'}</button>)}
            </div>
            <div className="flex items-center gap-2">
                {mode === 'library' && <button type="button" onClick={() => {setUploadOpen(true); actions.reset();}} className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-2 text-xs text-white"><ImagePlus size={14}/>上传图标</button>}
                <button type="button" aria-label="刷新物品图片" onClick={state.reload} className="rounded-lg p-2 text-slate-400 hover:bg-orange-50 hover:text-orange-600"><RefreshCw size={16}/></button>
            </div>
        </div>
        <div className="my-4 flex flex-wrap gap-3">
            <input type="search" placeholder={mode === 'items' ? '搜索物品名称' : '搜索图标或已关联物品名称'} aria-label="搜索物品图片" value={search} onChange={event => {setSearch(event.target.value); state.setPage(1);}} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm sm:min-w-48"/>
            {mode === 'items' && <>
                <Select value={agentId} options={[{value: '', label: '全部角色'}, ...state.agents.map(agent => ({value: agent.id, label: agent.name}))]} onChange={value => {setAgentId(value); state.setPage(1);}}/>
                <Select<PictureFilter> value={picture} options={[{value: 'all', label: '全部物品'}, {value: 'missing', label: '未设置图片'}, {value: 'set', label: '已设置图片'}]} onChange={value => {setPicture(value); state.setPage(1);}}/>
            </>}
        </div>
        <p className="mb-4 text-xs text-slate-400">{mode === 'items' ? '未配图物品优先显示。相同物品可手动复用一张图标。' : '图片已压缩为小图标。替换物品图片不会修改其他物品的关联。'}</p>
        {(state.error || error) && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-600">{state.error || error}</p>}
        {state.loading ? <p className="py-10 text-center text-sm text-slate-400">正在加载…</p> : mode === 'items' ? <div className="space-y-2">
            {state.items.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-50"><ItemIconImage src={item.iconUrl} alt={item.name} className="h-12 w-12" fallback={<Package className="h-6 w-6 text-slate-300"/>}/></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800" title={item.name}>{item.name}</p><p className="mt-1 truncate text-xs text-slate-500">{item.actorName || '历史角色'} · {item.quantity} 件{item.source.destination ? ` · ${item.source.destination.country} / ${item.source.destination.city}` : ''}</p></div>
                <button type="button" onClick={() => setEditing(item)} className="shrink-0 rounded-lg border border-orange-200 px-3 py-2 text-xs text-orange-600 hover:bg-orange-50">{item.iconAssetId ? '更换图片' : '设置图片'}</button>
            </div>)}
            {state.items.length === 0 && <p className="py-10 text-center text-sm text-slate-400">暂无符合条件的物品</p>}
        </div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {state.icons.map(icon => <div key={icon.id} className="rounded-xl border border-slate-200 p-3">
                <div className="grid h-24 place-items-center rounded-lg bg-slate-50"><ItemIconImage src={icon.url} alt={icon.name} className="h-20 w-20" fallback={<Package className="h-7 w-7 text-slate-300"/>}/></div>
                <p className="mt-3 truncate text-xs font-medium text-slate-700" title={icon.name}>{icon.name}</p>
                <p className="mt-1 text-[11px] text-slate-400">{icon.width} × {icon.height} · {(icon.size / 1024).toFixed(1)} KB</p>
                <div className="mt-2 flex items-center justify-between gap-1"><span className="text-[11px] text-slate-500">{icon.usageCount} 条记录使用</span><div className="flex">
                    <button type="button" aria-label={`修改${icon.name}名称`} onClick={() => {setRename(icon); setName(icon.name); actions.reset();}} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><Pencil size={14}/></button>
                    <button type="button" disabled={icon.usageCount > 0} title={icon.usageCount ? '先解除物品关联才能删除' : '删除图标'} aria-label={`删除${icon.name}`} onClick={() => {setDeleting(icon); actions.reset();}} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"><Trash2 size={14}/></button>
                </div></div>
            </div>)}
            {state.icons.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-400">图标库还没有图片，上传后即可复用。</p>}
        </div>}
        <ItemImagePagination page={state.page} total={state.total} pageSize={state.pageSize} disabled={state.loading} onPage={state.setPage}/>
        {editing && <ItemIconPicker key={editing.id} item={editing} onClose={() => setEditing(null)} onSaved={() => {setEditing(null); state.reload(); toast.success('物品图片已更新');}}/>}
        {uploadOpen && <WorldDialog title="上传物品图标" onClose={() => {if (!busy) setUploadOpen(false);}}>
            <ItemIconUploadForm busy={busy} onUpload={actions.upload}/>
            {uploaded && <div role="status" className="mt-4 flex items-center gap-3 rounded-xl bg-green-50 p-3"><ItemIconImage src={uploaded.url} alt={uploaded.name} className="h-16 w-16" fallback={<Package className="h-6 w-6 text-slate-300"/>}/><p className="text-xs text-green-700">{uploaded.duplicate ? '已复用相同图片' : '图标已保存'} · {uploaded.width} × {uploaded.height} · {(uploaded.size / 1024).toFixed(1)} KB</p></div>}
            {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
        </WorldDialog>}
        {rename && <WorldDialog title="修改图标名称" onClose={() => {if (!busy) setRename(null);}}><label className="block text-xs text-slate-600">图标名称<input value={name} maxLength={200} disabled={busy} onChange={event => setName(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"/></label>{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}<button type="button" disabled={busy || !name.trim()} onClick={() => void actions.rename(rename.id, name.trim()).then(saved => finish(saved, () => setRename(null)))} className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-xs text-white disabled:opacity-40">保存名称</button></WorldDialog>}
        {deleting && <WorldDialog title="删除图标" onClose={() => {if (!busy) setDeleting(null);}}><p className="text-sm text-slate-600">删除“{deleting.name}”？图片文件将一同删除。</p>{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}<button type="button" disabled={busy} onClick={() => void actions.remove(deleting.id).then(saved => finish(saved, () => setDeleting(null)))} className="mt-4 rounded-lg bg-red-500 px-4 py-2 text-xs text-white disabled:opacity-40">确认删除</button></WorldDialog>}
    </section>;
}
