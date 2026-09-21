import {useEffect, useId, useRef, useState, type CSSProperties} from 'react';
import {NavLink} from 'react-router-dom';
import {ArrowUpRight, BookOpen, BarChart2, FolderOpen, HeartPulse, Library, PenTool, StickyNote, Tag, X, Sparkles} from 'lucide-react';
import {useFloatingMenu} from './useFloatingMenu';
import './floating-menu.css';
import {StarCharm} from './StarCharm';
import {OrangeCompanion} from './OrangeCompanion';

const destinations = [
    {path: '/prompts', label: '提示词库', description: '让好表达随时可用', icon: Sparkles, tone: 'sand'},
    {path: '/memos', label: '闪念记录', description: '接住一闪而过的想法', icon: StickyNote, tone: 'peach'},
    {path: '/whiteboard', label: '灵感白板', description: '让思绪自由生长', icon: PenTool, tone: 'sage'},
    {path: '/resources', label: '资源库', description: '收藏，皆有所用', icon: Library, tone: 'blue'},
    {path: '/categories', label: '分类管理', description: '为知识找到归处', icon: FolderOpen, tone: 'sand'},
    {path: '/tags', label: '标签管理', description: '串起零散的灵感', icon: Tag, tone: 'lilac'},
    {path: '/stats', label: '数据统计', description: '看见每一点积累', icon: BarChart2, tone: 'blue'},
    {path: '/maintenance', label: '知识维护', description: '常回顾，常有新收获', icon: HeartPulse, tone: 'sage'},
];

export default function CompanionFloatingMenu() {
    const id = useId();
    const [hovered, setHovered] = useState(false);
    const [playRequest, setPlayRequest] = useState(0);
    const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(clickTimer.current), []);
    const {isOpen, rootRef, triggerRef, panelRef, toggle, close, onKeyDown} = useFloatingMenu();

    return (
        <div className="orange-menu" ref={rootRef} data-open={isOpen} onKeyDown={onKeyDown}>
            <section className="orange-menu__panel" id={id} ref={panelRef}
                     aria-label="小橘工具箱" inert={!isOpen} aria-hidden={!isOpen}>
                <header className="orange-menu__header">
                    <div>
                        <span className="orange-menu__eyebrow">ORANGE DAYS / 小橘手账</span>
                        <h2>收好今天的小灵感<span> ✳</span></h2>
                        <p>写一点，藏一点，让好想法慢慢长大。</p>
                    </div>
                    <button className="orange-menu__dismiss" onClick={() => close(true)} aria-label="关闭工具箱"><X size={16}/></button>
                </header>
                <div className="orange-menu__section-label">01 / 记录灵感 <span>✧</span></div>
                <nav aria-label="快捷导航" className="orange-menu__destinations">
                    {destinations.map(({path, label, description, icon: Icon, tone}, index) => (
                        <NavLink key={path} to={path} onClick={() => close(true)}
                                 style={{'--item-index': index} as CSSProperties}
                                 className={({isActive}) => `orange-menu__item orange-menu__item--${tone} ${index < 2 ? 'orange-menu__item--featured' : ''} ${index === 2 ? 'orange-menu__item--collection-start' : ''} ${isActive ? 'is-current' : ''}`}>
                            <span className="orange-menu__icon"><Icon size={20} strokeWidth={1.6}/></span>
                            <span className="orange-menu__copy"><strong>{label}</strong><small>{description}</small></span>
                            <ArrowUpRight className="orange-menu__arrow" size={15} aria-hidden="true"/>
                        </NavLink>
                    ))}
                </nav>
                <footer className="orange-menu__footer"><span><i/> 小橘陪你，慢慢积累</span><button className="orange-menu__play" onClick={() => {close(true); setPlayRequest(value => value + 1);}}>玩颗星星 ✧</button></footer>
            </section>
            <button className="orange-menu__toss" onClick={() => {
                clearTimeout(clickTimer.current);
                close();
                setPlayRequest(value => value + 1);
            }} aria-label="播放抛星星砸头动画">
                <span className="orange-menu__toss-orbit" aria-hidden="true"/>
                <StarCharm className="orange-menu__toss-star"/>
                <span className="orange-menu__control-tip">抛颗星星</span>
            </button>
            <button className="orange-menu__trigger" ref={triggerRef} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)} onClick={event => {
                        clearTimeout(clickTimer.current);
                        if (event.detail === 0) toggle();
                        else if (event.detail === 1) clickTimer.current = setTimeout(toggle, 260);
                    }}
                    onDoubleClick={() => {clearTimeout(clickTimer.current); close(true); setPlayRequest(value => value + 1);}}
                    title="单击打开工具箱 · 双击和小橘玩星星"
                    aria-expanded={isOpen} aria-controls={id} aria-label={isOpen ? '收起小橘工具箱' : '打开小橘工具箱'}>
                <span className="orange-menu__hint">打开小橘手账 <ArrowUpRight size={13}/></span>
                <OrangeCompanion isOpen={isOpen} playRequest={playRequest} hovered={hovered}/>
                <span className="orange-menu__book-badge" aria-hidden="true">{isOpen ? <X size={15}/> : <BookOpen size={16} strokeWidth={1.7}/>}</span>
            </button>
        </div>
    );
}
