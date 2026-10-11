import {useEffect, useState} from 'react';
import {novelApi} from '../../api/novel';
import type {Change, Revision} from '../../types/api/novel';
import {Modal} from './ui';
import {Prose} from './Prose';
export function Evidence({id, fact, close}: {id: string; fact: Change; close: () => void}) {
    const [revision, setRevision] = useState<Revision | null>(null), [error, setError] = useState('');
    useEffect(() => {let active = true;void novelApi.revision(id, fact.revisionId!).then(r => {if (active) setRevision(r);}).catch(e => {if (active) setError(e.message);});return () => {active = false;};}, [id, fact.revisionId]);
    const start = revision?.content.indexOf(fact.quote) ?? -1;
    return <Modal title="故事事实的原文证据" close={close}><p className="text-sm font-semibold text-slate-700">{fact.chapterTitle} · {fact.description}</p>{error ? <p className="text-sm text-amber-700">{error}</p> : !revision ? <p className="text-sm text-slate-400">正在打开正文版本…</p> : <><p className="text-xs text-slate-400">{new Date(revision.createdAt).toLocaleString()} 保存的版本</p><div className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-7">{start >= 0 && revision.content.slice(Math.max(0, start - 250), start)}<mark className="rounded bg-orange-100 px-1 text-orange-800">{fact.quote}</mark>{start >= 0 && revision.content.slice(start + fact.quote.length, start + fact.quote.length + 250)}</div><details><summary className="cursor-pointer text-sm text-orange-600">阅读完整版本</summary><div className="mt-4"><Prose text={revision.content}/></div></details></>}</Modal>;
}
