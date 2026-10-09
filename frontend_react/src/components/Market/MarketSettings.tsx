export function MarketSettings() {
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">系统商店</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">同一账号的居民共享库存，每小时整点刷新。商品越贵越少见，饲料常驻供应。</p>
        <p className="mt-5 text-sm font-semibold text-slate-700">随机商品位数量 = 参与统一生活的 Agent 数量 × 2</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">按生成批次时生效的参与人数自动计算，无需手动设置。参与人数变化从下一批次生效，已生成的库存保持不变；饲料不占随机商品位。</p>
    </section>;
}
