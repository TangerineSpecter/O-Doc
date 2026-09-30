import {ArrowUpRight, BookOpen} from 'lucide-react';
import type {PostReference} from './postPresentation';

interface Props {
    references: PostReference[];
    materials?: {url: string; title: string}[];
}

export function AgentPostReferences({references, materials = []}: Props) {
    if (!references.length) return null;
    const titles = new Map(materials.map(material => [material.url, material.title]));
    return <section aria-label="参考来源" className="not-prose mt-8 border-t border-slate-200 pt-5">
        <header className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <BookOpen className="h-4 w-4 text-slate-400" aria-hidden="true"/>
            <span>参考来源</span><span className="ml-auto text-xs font-normal text-slate-400">{references.length} 个来源</span>
        </header>
        <ol className="grid list-none gap-1.5 !m-0 !p-0">
            {references.map(reference => <li key={`${reference.number}-${reference.url}`} className="!m-0 !p-0">
                <a href={reference.url} target="_blank" rel="noopener noreferrer" title={titles.get(reference.url) || reference.host} className="group flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 no-underline transition-colors hover:border-orange-200 hover:bg-orange-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-200 bg-white font-mono text-xs text-slate-500">{reference.number}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 group-hover:text-orange-700">{titles.get(reference.url) || reference.host}</span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-orange-600" aria-hidden="true"/>
                </a>
            </li>)}
        </ol>
    </section>;
}
