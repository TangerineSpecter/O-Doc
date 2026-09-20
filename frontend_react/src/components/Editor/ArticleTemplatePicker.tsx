import {BookOpen, CalendarDays, FileText, type LucideIcon, RotateCcw, Terminal, Users} from 'lucide-react';
import {listArticleTemplates, type ArticleTemplate} from '../../utils/articleTemplates';

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
    blank: FileText,
    'tech-spec': Terminal,
    'meeting-notes': Users,
    'reading-notes': BookOpen,
    'weekly-report': CalendarDays,
    retro: RotateCcw,
};

interface ArticleTemplatePickerProps {
    onSelect: (template: ArticleTemplate) => void;
}

export function ArticleTemplatePicker({onSelect}: ArticleTemplatePickerProps) {
    const templates = listArticleTemplates();

    return (
        <section
            className="mx-auto w-full max-w-4xl shrink-0 px-6 pb-2 pt-5 sm:px-12"
            aria-label="从模板开始"
        >
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-800">从模板开始</h2>
                <p className="text-xs text-slate-400">也可直接在下方空白写作</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map(template => {
                    const Icon = TEMPLATE_ICONS[template.id] ?? FileText;
                    return (
                        <button
                            key={template.id}
                            type="button"
                            onClick={() => onSelect(template)}
                            className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-orange-300 hover:bg-orange-50/70 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
                                <Icon className="h-4 w-4" aria-hidden="true"/>
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-medium text-slate-800">{template.name}</span>
                                <span className="mt-0.5 block text-xs text-slate-400">{template.description}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
