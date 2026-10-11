import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {novelApi} from '../../api/novel';
import type {ReaderBook} from '../../types/api/novel';
import {Prose} from './Prose';
import {Button} from './ui';
export function Reader({id}: {id: string}) {
    const [book, setBook] = useState<ReaderBook | null>(null), [error, setError] = useState('');
    const [cid, setCid] = useState('');
    useEffect(() => {let active = true;void novelApi.read(id, cid || undefined).then(data => {if (active) setBook(data);}).catch(e => {if (active) setError(e.message || '小说暂不可阅读');});return () => {active = false;};}, [id, cid]);
    const index = book?.chapters.findIndex(c => c.id === book.chapter?.id) ?? -1;
    return <div className="h-dvh overflow-auto bg-[#faf9f6] scrollbar-hide"><header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-[#faf9f6]/95 px-5 py-4 backdrop-blur"><Link to="/" className="text-sm text-slate-500">← 文集</Link>{book?.canManage && <Link to={`/novel/${id}`} className="text-sm text-orange-600">返回创作</Link>}</header><main className="mx-auto max-w-3xl px-6 py-12">{error ? <p className="text-center text-slate-500">{error}</p> : !book ? <p className="text-slate-400">正在打开小说…</p> : <><h1 className="text-center text-3xl font-semibold tracking-wide text-slate-800">{book.title}</h1><p className="mx-auto mt-5 max-w-xl whitespace-pre-wrap text-center text-sm leading-7 text-slate-500">{book.synopsis}</p><details className="my-10 rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer text-sm font-medium">已发布目录 · {book.chapters.length} 章</summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{book.chapters.map(ch => <button key={ch.id} onClick={() => setCid(ch.id)} className={`rounded-xl p-3 text-left text-sm ${book.chapter?.id === ch.id ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}>{ch.volume} · {ch.title}</button>)}</div></details>{book.chapter ? <><h2 className="mb-8 text-xl font-semibold text-slate-700">{book.chapter.title}</h2><Prose text={book.chapter.content}/><div className="mt-12 flex justify-between"><Button disabled={index <= 0} onClick={() => setCid(book.chapters[index - 1].id)}>上一章</Button><Button disabled={index >= book.chapters.length - 1} onClick={() => setCid(book.chapters[index + 1].id)}>下一章</Button></div></> : <p className="text-center text-sm text-slate-400">还没有发布章节。</p>}</>}</main></div>;
}
