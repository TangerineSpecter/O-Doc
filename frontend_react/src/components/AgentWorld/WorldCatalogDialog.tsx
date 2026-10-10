import {lazy, Suspense, useState} from 'react';
import WorldDialog from './WorldDialog';
import WorldOrbitLoader from './WorldOrbitLoader';

const Items = lazy(() => import('./ItemCatalogDialog').then(module => ({default:module.ItemCatalogContent})));
const Recipes = lazy(() => import('../Cooking/CookingDialog').then(module => ({default:module.CookingCatalogContent})));
const Adventure = lazy(() => import('../Combat/AdventureCatalog'));
export type WorldCatalogSection = 'items' | 'recipes' | 'adventure';
const sections = [{id:'items', label:'物品'}, {id:'recipes', label:'食谱'}, {id:'adventure', label:'冒险'}] as const;

export default function WorldCatalogDialog({onClose, residents, initialAgentId = '', initialSection = 'items'}: {
    onClose: () => void; residents: {id: string; name: string}[]; initialAgentId?: string; initialSection?: WorldCatalogSection;
}) {
    const [section, setSection] = useState(initialSection);
    const [visited, setVisited] = useState<WorldCatalogSection[]>([initialSection]);
    const choose = (id: WorldCatalogSection) => {
        setSection(id);
        setVisited(previous => previous.includes(id) ? previous : [...previous, id]);
    };
    return <WorldDialog title="世界图鉴" description="认识世界中的物品、美食与冒险。" size="wide" onClose={onClose}>
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div aria-label="世界图鉴分类" className="flex w-fit shrink-0 gap-1 rounded-full border border-slate-200/60 bg-slate-100 p-1">
                {sections.map(tab => <button key={tab.id} type="button" aria-pressed={section === tab.id} onClick={() => choose(tab.id)} className={`rounded-full px-5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 ${section === tab.id ? 'bg-white text-orange-600 shadow-2xs' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'}`}>{tab.label}</button>)}
            </div>
            {/* Retain visited panels at the same size so filters, selection and scroll survive switching. */}
            <div className="relative min-h-0 flex-1">
                {visited.map(id => <section key={id} aria-label={`${sections.find(tab => tab.id === id)?.label}图鉴内容`} aria-hidden={section !== id} inert={section !== id} className={`absolute inset-0 flex min-h-0 flex-col ${section === id ? '' : 'invisible pointer-events-none'}`}>
                    <Suspense fallback={<WorldOrbitLoader title="正在翻开图鉴"/>}>
                        {id === 'items' ? <Items active={section === id}/> : id === 'recipes' ? <Recipes residents={residents} initialAgentId={initialAgentId} active={section === id}/> : <Adventure residents={residents} initialAgentId={initialAgentId} active={section === id}/>}
                    </Suspense>
                </section>)}
            </div>
        </div>
    </WorldDialog>;
}
