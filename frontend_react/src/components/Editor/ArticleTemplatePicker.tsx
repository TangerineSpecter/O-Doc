import {BookOpen, Bookmark, CalendarDays, FileText, type LucideIcon, RotateCcw, Terminal, Users, X} from 'lucide-react';
import {isUserArticleTemplate, type ArticleTemplate} from '../../utils/articleTemplates';

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
    blank: FileText,
    'tech-spec': Terminal,
    'meeting-notes': Users,
    'reading-notes': BookOpen,
    'weekly-report': CalendarDays,
    retro: RotateCcw,
};

interface ArticleTemplatePickerProps {
    templates: ArticleTemplate[];
    onSelect: (template: ArticleTemplate) => void;
    onDeleteUser: (template: ArticleTemplate) => void;
    onSaveCurrent: () => void;
}

export function ArticleTemplatePicker({
    templates,
    onSelect,
    onDeleteUser,
    onSaveCurrent,
}: ArticleTemplatePickerProps) {
    return (
        <section
            className="mx-auto w-full max-w-4xl shrink-0 px-6 pb-2 pt-5 sm:px-12"
            aria-label="从模板开始"
        >
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-800">从模板开始</h2>
                <button
                    type="button"
                    onClick={onSaveCurrent}
                    className="text-xs font-medium text-orange-600 transition-colors hover:text-orange-700"
                >
                    保存当前为模板
                </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map(template => {
                    const isUser = isUserArticleTemplate(template);
                    const Icon = isUser ? Bookmark : (TEMPLATE_ICONS[template.id] ?? FileText);
                    return (
                        <div
                            key={template.id}
                            className="relative flex items-start rounded-xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-orange-300 hover:bg-orange-50/70"
                        >
                            <button
                                type="button"
                                onClick={() => onSelect(template)}
                                className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                                    <Icon className="h-4 w-4" aria-hidden="true"/>
                                </span>
                                <span className="min-w-0 pr-5">
                                    <span className="block text-sm font-medium text-slate-800">{template.name}</span>
                                    <span className="mt-0.5 block text-xs text-slate-400">
                                        {template.description || (isUser ? '我的模板' : '')}
                                    </span>
                                </span>
                            </button>
                            {isUser && (
                                <button
                                    type="button"
                                    aria-label={`删除模板 ${template.name}`}
                                    onClick={() => onDeleteUser(template)}
                                    className="absolute right-2 top-2 rounded-md p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                                >
                                    <X className="h-3.5 w-3.5"/>
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
