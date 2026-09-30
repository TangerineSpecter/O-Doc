const tabs = [['all', '全部动态'], ['person', '个人动态'], ['related', '与我有关']] as const;

export default function MomentsTabs({value, onChange}: {value: string; onChange: (value: string) => void}) {
    const index = Math.max(0, tabs.findIndex(([id]) => id === value));
    return <div role="group" aria-label="朋友圈动态筛选" className="relative inline-grid shrink-0 grid-cols-3 rounded-xl bg-slate-100 p-1">
        <span aria-hidden="true" className="pointer-events-none absolute bottom-1 left-1 top-1 w-[calc((100%_-_8px)/3)] rounded-lg bg-white shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none" style={{transform: `translateX(${index * 100}%)`}}/>
        {tabs.map(([id, label]) => <button type="button" key={id} aria-pressed={value === id} onClick={() => onChange(id)} className={`relative z-10 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none ${value === id ? 'text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>)}
    </div>;
}
