export function TongdaxinParameterHelp({fieldLabel = '说明'}: {fieldLabel?: string}) {
    return <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600">
        <summary className="cursor-pointer font-medium">原公式有参数表时一起粘贴（可选）</summary>
        <p className="mt-2">可把编辑器里的参数表直接粘贴到“{fieldLabel}”，保留参数、最小、最大、缺省四列表头。支持逗号、Tab或空格分隔；该栏仅放整张表，研究报告仍由 AI 生成。</p>
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2 font-mono scrollbar-hide">{'参数,最小,最大,缺省\nN,2,60,20'}</pre>
        <p className="mt-2">没有参数表可留空，报告会保留缺失信息。表中缺省值、实际运行配置和待验证的候选值分别记录。</p>
        <p className="mt-2">若还要保留其他说明，可先归档，再从“补充依赖源码”附上原参数表 CSV/TSV，系统会另存来源并重新分析。</p>
    </details>;
}
