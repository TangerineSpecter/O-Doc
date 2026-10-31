import type {QuantFactorData} from '../../../types/api/quant';
import type {PortableQualification} from '../../../types/api/quantVerification';
import {factorReadiness, factorRolePurpose} from '../../../utils/quantFactorReadiness';
import {factorOutputs, factorRoles} from '../factorPresentation';
import {QuantButton} from '../ui';

const operators: Record<string, string> = {sub: '相减', add: '相加', mul: '相乘', div: '相除', lag: '取历史值', sma: '移动平均', sum: '窗口求和', std: '标准差', highest: '窗口最大值', lowest: '窗口最小值', ts_rank: '窗口排名', gt: '大于', lt: '小于', eq: '等于', and: '同时满足', or: '满足任一', gate: '条件门控', abs: '绝对值', sqrt: '平方根', neg: '取负值', log: '对数'};
function ExpressionBranch({nodes, id = 'root', ancestors = []}: {nodes: PortableQualification['nodes']; id?: string; ancestors?: string[]}) {
    const node = nodes.find(row => row.id === id);
    if (!node || ancestors.includes(id) || ancestors.length > 20) return <li>计算节点缺失或层级异常，请核对完整结构检查。</li>;
    const label = node.op === 'input' ? `输入 · ${node.name}` : node.op === 'parameter' ? `参数 · ${node.name}` : node.op === 'constant' ? '常量（值见公式）' : operators[node.op] || node.op;
    return <li className="break-words"><span>{label}</span>{node.dependencies.length > 0 && <ul className="ml-3 mt-1 space-y-1 border-l border-slate-200 pl-3">{node.dependencies.map(child => <ExpressionBranch key={child} nodes={nodes} id={child} ancestors={[...ancestors, id]}/>)}</ul>}</li>;
}

export function FactorReadiness({value, definition, openSource, openVersions}: {value: PortableQualification; definition?: QuantFactorData; openSource?: () => void; openVersions?: () => void}) {
    const readiness = factorReadiness(value);
    const usedInputs = value.inputs.filter(row => row.used);
    const hasTree = value.nodes.length > 0;
    return <section className="space-y-4" aria-label="计算条件与下一步">
        <div><h4 className="text-sm font-semibold text-slate-900">{readiness.title}</h4>
            {definition && <p className="mt-1 text-xs leading-6 text-slate-600">{factorRoles[definition.role]} · {factorRolePurpose[definition.role]}</p>}
        </div>
        {readiness.steps.length > 0 && <ul className="divide-y divide-slate-100">{readiness.steps.map((step, index) => <li key={`${step.title}-${index}`} className="py-3 first:pt-0">
            <p className="text-sm font-medium text-slate-800">{step.title}</p><p className="mt-1 break-words text-xs leading-6 text-slate-600">{step.detail}</p>
        </li>)}</ul>}
        <div className="flex flex-wrap gap-2">
            {openVersions && readiness.steps.some(step => step.action !== 'source') && <QuantButton onClick={openVersions}>查看或修订公式版本</QuantButton>}
            {openSource && <QuantButton onClick={openSource}>核对来源报告与源码</QuantButton>}
        </div>
        <details className="rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">计算依赖 · {hasTree ? '按受控表达式展开' : '尚未建立'}</summary>
            <div className="mt-3 space-y-3">
                <p>输入：{(hasTree ? usedInputs : value.inputs).map(row => row.name).join('、') || '未声明'}{!hasTree && '（仅有声明，引用关系尚未核对）'}</p>
                {hasTree ? <ul className="max-h-72 overflow-auto scrollbar-hide"><ExpressionBranch nodes={value.nodes}/></ul> : <p>缺少受控表达式，不能从变量名或语义相似关系推断计算链路。内部状态须回到源码核对。</p>}
                {definition && <p>输出声明：{factorOutputs[definition.outputType]} · {definition.units}</p>}
                {!!value.external_dependencies.length && <p>外部依赖声明：{value.external_dependencies.map(row => row.name).join('；')}。尚未验证原平台依赖语义。</p>}
            </div>
        </details>
    </section>;
}
