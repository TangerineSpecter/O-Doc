import {useMarketConfig} from '../../hooks/useMarketConfig';
import {useToast} from '../common/ToastProvider';

export function MarketSettings() {
    const config = useMarketConfig();
    const toast = useToast();
    const save = async () => {
        if (await config.save()) toast.success('市场配置已保存，下一个整点生效');
    };
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">系统商店</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">同一账号的居民共享库存，每小时整点刷新。商品越贵越少见，饲料常驻供应。修改数量从下一批次生效。</p>
        <label className="mt-5 block space-y-2 text-sm text-slate-700">
            <span>随机商品位数量</span>
            <input type="number" min={1} max={1000} value={config.count} onChange={e => config.setCount(e.target.value)} disabled={config.loading || config.busy}
                className="block w-full max-w-xs rounded-xl border border-slate-200 px-3 py-2"/>
        </label>
        {config.error && <p role="alert" className="mt-3 text-xs text-red-600">{config.error}</p>}
        {!config.loaded && !config.loading && <button type="button" onClick={config.reload} className="mt-3 text-xs text-orange-600">重新加载</button>}
        <button type="button" disabled={config.busy || config.loading || !config.loaded} onClick={() => void save()}
            className="mt-4 block shrink-0 whitespace-nowrap rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {config.busy ? '保存中…' : '保存配置'}
        </button>
    </section>;
}
