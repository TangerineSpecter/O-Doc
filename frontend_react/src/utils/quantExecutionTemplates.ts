import type {QuantExecutionAdapter} from '../types/api/quantPlatformEvidence';

export type ExecutionSample = 'reconciled' | 'mismatch' | 'partial' | 'invalid';
export function executionTemplate(adapter: QuantExecutionAdapter, sample?: ExecutionSample): string {
    const id = sample ? `LOCAL_EXECUTION_${sample.toUpperCase()}` : 'trade-1';
    const balance = sample === 'mismatch' ? '9980' : '9990';
    const profit = sample === 'invalid' ? 'not-a-decimal' : '-10';
    if (adapter === 'standard-execution-csv-v1') return `kind,id,timestamp,profit,profit_basis,commission,swap,fees,balance,equity,amount,symbol,side,volume\ntrade,${id},2026-01-01T00:00:00Z,${profit},net,,,,${balance},,,,buy,1\n`;
    if (adapter === 'mt4-tester-html-v1') return `${sample ? `<!-- ${id}: 人工流程样例，不是真实平台报告 -->\n` : ''}<html><body><table>\n<tr><td>Initial deposit</td><td>10000</td></tr>\n<tr><td>Total net profit</td><td>-10</td></tr>\n</table><table>\n<tr><th>#</th><th>Time</th><th>Type</th><th>Order</th><th>Size</th><th>Price</th><th>S / L</th><th>T / P</th><th>Profit</th><th>Balance</th></tr>\n<tr><td>1</td><td>2026.01.01 00:00</td><td>close</td><td>1</td><td>1</td><td>100</td><td>0</td><td>0</td><td>-10</td><td>${balance}</td></tr>\n</table></body></html>`;
    return JSON.stringify({version: 1, metadata: sample === 'partial' ? {currency: 'USD'} : {currency: 'USD', timezone: 'UTC', initial_balance: '10000', profit_basis: 'net', cash_flow_coverage: 'complete'}, parameters: [{name: 'N', value: '20', unit: ''}], reported_metrics: [{name: 'net_profit', value: '-10', unit: 'USD'}], records: [{kind: 'trade', id, timestamp: '2026-01-01T00:00:00Z', profit, balance}]}, null, 2);
}

export function decodeExecutionFile(bytes: ArrayBuffer, encoding = 'auto'): string {
    if (bytes.byteLength > 1024 * 1024) throw new Error('结构化执行文件最多 1 MiB。');
    const raw = new Uint8Array(bytes), codec = encoding === 'auto' ? raw[0] === 0xff && raw[1] === 0xfe ? 'utf-16le' : raw[0] === 0xfe && raw[1] === 0xff ? 'utf-16be' : 'utf-8' : encoding;
    let document: string;
    try {document = new TextDecoder(codec, {fatal: true}).decode(raw);} catch {throw new Error('无法按所选编码读取，请选择原有编码或先转换为 UTF-8。');}
    if (!document.trim() || document.includes('\0') || new TextEncoder().encode(document).byteLength > 1024 * 1024) throw new Error('执行原文为空、含二进制字符或 UTF-8 文本超过 1 MiB。');
    return document;
}
