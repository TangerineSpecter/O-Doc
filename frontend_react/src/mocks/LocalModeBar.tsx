import {clearQuantMockData} from './quant/state';

export default function LocalModeBar() {
    const state = new URLSearchParams(location.search).get('mockState') || 'populated';
    const change = (value: string) => {
        const url = new URL(location.href);
        if (value === 'populated') url.searchParams.delete('mockState');
        else url.searchParams.set('mockState', value);
        location.assign(url);
    };
    return <aside aria-label="本地调试模式" className="sticky top-0 z-[110] flex flex-wrap items-center justify-center gap-2 border-b border-orange-200 bg-orange-50 px-3 py-1.5 text-xs text-orange-800">
        <strong>LOCAL · Mock 数据</strong><span className="hidden sm:inline">量化样例在本机保留，其他样例刷新恢复</span>
        <div className="flex gap-1 rounded-full border border-orange-200 bg-white p-0.5">
            {([['populated', '样例'], ['empty', '空数据'], ['slow', '加载中'], ['error', '接口错误']] as const).map(([value, label]) =>
                <button key={value} type="button" aria-pressed={state === value} onClick={() => change(value)} className={`rounded-full px-2 py-0.5 ${state === value ? 'bg-orange-500 text-white' : 'hover:bg-orange-100'}`}>{label}</button>)}
        </div>
        <button type="button" onClick={() => {clearQuantMockData();location.reload();}} className="rounded-full border border-orange-200 bg-white px-2 py-0.5 hover:bg-orange-100">重置样例</button>
    </aside>;
}
