import {useState, useEffect, useRef} from 'react';
import {
  FolderTree,
  Palette,
  Hash,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import type {PromptTaxonomies} from '../../types/api/prompt';
import {createPromptTaxonomy, deletePromptTaxonomy, updatePromptTaxonomy} from '../../api/prompt';
import {useToast} from '../common/ToastProvider';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

interface Props {
  open: boolean;
  taxonomies: PromptTaxonomies;
  onClose: () => void;
  onChanged: () => void;
}

type TaxonomyKind = keyof PromptTaxonomies;

interface TabMeta {
  id: TaxonomyKind;
  label: string;
  name: string;
  icon: typeof FolderTree;
  themeColor: string;
  activeTabClass: string;
  badgeClass: string;
  bannerBg: string;
  bannerIconClass: string;
  bannerTitle: string;
  bannerDesc: string;
  placeholder: string;
  buttonClass: string;
  emptyHint: string;
}

const TAB_CONFIGS: Record<TaxonomyKind, TabMeta> = {
  categories: {
    id: 'categories',
    label: '分类',
    name: '分类目录',
    icon: FolderTree,
    themeColor: 'orange',
    activeTabClass: 'bg-white text-orange-600 shadow-sm font-semibold',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200/70',
    bannerBg: 'bg-orange-50/70 border-orange-100 text-orange-950',
    bannerIconClass: 'text-orange-500',
    bannerTitle: '分类目录 · 单选归属',
    bannerDesc: '用于提示词的核心大类目录结构（如文案策划、AI生图、代码助手）。每个提示词只能归属于一个大类。',
    placeholder: '输入分类名称，例如：人像写真、商业文案、效率工具...',
    buttonClass: 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20 text-white',
    emptyHint: '还没有添加任何分类目录，在上方输入即可创建',
  },
  themes: {
    id: 'themes',
    label: '主题',
    name: '风格主题',
    icon: Palette,
    themeColor: 'violet',
    activeTabClass: 'bg-white text-violet-700 shadow-sm font-semibold',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200/70',
    bannerBg: 'bg-violet-50/70 border-violet-100 text-violet-950',
    bannerIconClass: 'text-violet-500',
    bannerTitle: '视觉风格与场景 · 多选归属',
    bannerDesc: '用于标注画面美学风格、艺术流派或应用情景（如极简主义、国风潮玩、赛博朋克）。提示词支持多选关联。',
    placeholder: '输入风格或场景名称，例如：赛博朋克、新中式、极简扁平...',
    buttonClass: 'bg-violet-600 hover:bg-violet-700 shadow-violet-600/20 text-white',
    emptyHint: '还没有添加任何风格主题，可添加如「国风」「极简」「赛博朋克」等',
  },
  tags: {
    id: 'tags',
    label: '标签',
    name: '检索标签',
    icon: Hash,
    themeColor: 'sky',
    activeTabClass: 'bg-white text-sky-700 shadow-sm font-semibold',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200/70',
    bannerBg: 'bg-sky-50/70 border-sky-100 text-sky-950',
    bannerIconClass: 'text-sky-500',
    bannerTitle: '细分检索标签 · 多选归属',
    bannerDesc: '用于多维度快速检索与精准过滤的关键词（如 #特写微距、#4K超清、#商用）。提示词支持多选打标。',
    placeholder: '输入标签名称，例如：特写、商业授权、中英双语...',
    buttonClass: 'bg-sky-600 hover:bg-sky-700 shadow-sky-600/20 text-white',
    emptyHint: '还没有添加任何检索标签，可添加如「#人物」「#特写」「#高清」等',
  },
};

export default function PromptTaxonomyModal({open, taxonomies, onClose, onChanged}: Props) {
  const toast = useToast();
  const [kind, setKind] = useState<TaxonomyKind>('categories');
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  useEscapeDismissal(open, () => {
    if (editingId) setEditingId(null);
    else onClose();
  });

  // 编辑模式时自动聚焦
  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);

  if (!open) return null;

  const currentTab = TAB_CONFIGS[kind];
  const items = taxonomies[kind] || [];

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createPromptTaxonomy(kind, {name: trimmed});
      setName('');
      toast.success(`已添加${currentTab.label}「${trimmed}」`);
      onChanged();
    } catch (error) {
      toast.error((error as Error).message || '保存失败');
    }
  };

  const startRename = (id: string, current: string) => {
    setEditingId(id);
    setEditingName(current);
  };

  const handleSaveRename = async () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error('名称不能为空');
      return;
    }
    try {
      await updatePromptTaxonomy(kind, editingId, {name: trimmed});
      setEditingId(null);
      toast.success('更新成功');
      onChanged();
    } catch (error) {
      toast.error((error as Error).message || '更新失败');
    }
  };

  const handleRemove = async (id: string, itemName: string) => {
    if (!window.confirm(`确定停用「${itemName}」？\n停用后不会再出现在新建模板的选项中，历史模板仍会保留引用。`)) {
      return;
    }
    try {
      await deletePromptTaxonomy(kind, id);
      toast.success(`已停用${currentTab.label}「${itemName}」`);
      onChanged();
    } catch (error) {
      toast.error((error as Error).message || '停用失败');
    }
  };

  const TabIcon = currentTab.icon;

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center p-2.5 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <section className="relative w-full max-w-xl sm:max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100 flex flex-col max-h-[90vh]">
        {/* 顶部标题栏 */}
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-6 sm:py-4 bg-slate-50/60 shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              管理提示词分类与标签
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              设置专属于提示词库的分类体系、画面风格与多维关键词。
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="关闭 (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* 3 个 Tab 切换器 */}
          <div className="flex rounded-xl bg-slate-100/80 p-1 gap-1">
            {(Object.keys(TAB_CONFIGS) as TaxonomyKind[]).map(tabKey => {
              const tab = TAB_CONFIGS[tabKey];
              const Icon = tab.icon;
              const isActive = kind === tabKey;
              const count = taxonomies[tabKey]?.length || 0;

              return (
                <button
                  key={tabKey}
                  onClick={() => {
                    setKind(tabKey);
                    setEditingId(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg py-2 text-xs sm:text-sm transition-all ${
                    isActive
                      ? tab.activeTabClass
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-medium transition-colors ${
                      isActive
                        ? tab.badgeClass
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tab 专属提示横幅 */}
          <div className={`rounded-xl border p-3 sm:p-3.5 flex items-start gap-2.5 sm:gap-3 transition-colors ${currentTab.bannerBg}`}>
            <div className={`p-1.5 rounded-lg bg-white/80 shadow-xs shrink-0 ${currentTab.bannerIconClass}`}>
              <TabIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold leading-none">{currentTab.bannerTitle}</h4>
              <p className="mt-1 text-xs opacity-80 leading-relaxed">{currentTab.bannerDesc}</p>
            </div>
          </div>

          {/* 新增输入条 */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <TabIcon className={`h-4 w-4 ${currentTab.bannerIconClass}`} />
              </div>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleAdd();
                  }
                }}
                placeholder={currentTab.placeholder}
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-xs"
              />
            </div>
            <button
              onClick={() => void handleAdd()}
              disabled={!name.trim()}
              className={`inline-flex items-center gap-1 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all shadow-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${currentTab.buttonClass}`}
            >
              <Plus className="h-4 w-4" />
              <span>添加{currentTab.label}</span>
            </button>
          </div>

          {/* 列表内容区域 - 3 个 Tab 分别采用定制化差异设计 */}
          <div className="pt-1">
            <div className="max-h-[300px] sm:max-h-[340px] overflow-y-auto pr-1">
              {/* Tab 1: 分类 (Categories) —— 目录树卡片纵向结构 */}
              {kind === 'categories' && (
                <div className="space-y-2">
                  {items.map(item => {
                    const isEditing = editingId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="group flex items-center justify-between rounded-xl border border-slate-200/90 bg-white p-2.5 sm:p-3 hover:border-orange-300 hover:shadow-xs transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                            <FolderTree className="h-4 w-4" />
                          </div>

                          {isEditing ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                ref={editInputRef}
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') void handleSaveRename();
                                  if (e.key === 'Escape') {e.stopPropagation(); setEditingId(null);}
                                }}
                                className="w-full rounded-lg border border-orange-400 px-2.5 py-1 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                              />
                              <button
                                onClick={() => void handleSaveRename()}
                                className="p-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 shrink-0"
                                title="保存"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 shrink-0"
                                title="取消"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                                  {item.name}
                                </span>
                                <span className="rounded bg-orange-50 border border-orange-200/60 px-1.5 py-0.2 text-[10px] font-medium text-orange-700 shrink-0">
                                  大类目录
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => startRename(item.id, item.name)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                              title="重命名"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void handleRemove(item.id, item.name)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="停用"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tab 2: 主题 (Themes) —— 双列风格美学卡片 */}
              {kind === 'themes' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {items.map(item => {
                    const isEditing = editingId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="group flex items-center justify-between rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50/40 via-white to-white p-2.5 hover:border-violet-300 hover:shadow-xs transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-1.5">
                          <div className="w-8 h-8 rounded-lg bg-violet-100/70 border border-violet-200/50 flex items-center justify-center text-violet-600 shrink-0">
                            <Palette className="h-3.5 w-3.5" />
                          </div>

                          {isEditing ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <input
                                ref={editInputRef}
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') void handleSaveRename();
                                  if (e.key === 'Escape') {e.stopPropagation(); setEditingId(null);}
                                }}
                                className="w-full rounded-md border border-violet-400 px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                              />
                              <button
                                onClick={() => void handleSaveRename()}
                                className="p-1 rounded bg-violet-600 text-white hover:bg-violet-700 shrink-0"
                                title="保存"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-100 shrink-0"
                                title="取消"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="min-w-0 flex-1">
                              <p className="text-xs sm:text-sm font-semibold text-slate-800 truncate" title={item.name}>
                                {item.name}
                              </p>
                              <div className="mt-0.5 flex items-center">
                                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.2 text-[10px] font-medium text-violet-700 border border-violet-200/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                                  风格
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => startRename(item.id, item.name)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                              title="重命名"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void handleRemove(item.id, item.name)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="停用"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tab 3: 标签 (Tags) —— 标签胶囊网格云 */}
              {kind === 'tags' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {items.map(item => {
                    const isEditing = editingId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="group flex items-center justify-between rounded-lg border border-sky-100 bg-sky-50/20 hover:bg-white hover:border-sky-300 p-2 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-1 w-full">
                            <input
                              ref={editInputRef}
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') void handleSaveRename();
                                if (e.key === 'Escape') {e.stopPropagation(); setEditingId(null);}
                              }}
                              className="w-full rounded border border-sky-400 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                            />
                            <button
                              onClick={() => void handleSaveRename()}
                              className="p-1 rounded bg-sky-600 text-white hover:bg-sky-700 shrink-0"
                              title="保存"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-100 shrink-0"
                              title="取消"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center min-w-0 flex-1 mr-1">
                              <span className="shrink-0 rounded bg-sky-100/90 text-sky-700 px-1.5 py-0.5 text-[11px] font-bold leading-none mr-1.5">
                                #
                              </span>
                              <span className="text-xs font-semibold text-slate-700 truncate" title={item.name}>
                                {item.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100">
                              <button
                                onClick={() => startRename(item.id, item.name)}
                                className="rounded p-1 text-slate-400 hover:bg-sky-50 hover:text-sky-600 transition-colors"
                                title="重命名"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => void handleRemove(item.id, item.name)}
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                title="停用"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 空数据展示 */}
              {!items.length && (
                <div className="py-12 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                  <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-xs ${currentTab.bannerIconClass}`}>
                    <TabIcon className="h-5 w-5" />
                  </div>
                  <h4 className="mt-2 text-xs sm:text-sm font-semibold text-slate-700">
                    暂无{currentTab.name}
                  </h4>
                  <p className="mt-1 text-xs text-slate-400">
                    {currentTab.emptyHint}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
