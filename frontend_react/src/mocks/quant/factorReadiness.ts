import type {QuantFactorData} from '../../types/api/quant';

/** Artificial internal-state examples. This does not parse or execute uploaded source. */
export function mockInternalStateFactors(base: QuantFactorData): QuantFactorData[] {
    return ['major_unusual_move_signal', 'damping_released_signal', 'recent_anomaly_count'].map((name, index) => ({
        ...structuredClone(base), name, role: index === 2 ? 'factor' : 'signal', family: 'volatility',
        summary: '内部状态依赖的人工展示样例；未执行模型、源码或行情，不代表原平台定义。',
        formula: index === 0 ? 'isAnomaly and sqrt(testStatistic) >= 2 * anomalyMultiple' : index === 1 ? 'dampingMeter crosses below NEAR_ZERO' : 'sum(isAnomaly, noiseLookback)',
        inputs: (index === 0 ? ['isAnomaly', 'testStatistic'] : index === 1 ? ['dampingMeter'] : ['isAnomaly']).map(input => ({name: input,
            meaning: '原平台内部状态（人工样例）', availability: '待核对收盘后可得时点', missingPolicy: '初始化和缺失规则尚未补齐'})),
        expression: null, outputType: index === 2 ? 'numeric_series' : 'boolean_series', units: index === 2 ? '次数' : '布尔值',
        timeframe: '原平台逐 bar 状态，时点与窗口待核对', tags: ['人工样例', '内部状态'],
        parameters: index === 0 ? [{...base.parameters[0], name: 'anomalyMultiple', type: 'float', defaultValue: '', meaning: '异常阈值（人工样例，尚缺运行值）'}] : [], dependencies: ['内部状态更新定义待补齐'],
    }));
}
