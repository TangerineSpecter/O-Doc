import type {TokenMetrics} from '../../types/api/tokenUsage';
import {tokenNumber} from '../../utils/tokenUsage';

type TokenModelTotalsProps = Pick<TokenMetrics, 'largeModelTokens' | 'decisionModelTokens'> & {className?: string};

export default function TokenModelTotals({largeModelTokens, decisionModelTokens, className = ''}: TokenModelTotalsProps) {
    return (
        <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-0.5 tabular-nums ${className}`}>
            <span className="whitespace-nowrap text-orange-600">大模型 {tokenNumber(largeModelTokens)} token</span>
            <span className="whitespace-nowrap text-violet-600">决策 {tokenNumber(decisionModelTokens)} token</span>
        </div>
    );
}
