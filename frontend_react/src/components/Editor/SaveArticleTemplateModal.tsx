import {useEffect, useState} from 'react';
import {BookmarkPlus, X} from 'lucide-react';

interface SaveArticleTemplateModalProps {
    defaultName: string;
    onClose: () => void;
    onSave: (input: {name: string; description: string}) => void;
}

export function SaveArticleTemplateModal({
    defaultName,
    onClose,
    onSave,
}: SaveArticleTemplateModalProps) {
    const [name, setName] = useState(defaultName);
    const [description, setDescription] = useState('');

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const submit = () => {
        onSave({name, description});
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                onClick={onClose}
            />
            <div
                className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
                onClick={event => event.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-4 top-4 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label="关闭"
                >
                    <X className="h-4 w-4"/>
                </button>
                <form
                    className="p-6"
                    onSubmit={event => {
                        event.preventDefault();
                        submit();
                    }}
                >
                    <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                            <BookmarkPlus className="h-5 w-5"/>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">保存为模板</h3>
                            <p className="text-xs text-slate-400">保存在本机，下次新建文章时可选</p>
                        </div>
                    </div>
                    <label className="mb-3 block">
                        <span className="mb-1.5 block text-sm font-semibold text-slate-700">模板名称</span>
                        <input
                            autoFocus
                            value={name}
                            onChange={event => setName(event.target.value)}
                            maxLength={40}
                            placeholder="例如：需求评审纪要"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                        />
                    </label>
                    <label className="mb-5 block">
                        <span className="mb-1.5 block text-sm font-semibold text-slate-700">简短说明</span>
                        <input
                            value={description}
                            onChange={event => setDescription(event.target.value)}
                            maxLength={80}
                            placeholder="可选，显示在模板卡片上"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                        />
                    </label>
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 active:bg-orange-700"
                        >
                            保存模板
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
