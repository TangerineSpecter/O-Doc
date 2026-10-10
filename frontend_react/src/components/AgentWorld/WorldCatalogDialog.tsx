import {lazy, Suspense, useState} from 'react';
import {ChefHat, Compass, Package} from 'lucide-react';
import WorldDialog from './WorldDialog';
import WorldOrbitLoader from './WorldOrbitLoader';

const Items = lazy(() => import('./ItemCatalogDialog').then(module => ({default:module.ItemCatalogContent})));
const Recipes = lazy(() => import('../Cooking/CookingDialog').then(module => ({default:module.CookingCatalogContent})));
const Adventure = lazy(() => import('../Combat/AdventureCatalog'));
export type WorldCatalogSection = 'items' | 'recipes' | 'adventure';
const sections = [
    {id: 'items', label: '物品图鉴', icon: Package},
    {id: 'recipes', label: '美食食谱', icon: ChefHat},
    {id: 'adventure', label: '冒险资料', icon: Compass},
] as const;

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
            {/* 一级模块导航：通栏下划线标签页，与下方二级胶囊筛选形成清晰的主次层级 */}
            <div
                role="tablist"
                aria-label="世界图鉴分类"
                className="flex shrink-0 items-center gap-4 sm:gap-6 border-b border-slate-200/80 pb-px"
            >
                {sections.map(tab => {
                    const Icon = tab.icon;
                    const isActive = section === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => choose(tab.id)}
                            className={`group relative flex items-center gap-2 pb-2.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 ${
                                isActive
                                    ? 'text-orange-600'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <Icon
                                className={`h-4 w-4 shrink-0 transition-colors ${
                                    isActive
                                        ? 'text-orange-500'
                                        : 'text-slate-400 group-hover:text-slate-600'
                                }`}
                            />
                            <span>{tab.label}</span>
                            {isActive && (
                                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-orange-500 shadow-2xs" />
                            )}
                        </button>
                    );
                })}
            </div>
            {/* 保留面板状态与尺寸；跳过非活动子树绘制，避免 visibility 被内部 transition-all 延迟切换。 */}
            <div className="relative min-h-0 flex-1">
                {visited.map(id => <section key={id} aria-label={`${sections.find(tab => tab.id === id)?.label}图鉴内容`} aria-hidden={section !== id} inert={section !== id} style={{contentVisibility: section === id ? 'visible' : 'hidden'}} className={`absolute inset-0 flex min-h-0 flex-col ${section === id ? '' : 'pointer-events-none'}`}>
                    <Suspense fallback={<WorldOrbitLoader title="正在翻开图鉴"/>}>
                        {id === 'items' ? <Items active={section === id}/> : id === 'recipes' ? <Recipes residents={residents} initialAgentId={initialAgentId} active={section === id}/> : <Adventure residents={residents} initialAgentId={initialAgentId} active={section === id}/>}
                    </Suspense>
                </section>)}
            </div>
        </div>
    </WorldDialog>;
}
