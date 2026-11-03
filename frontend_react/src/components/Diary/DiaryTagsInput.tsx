import {useId, useState} from 'react';
import {Hash, Plus, X} from 'lucide-react';
import {mergeDiaryTags} from './diaryTags';

const SUGGESTED_TAGS = ['日常', '阅读', '散步', '思考', '美食', '旅行', '夜读', '灵感'] as const;

export default function DiaryTagsInput({
    tags,
    onChange,
    input,
    onInputChange,
    layout = 'default',
}: {
    tags: string[];
    onChange: (tags: string[]) => void;
    input: string;
    onInputChange: (value: string) => void;
    layout?: 'default' | 'sidebar';
}) {
    const [error, setError] = useState('');
    const inputId = useId();
    const isSidebar = layout === 'sidebar';

    const addValues = (rawValues: string[]) => {
        const result = mergeDiaryTags(tags, [...rawValues, input].join(','));
        if (result.error) {
            setError(result.error);
            return;
        }
        onChange(result.tags);
        onInputChange('');
        setError('');
    };

    const add = () => addValues([]);

    const availableSuggestions = SUGGESTED_TAGS.filter(t => !tags.includes(t));

    return (
        <div className="py-2">
            <div className={isSidebar ? 'space-y-1.5' : 'flex flex-col gap-2 sm:flex-row sm:items-center'}>
                <label
                    htmlFor={inputId}
                    className={
                        isSidebar
                            ? 'block text-xs font-semibold tracking-wider text-zinc-400 uppercase'
                            : 'w-24 shrink-0 text-xs font-semibold tracking-wider text-zinc-400 uppercase'
                    }
                >
                    标签 TAGS
                </label>

                <div className="flex flex-1 flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 transition-colors focus-within:border-zinc-950">
                    {tags.map(tag => (
                        <span
                            key={tag}
                            className="inline-flex max-w-full items-center gap-1 break-all rounded-full bg-zinc-950 px-2.5 py-0.5 text-xs font-medium text-white"
                        >
                            <Hash size={10} className="shrink-0 opacity-70"/>
                            {tag}
                            <button
                                type="button"
                                aria-label={`移除标签 ${tag}`}
                                onClick={() => onChange(tags.filter(t => t !== tag))}
                                className="ml-0.5 rounded-full p-0.5 hover:bg-white/20"
                            >
                                <X size={11}/>
                            </button>
                        </span>
                    ))}
                    <input
                        id={inputId}
                        value={input}
                        onChange={e => onInputChange(e.target.value)}
                        onBlur={add}
                        onKeyDown={e => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                                e.preventDefault();
                                add();
                            }
                        }}
                        placeholder={
                            tags.length
                                ? isSidebar
                                    ? '继续输入…'
                                    : '继续输入标签…'
                                : isSidebar
                                  ? '输入标签，按回车添加'
                                  : '输入标签，按回车添加（最多 10 个）'
                        }
                        className="min-w-[120px] flex-1 bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 outline-none"
                    />
                </div>
            </div>

            {availableSuggestions.length > 0 && tags.length < 10 && (
                <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${isSidebar ? '' : 'sm:pl-24'}`}>
                    <span className="text-[11px] text-zinc-400">快速添加：</span>
                    {availableSuggestions.slice(0, 6).map(item => (
                        <button
                            type="button"
                            key={item}
                            onClick={() => addValues([item])}
                            className="inline-flex items-center gap-0.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-[11px] text-zinc-600 transition-colors hover:border-zinc-950 hover:bg-white hover:text-zinc-950"
                        >
                            <Plus size={10}/>
                            {item}
                        </button>
                    ))}
                </div>
            )}

            {error && (
                <p role="alert" className={`mt-1.5 text-xs text-red-600 ${isSidebar ? '' : 'sm:pl-24'}`}>
                    {error}
                </p>
            )}
        </div>
    );
}
