import {useCallback, useEffect, useMemo, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {ArchiveRestore, Filter, FolderCog, Plus, Search, Sparkles, Trash2} from 'lucide-react';
import {createPromptTemplate, getPromptTaxonomy, getPromptTemplate, getPromptTemplates, getPromptTrash, purgePromptTemplate, purgePromptUsage, restorePromptTemplate, restorePromptUsage, updatePromptTemplate} from '../api/prompt';
import type {PromptFilters, PromptTaxonomies, PromptTemplate, PromptTemplateInput, PromptTrash} from '../types/api/prompt';
import {useToast} from '../components/common/ToastProvider';
import {Select, type SelectOption} from '../components/common/Select';
import PromptCard from '../components/PromptLibrary/PromptCard';
import PromptDetailDrawer from '../components/PromptLibrary/PromptDetailDrawer';
import PromptTemplateModal from '../components/PromptLibrary/PromptTemplateModal';
import PromptTaxonomyModal from '../components/PromptLibrary/PromptTaxonomyModal';

const emptyTaxonomies: PromptTaxonomies = {categories: [], themes: [], tags: []};

const TYPE_FILTER_OPTIONS: SelectOption<string>[] = [
  {value: '', label: '全部类型'},
  {value: 'image', label: '生图'},
  {value: 'html_report', label: 'HTML 报告'},
  {value: 'general', label: '通用'},
];

export default function PromptLibraryPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<PromptTemplate[]>([]);
  const [taxonomies, setTaxonomies] = useState<PromptTaxonomies>(emptyTaxonomies);
  const [filters, setFilters] = useState<PromptFilters>({ordering: 'updated'});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PromptTemplate | null>(null);
  const [editing, setEditing] = useState<PromptTemplate | null | undefined>(undefined);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [trash, setTrash] = useState<PromptTrash | null>(null);

  const categoryFilterOptions = useMemo<SelectOption<string>[]>(() => [
    {value: '', label: '全部分类'},
    ...taxonomies.categories.map(item => ({value: item.id, label: item.name})),
  ], [taxonomies.categories]);
  const refresh = useCallback(async () => { setLoading(true); try { const [response, taxonomy] = await Promise.all([getPromptTemplates(filters), getPromptTaxonomy()]); setItems(response.list); setTaxonomies(taxonomy); } catch (error) { toast.error((error as Error).message || '加载提示词库失败'); } finally { setLoading(false); } }, [filters, toast]);
  useEffect(() => { void refresh(); }, [refresh]);
  const open = async (item: PromptTemplate) => { try { setSelected(await getPromptTemplate(item.id)); } catch (error) { toast.error((error as Error).message || '打开提示词失败'); } };
  useEffect(() => {
    const promptId = searchParams.get('promptId');
    if (!promptId) return;
    void getPromptTemplate(promptId).then(setSelected).catch(() => toast.error('未找到该提示词')).finally(() => setSearchParams({}, {replace: true}));
  }, [searchParams, setSearchParams, toast]);
  const save = async (data: PromptTemplateInput) => { try { const saved = editing ? await updatePromptTemplate(editing.id, data) : await createPromptTemplate(data); toast.success(editing ? '模板已更新' : '模板已创建'); setEditing(undefined); await refresh(); if (selected?.id === saved.id) setSelected(await getPromptTemplate(saved.id)); } catch (error) { toast.error((error as Error).message || '保存失败'); throw error; } };
  const toggleFavorite = async (item: PromptTemplate) => { try { await updatePromptTemplate(item.id, {isFavorite: !item.isFavorite}); await refresh(); } catch (error) { toast.error((error as Error).message || '更新收藏失败'); } };
  const showTrash = async () => { try { setTrash(await getPromptTrash()); } catch (error) { toast.error((error as Error).message || '加载回收站失败'); } };
  const restore = async (id: string) => { await restorePromptTemplate(id); toast.success('提示词已恢复'); setTrash(await getPromptTrash()); await refresh(); };
  const restoreUsage = async (id: string) => { await restorePromptUsage(id); toast.success('效果记录已恢复'); setTrash(await getPromptTrash()); await refresh(); };
  const purgeTemplate = async (id: string) => { if (!window.confirm('彻底删除模板及其已删除效果记录？仅未被其他内容使用的提示词图片会一并清理。')) return; await purgePromptTemplate(id); setTrash(await getPromptTrash()); toast.success('已彻底删除'); };
  const purgeUsage = async (id: string) => { if (!window.confirm('彻底删除这条效果记录？未被其他内容使用的提示词图片会一并清理。')) return; await purgePromptUsage(id); setTrash(await getPromptTrash()); toast.success('已彻底删除'); };
  return <main className="mx-auto min-h-[calc(100vh-64px)] max-w-7xl px-3.5 py-4 sm:px-6 sm:py-6 lg:px-8">
    <header className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-orange-100 bg-white px-4 py-4 sm:px-7 sm:py-5 shadow-sm">
      <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-orange-100/70 blur-3xl pointer-events-none"/>
      <div className="relative flex flex-col justify-between gap-3 sm:gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-[10px] sm:text-xs font-bold tracking-[0.18em] text-orange-600">PROMPT CABINET</p>
          <h1 className="mt-0.5 sm:mt-1 flex items-center gap-1.5 sm:gap-2 text-xl sm:text-2xl font-bold text-slate-900">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-orange-500"/>
            提示词库
          </h1>
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm text-slate-500">把好用的表达、动态字段和满意的效果，一起收好。</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap pt-2 lg:pt-0 border-t sm:border-0 border-orange-50">
          <button onClick={() => setTaxonomyOpen(true)} className="inline-flex items-center gap-1 sm:gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-orange-200 shadow-sm">
            <FolderCog className="h-3.5 w-3.5 sm:h-4 sm:w-4"/>分类与标签
          </button>
          <button onClick={() => void showTrash()} className="inline-flex items-center gap-1 sm:gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-orange-200 shadow-sm">
            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4"/>回收站
          </button>
          <button onClick={() => setEditing(null)} className="inline-flex items-center gap-1 sm:gap-1.5 rounded-lg bg-orange-500 px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600 ml-auto sm:ml-0">
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4"/>新建提示词
          </button>
        </div>
      </div>
    </header>

    <section className="mt-3.5 sm:mt-5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2.5">
      {/* 搜索与快捷下拉行 */}
      <div className="flex flex-col gap-2.5 lg:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"/>
          <input
            value={filters.keyword || ''}
            onChange={event => setFilters({...filters, keyword: event.target.value})}
            placeholder="搜索标题、提示词、分类或标签…"
            className="w-full rounded-lg bg-slate-50 py-2 pl-9 pr-3 text-xs sm:text-sm outline-none ring-orange-500/20 focus:bg-white focus:ring-2 border border-slate-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 sm:w-32">
            <Select
              value={filters.type || ''}
              options={TYPE_FILTER_OPTIONS}
              onChange={value => setFilters({...filters, type: (value || undefined) as PromptFilters['type']})}
              buttonClassName="min-h-9 py-1 px-2.5 text-xs bg-white"
              showSelectedDescription={false}
            />
          </div>
          <div className="flex-1 sm:w-36">
            <Select
              value={filters.categoryId || ''}
              options={categoryFilterOptions}
              onChange={value => setFilters({...filters, categoryId: value || undefined})}
              buttonClassName="min-h-9 py-1 px-2.5 text-xs bg-white"
              showSelectedDescription={false}
            />
          </div>
          <button
            onClick={() => setFilters({...filters, favorite: !filters.favorite})}
            className={`rounded-lg border px-2.5 py-2 text-xs transition-colors shrink-0 ${filters.favorite ? 'border-orange-200 bg-orange-50 text-orange-700 font-semibold' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
          >
            <Filter className="mr-1 inline h-3.5 w-3.5"/>收藏
          </button>
        </div>
      </div>

      {/* 主题与标签横滑行 */}
      {(taxonomies.themes.length > 0 || taxonomies.tags.length > 0) && (
        <div className="pt-2 border-t border-slate-100 space-y-1.5">
          {taxonomies.themes.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide touch-pan-x text-xs">
              <span className="text-[11px] text-slate-400 shrink-0">主题:</span>
              {taxonomies.themes.map(item => {
                const active = filters.themeIds?.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => setFilters(current => ({...current, themeIds: active ? current.themeIds?.filter(id => id !== item.id) : [...(current.themeIds || []), item.id]}))}
                    className={`rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap transition-colors shrink-0 ${active ? 'bg-violet-100 text-violet-700 font-medium' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          )}
          {taxonomies.tags.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide touch-pan-x text-xs">
              <span className="text-[11px] text-slate-400 shrink-0">标签:</span>
              {taxonomies.tags.map(item => {
                const active = filters.tagIds?.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => setFilters(current => ({...current, tagIds: active ? current.tagIds?.filter(id => id !== item.id) : [...(current.tagIds || []), item.id]}))}
                    className={`rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap transition-colors shrink-0 ${active ? 'bg-orange-100 text-orange-700 font-medium' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    #{item.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>

    <section className="mt-4 sm:mt-5">
      {loading ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 animate-pulse">
          {Array.from({length: 6}).map((_, index) => (
            <div key={index} className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-sm space-y-3 select-none">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-12 rounded bg-orange-100/80"></div>
                  <div className="h-4 w-16 rounded bg-slate-100"></div>
                </div>
                <div className="h-4 w-4 rounded-full bg-slate-100"></div>
              </div>
              <div className="h-5 w-3/4 rounded bg-slate-200/70"></div>
              <div className="space-y-1.5 rounded-lg bg-slate-50/80 p-3">
                <div className="h-3.5 w-full rounded bg-slate-200/60"></div>
                <div className="h-3.5 w-4/5 rounded bg-slate-200/60"></div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100/80">
                <div className="h-3 w-20 rounded bg-slate-100"></div>
                <div className="h-3 w-14 rounded bg-slate-100"></div>
              </div>
            </div>
          ))}
        </div>
      ) : items.length ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 animate-in fade-in duration-200">
          {items.map(item => (
            <PromptCard key={item.id} item={item} onOpen={() => void open(item)} onToggleFavorite={() => void toggleFavorite(item)}/>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-orange-200 bg-white py-16 sm:py-24 px-4 text-center animate-in fade-in duration-200">
          <Sparkles className="mx-auto h-10 w-10 text-orange-300"/>
          <h2 className="mt-3 text-sm font-bold text-slate-700">先收下第一条好提示词</h2>
          <p className="mt-1 text-xs text-slate-500">配置动态字段后，每次只填内容就能直接复制使用。</p>
          <button onClick={() => setEditing(null)} className="mt-4 rounded-lg bg-orange-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600">
            新建提示词
          </button>
        </div>
      )}
    </section>
    <PromptTemplateModal key={editing?.id || (editing === null ? 'new' : 'closed')} open={editing !== undefined} template={editing || null} taxonomies={taxonomies} onClose={() => setEditing(undefined)} onSave={save}/>
    <PromptTaxonomyModal open={taxonomyOpen} taxonomies={taxonomies} onClose={() => setTaxonomyOpen(false)} onChanged={() => void refresh()}/>
    <PromptDetailDrawer template={selected} onClose={() => setSelected(null)} onChanged={() => { if (selected) void open(selected); void refresh(); }}/>
    {trash && <div className="fixed inset-0 z-[121] flex items-center justify-center p-4"><div className="absolute inset-0 bg-slate-900/40" onClick={() => setTrash(null)}/><section className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-lg font-bold text-slate-900">提示词回收站</h2><p className="mt-1 text-xs text-slate-500">恢复不会删除图片；彻底删除时，只清理未被其他内容引用的提示词图片。</p></div><button onClick={() => setTrash(null)} className="text-slate-400">×</button></header><div className="max-h-[60vh] space-y-5 overflow-y-auto p-4"><div><p className="mb-2 text-xs font-bold text-slate-500">模板</p>{trash.templates.map(item => <div key={item.id} className="mb-2 flex items-center justify-between rounded-xl border border-slate-100 p-3"><div><p className="text-sm font-semibold text-slate-700">{item.title}</p><p className="text-xs text-slate-400">删除于 {item.deletedAt || '未知时间'}</p></div><div className="flex gap-2"><button onClick={() => void restore(item.id)} className="inline-flex items-center gap-1 rounded-lg bg-lime-50 px-3 py-2 text-xs font-semibold text-lime-700"><ArchiveRestore className="h-3.5 w-3.5"/>恢复</button><button onClick={() => void purgeTemplate(item.id)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">彻底删除</button></div></div>)}</div><div><p className="mb-2 text-xs font-bold text-slate-500">效果记录</p>{trash.usages.map(item => <div key={item.id} className="mb-2 flex items-center justify-between rounded-xl border border-slate-100 p-3"><div><p className="text-sm font-semibold text-slate-700">{item.modelName || '未命名效果记录'}</p><p className="text-xs text-slate-400">{item.resultImages.length} 张图片 · 删除于 {item.deletedAt || '未知时间'}</p></div><div className="flex gap-2"><button onClick={() => void restoreUsage(item.id)} className="rounded-lg bg-lime-50 px-3 py-2 text-xs font-semibold text-lime-700">恢复</button><button onClick={() => void purgeUsage(item.id)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">彻底删除</button></div></div>)}{!trash.templates.length && !trash.usages.length && <p className="py-10 text-center text-sm text-slate-400">回收站是空的。</p>}</div></div></section></div>}
  </main>;
}
