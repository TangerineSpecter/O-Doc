import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {useNavigate} from 'react-router-dom';
import {Select} from '../common/Select';
import type {SproutRecord} from '../../types/api/sprout';
import type {Anthology} from '../../types/api/anthology';
interface Props {record: SproutRecord; collections: Anthology[]; collection: string; setCollection: (id: string) => void; onSave: () => void; saving: boolean}
export default function SproutOutput({record, collections, collection, setCollection, onSave, saving}: Props) {
    const navigate = useNavigate();
    const result = record.result;
    if (!result.body) return null;
    return <section className="rounded-2xl border border-emerald-200 bg-white p-5 sm:p-7">
        <p className="mb-3 text-xs font-medium text-emerald-700">{result.kind === 'article' ? '长成一篇短文' : result.kind === 'insight' ? '一段启发' : '暂未找到方向'} · {result.length} 字 · {result.mode === 'research' ? '含调研资料' : '灵感写作'}</p>
        <h3 className="mb-5 text-xl font-bold text-slate-900">{result.title}</h3>
        <div className="prose prose-slate max-w-none prose-p:leading-8"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.body}</ReactMarkdown></div>
        <details className="mt-6 border-t border-slate-100 pt-4 text-sm"><summary className="cursor-pointer text-slate-500">灵感来源 · {record.sources.length} 张卡片</summary><div className="mt-3 space-y-3">{record.sources.map(source => <blockquote key={source.memoId} className="border-l-2 border-orange-200 pl-3"><p className="whitespace-pre-wrap">{source.content}</p><p className="mt-1 text-xs text-slate-400">{source.creatorName || '用户'} · {source.tag || '未归类'}</p></blockquote>)}</div></details>
        {!!result.references?.length && <details className="mt-4 text-sm"><summary className="cursor-pointer text-slate-500">参考资料 · {result.references.length} 项</summary><ul className="mt-2 space-y-2">{result.references.map(ref => <li key={ref.url}><a href={ref.url} target="_blank" rel="noreferrer" className="text-emerald-700 underline">{ref.title}</a></li>)}</ul></details>}
        {result.kind === 'article' && <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            {!record.articleId && <div className="w-full sm:w-48"><Select menuPortal value={collection} onChange={setCollection} options={collections.map(item => ({value: item.collId, label: item.title}))} placeholder="选择保存文集"/></div>}
            <button type="button" disabled={saving || (!collection && !record.articleId)} onClick={onSave} className="rounded-full bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-40">{record.articleId ? '查看已保存文章' : saving ? '保存中…' : '保存到文集'}</button>
            <button type="button" disabled={!collection && !record.articleId} onClick={() => navigate(`/editor?sproutId=${record.id}${collection ? `&collId=${collection}` : ''}`)} className="rounded-full border border-slate-200 px-4 py-2 text-sm disabled:opacity-40">进入编辑器</button>
        </div>}
    </section>;
}
