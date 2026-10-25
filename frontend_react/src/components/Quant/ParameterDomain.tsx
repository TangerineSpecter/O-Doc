import type {QuantParameterDomain} from '../../types/api/quantParameters';
import {describeParameterDomain} from '../../utils/quantParameterDomain';

export function ParameterDomain({name, domain, authored = false}: {name: string; domain?: QuantParameterDomain; authored?: boolean}) {
    if (!domain) return <p className="text-xs leading-6 text-slate-500">未单独声明可自动检查的约束；其他参数中的关联规则仍适用，文字约束需另行核对。</p>;
    return <div className="mt-2 space-y-1 text-xs leading-6 text-slate-600">
        <p><span className="font-medium">本机实验将检查：</span>{describeParameterDomain(name, domain)}</p>
        <details><summary className="cursor-pointer">约束原文与适用边界</summary>
            <p>{authored ? '本公式版本的作者声明；不等同于原始源码事实或已验证的参数规律。' : 'AI 提取的声明约束，语义仍需核对；'}未结构化的文字约束不会自动执行。</p>
            {domain.evidence.map((row, index) => <blockquote key={index} className="mt-2 whitespace-pre-wrap break-words border-l-2 border-slate-200 pl-3">{row.quote}</blockquote>)}
        </details>
    </div>;
}
