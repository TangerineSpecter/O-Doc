import {useState} from 'react';
import {Pencil, Plus, Trash2, X} from 'lucide-react';
import type {PromptTaxonomies} from '../../types/api/prompt';
import {createPromptTaxonomy, deletePromptTaxonomy, updatePromptTaxonomy} from '../../api/prompt';
import {useToast} from '../common/ToastProvider';

interface Props { open: boolean; taxonomies: PromptTaxonomies; onClose: () => void; onChanged: () => void; }
export default function PromptTaxonomyModal({open, taxonomies, onClose, onChanged}: Props) {
  const toast = useToast();
  const [kind, setKind] = useState<keyof PromptTaxonomies>('categories');
  const [name, setName] = useState('');
  if (!open) return null;
  const add = async () => { if (!name.trim()) return; try { await createPromptTaxonomy(kind, {name: name.trim()}); setName(''); onChanged(); } catch (error) { toast.error((error as Error).message || '保存失败'); } };
  const rename = async (id: string, current: string) => { const next = window.prompt('新名称', current); if (!next?.trim()) return; try { await updatePromptTaxonomy(kind, id, {name: next.trim()}); onChanged(); } catch (error) { toast.error((error as Error).message || '更新失败'); } };
  const remove = async (id: string) => { if (!window.confirm('停用后不会再出现在新建模板的选项中，历史模板仍会保留引用。确定继续？')) return; try { await deletePromptTaxonomy(kind, id); onChanged(); } catch (error) { toast.error((error as Error).message || '停用失败'); } };
  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center p-2.5 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}/>
      <section className="relative w-full max-w-lg rounded-xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5 sm:py-4 bg-slate-50/50">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">管理提示词分类与标签</h2>
            <p className="mt-0.5 text-xs text-slate-500">独立于文章分类与全局标签系统。</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="h-5 w-5"/>
          </button>
        </header>

        <div className="p-4 sm:p-5">
          <div className="flex rounded-lg bg-slate-100 p-1">
            {([['categories', '分类'], ['themes', '主题'], ['tags', '标签']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setKind(id)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${kind === id ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3.5 flex gap-2">
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && void add()}
              placeholder={`新${kind === 'categories' ? '分类' : kind === 'themes' ? '主题' : '标签'}名称`}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
            <button
              onClick={() => void add()}
              className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white hover:bg-orange-600 shadow-sm shadow-orange-500/20 shrink-0"
            >
              <Plus className="h-4 w-4"/>添加
            </button>
          </div>

          <div className="mt-3.5 max-h-60 sm:max-h-64 space-y-1 overflow-y-auto">
            {taxonomies[kind].map(item => (
              <div key={item.id} className="flex items-center justify-between rounded-lg px-2.5 py-2 hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors">
                <span className="text-xs sm:text-sm text-slate-700 truncate pr-2">{item.name}</span>
                <span className="flex gap-1 shrink-0">
                  <button
                    onClick={() => void rename(item.id, item.name)}
                    className="rounded p-1.5 text-slate-400 hover:bg-orange-50 hover:text-orange-600"
                    title="重命名"
                  >
                    <Pencil className="h-3.5 w-3.5"/>
                  </button>
                  <button
                    onClick={() => void remove(item.id)}
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5"/>
                  </button>
                </span>
              </div>
            ))}
            {!taxonomies[kind].length && (
              <p className="py-10 text-center text-xs sm:text-sm text-slate-400">还没有添加任何{kind === 'categories' ? '分类' : kind === 'themes' ? '主题' : '标签'}。</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
