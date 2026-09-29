import {Package} from 'lucide-react';
import type {ItemIconTarget} from '../../hooks/useItemIconPicker';
import {useItemIconPicker} from '../../hooks/useItemIconPicker';
import WorldDialog from './WorldDialog';
import {ItemIconUploadForm} from './ItemIconUploadForm';
import {ItemImagePagination} from './ItemImagePagination';
import {ItemIconImage} from './ItemIconImage';

export function ItemIconPicker({item, onClose, onSaved}: {item: ItemIconTarget; onClose: () => void; onSaved: () => void}) {
    const state = useItemIconPicker(item);
    const icons = state.uploaded ? [state.uploaded, ...state.icons.filter(icon => icon.id !== state.uploaded?.id)] : state.icons;
    return <WorldDialog title="设置物品图片" description={item.name} onClose={() => {if (!state.busy) onClose();}}>
        <div className="space-y-4">
            <ItemIconUploadForm initialName={item.name} busy={state.busy} onUpload={state.upload}/>
            {state.uploaded && <p role="status" className="rounded-lg bg-green-50 p-3 text-xs text-green-700">
                {state.uploaded.duplicate ? '已复用相同图标' : '上传成功'} · {state.uploaded.width} × {state.uploaded.height} · {(state.uploaded.size / 1024).toFixed(1)} KB。点击“保存关联”应用到当前物品。
            </p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">从图标库选择</p>
                <input type="search" aria-label="搜索已有图标" placeholder="搜索名称或已关联物品" value={state.search} disabled={state.busy} onChange={event => {state.setSearch(event.target.value); state.setPage(1);}} className="rounded-lg border border-slate-200 px-3 py-2 text-xs"/>
            </div>
            <p className="text-xs text-slate-400">推荐图片需要手动选择。同名物品不会自动绑定。</p>
            {state.loading ? <p className="py-4 text-center text-xs text-slate-400">正在加载图标…</p> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {icons.map(icon => <button type="button" key={icon.id} disabled={state.busy || !icon.fileExists} aria-pressed={state.selected === icon.id} onClick={() => state.setSelected(icon.id)} className={`relative rounded-xl border p-2 text-left transition-colors disabled:opacity-40 ${state.selected === icon.id ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white hover:border-orange-200'}`}>
                    <div className="grid h-16 place-items-center"><ItemIconImage src={icon.url} alt={icon.name} className="h-16 w-16" fallback={<Package className="h-6 w-6 text-slate-300"/>}/></div>
                    <p className="mt-2 truncate text-xs text-slate-700" title={icon.name}>{icon.name}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{icon.fileExists ? `${icon.usageCount} 条记录使用` : '文件未恢复'}</p>
                    {icon.recommended && <span className="absolute right-1 top-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] text-orange-700">推荐</span>}
                </button>)}
            </div>}
            {!state.loading && icons.length === 0 && <p className="py-3 text-center text-xs text-slate-400">暂无可用图标，可以先上传一张。</p>}
            <ItemImagePagination page={state.page} total={state.total} pageSize={state.pageSize} disabled={state.loading || state.busy} onPage={state.setPage}/>
            {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{state.error}</p>}
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-3">
                <button type="button" disabled={state.busy} onClick={() => state.setSelected(null)} className={`rounded-lg px-3 py-2 text-xs ${state.selected === null ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-50'}`}>不使用图片</button>
                <button type="button" disabled={state.busy} onClick={() => void state.save().then(saved => {if (saved) onSaved();})} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-40">{state.busy ? '正在保存…' : '保存关联'}</button>
            </div>
        </div>
    </WorldDialog>;
}
