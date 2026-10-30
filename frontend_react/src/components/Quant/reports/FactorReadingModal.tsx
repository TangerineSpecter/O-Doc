import { useQuantCopyFeedback } from '../../../hooks/useQuantCopyFeedback';
import { Check, Copy } from 'lucide-react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { QuantFactorData } from '../../../types/api/quant';
import { conciseFactorSummary, pythonExpression, pythonFormula, type FactorReading } from '../../../utils/quantFactorReading';
import { factorRoles } from '../factorPresentation';
import { QuantModal } from '../ui';

SyntaxHighlighter.registerLanguage('python', python);

export function FactorReadingModal({ factor, reading, close }: { factor: QuantFactorData; reading?: FactorReading; close: () => void }) {
    const { copiedKey, error: copyError, copy } = useQuantCopyFeedback();
    const copied = copiedKey === 'copy';
    const inferredCode = pythonExpression(factor.expression);
    const code = reading?.code || pythonFormula(factor.formula) || inferredCode;
    const summary = reading?.summary || conciseFactorSummary(factor.summary);
    return <QuantModal title={factor.name} subtitle={factorRoles[factor.role] || factor.role} close={close} wide>
        <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">计算逻辑</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{summary}</p>
        </section>
        <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">计算方式</h3>
            {!reading?.code && !pythonFormula(factor.formula) && inferredCode && <p className="text-xs leading-5 text-slate-500">根据已保存的表达式展示单次计算，变量由调用方提供。</p>}
            {code ? <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2 text-xs text-slate-300">
                    <span className="font-mono">Python</span>
                    <button type="button" onClick={() => void copy(code)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-slate-700 hover:text-white">
                        {copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? '已复制' : '复制代码'}
                    </button>
                </div>
                {copyError && <p role="alert" className="px-4 pt-2 text-xs text-red-300">{copyError}</p>}
                <SyntaxHighlighter language="python" style={vscDarkPlus} className="scrollbar-hide" customStyle={{margin: 0, padding: '1rem', fontSize: '0.8rem', lineHeight: '1.7', background: 'transparent'}}
                    wrapLongLines={false}>{code}</SyntaxHighlighter>
            </div> : <div className="rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                <p>这份旧报告没有保存 Python 计算片段。</p>
                {factor.formula && <details className="mt-2 text-xs"><summary className="cursor-pointer">查看原始计算说明</summary><p className="mt-2 whitespace-pre-wrap break-words">{factor.formula}</p></details>}
            </div>}
        </section>
    </QuantModal>;
}
