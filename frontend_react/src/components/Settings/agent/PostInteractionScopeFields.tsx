import {X} from 'lucide-react';
import {Select} from '@/components/common/Select';
import {usePostScopeOptions, type PostScopeOption} from './usePostScopeOptions';

interface Props {
    collectionIds: string[];
    categoryIds: string[];
    onCollectionsChange: (ids: string[]) => void;
    onCategoriesChange: (ids: string[]) => void;
    supplemental?: boolean;
}

function ScopeList({label, items, selected, onChange, placeholder}: {
    label: string; items: PostScopeOption[]; selected: string[];
    onChange: (ids: string[]) => void; placeholder: string;
}) {
    return <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-700">{label}</label>
        <Select value="" options={items.filter(item => !selected.includes(item.id)).map(item => ({value: item.id, label: item.name}))}
            onChange={id => {if (id) onChange([...selected, id]);}} placeholder={placeholder} menuPortal={true}/>
        <div className="flex flex-wrap gap-2">
            {selected.map(id => <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-xs text-orange-700">
                <span className="truncate">{items.find(item => item.id === id)?.name || '已失效的选项'}</span>
                <button type="button" aria-label={`移除${items.find(item => item.id === id)?.name || id}`} onClick={() => onChange(selected.filter(value => value !== id))}
                    className="shrink-0 whitespace-nowrap rounded-full p-0.5 hover:bg-orange-100"><X className="h-3 w-3"/></button>
            </span>)}
        </div>
    </div>;
}

export function PostInteractionScopeFields({collectionIds, categoryIds, onCollectionsChange, onCategoriesChange, supplemental = false}: Props) {
    const {collections, categories, loading, error, retry} = usePostScopeOptions();
    return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
            <h4 className="text-sm font-semibold text-slate-800">{supplemental ? '帖子互动补充范围' : '帖子互动范围'}</h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{supplemental
                ? '与任务范围取并集，仅扩展自己的候选。留空表示不补充；任务覆盖全部时，个人设置不能缩小范围。'
                : '对所有绑定 Agent 生效。文集或分类留空，表示该维度全部；与各 Agent 的补充范围取并集。'}</p>
        </div>
        {loading ? <p className="text-xs text-slate-500">正在加载帖子文集和分类…</p> : error ? <div className="text-xs text-red-600">{error}
            <button type="button" onClick={retry} className="ml-2 shrink-0 whitespace-nowrap text-orange-600 underline">重试</button></div> : <>
            <ScopeList label={supplemental ? '补充帖子文集' : '帖子文集'} items={collections} selected={collectionIds} onChange={onCollectionsChange} placeholder="添加帖子文集（可多选）"/>
            <ScopeList label={supplemental ? '补充帖子分类' : '帖子分类'} items={categories} selected={categoryIds} onChange={onCategoriesChange} placeholder="添加帖子分类（可多选）"/>
        </>}
        <p className="text-xs text-slate-500">{collectionIds.length ? `已选 ${collectionIds.length} 个文集` : supplemental ? '不补充文集' : '全部帖子文集'} · {categoryIds.length ? `已选 ${categoryIds.length} 个分类` : supplemental ? '不补充分类' : '全部帖子分类'}</p>
    </section>;
}
