import {HttpResponse} from 'msw';
import type {QuantDataset, QuantDatasetInput, QuantMarketRow} from '../../types/api/quantDataset';
import {persistQuantState, quantId, quantState} from './state';
export interface MockDataset {collection: string; input: QuantDatasetInput; data: QuantDataset}
const aliases: Record<string, string> = {date: 'timestamp', datetime: 'timestamp', time: 'timestamp', '日期': 'timestamp', '时间': 'timestamp', '开盘': 'open', '最高': 'high', '最低': 'low', '收盘': 'close', '成交量': 'volume'};
const columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume'] as const;
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
function csvRows(raw: string): string[][] {
    const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
    for (let i = 0; i < raw.length; i++) {
        const char = raw[i];
        if (char === '"') {
            if (quoted && raw[i + 1] === '"') {cell += '"'; i++;}
            else quoted = !quoted;
        } else if (char === ',' && !quoted) {row.push(cell); cell = '';}
        else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && raw[i + 1] === '\n') i++;
            row.push(cell); if (row.some(item => item.trim())) rows.push(row); row = []; cell = '';
        } else cell += char;
    }
    if (quoted) throw new Error('CSV 引号不匹配');
    row.push(cell); if (row.some(item => item.trim())) rows.push(row);
    return rows;
}
function time(value: string, zone: string): string {
    new Intl.DateTimeFormat('en-US', {timeZone: zone}).format(new Date());
    let instant: number;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const utc = Date.parse(value + 'T00:00:00Z');
        if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) throw new Error('日期无效');
        const formatter = new Intl.DateTimeFormat('en-US', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'});
        const parts = Object.fromEntries(formatter.formatToParts(new Date(utc)).map(part => [part.type, part.value]));
        const zoned = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
        instant = utc - (zoned - utc);
    } else {
        if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('时间须带时区偏移');
        instant = Date.parse(value);
    }
    if (!Number.isFinite(instant)) throw new Error('时间无效');
    return new Date(instant).toISOString();
}
function parse(input: QuantDatasetInput, id: string): QuantDataset {
    if (Object.values(input).some(value => typeof value !== 'string') || !input.name.trim() || input.name.length > 200 || !input.symbol.trim() || !input.timeframe.trim() || !input.timezone.trim()) throw new Error('请填写名称、标的、周期与时区');
    if (new TextEncoder().encode(input.csvText).length > 2 * 1024 * 1024) throw new Error('CSV 最多 2 MiB');
    const records = csvRows(input.csvText.replace(/^\ufeff/, ''));
    const headers = (records.shift() || []).map(key => aliases[key.trim().toLowerCase()] || key.trim().toLowerCase());
    if (headers.length !== new Set(headers).size || columns.slice(0, 5).some(column => !headers.includes(column))) throw new Error('需要唯一的 timestamp/open/high/low/close 列');
    if (records.length < 2 || records.length > 20000) throw new Error('需要 2–20,000 行行情');
    let previous = '';
    const rows = records.map(cells => {
        if (cells.length !== headers.length) throw new Error('CSV 列数不一致');
        const row = Object.fromEntries(headers.map((header, index) => [header, cells[index].trim()]));
        const timestamp = time(row.timestamp, input.timezone);
        if (timestamp <= previous) throw new Error('时间重复或未严格递增'); previous = timestamp;
        const numbers = Object.fromEntries(columns.slice(1).map(column => {
            if (!row[column] && column === 'volume') return [column, null];
            const value = Number(row[column]);
            if (!row[column] || !Number.isFinite(value) || (column === 'volume' ? value < 0 : value <= 0)) throw new Error('价格或成交量无效');
            return [column, value];
        })) as Omit<QuantMarketRow, 'timestamp'>;
        if (numbers.high < Math.max(numbers.open, numbers.close, numbers.low) || numbers.low > Math.min(numbers.open, numbers.close, numbers.high)) throw new Error('最高/最低价与开收盘矛盾');
        return {timestamp, ...numbers};
    });
    const missingVolume = rows.filter(row => row.volume === null).length;
    return {id, name: input.name.trim(), symbol: input.symbol.trim(), timeframe: input.timeframe.trim(), timezone: input.timezone.trim(), source: input.source, priceAdjustment: input.priceAdjustment,
        createdAt: new Date().toISOString(), contentHash: `local-demo-${id}`, rowCount: rows.length, start: rows[0].timestamp, end: rows[rows.length - 1].timestamp,
        missingVolume, warnings: ['本地模拟导入，未上传到真实后端', ...(!input.source ? ['数据来源未填写'] : []), ...(!input.priceAdjustment ? ['复权口径未填写'] : []), ...(missingVolume ? ['成交量存在缺失'] : [])],
        preview: rows.slice(0, 8), parserVersion: 1, timestampSemantics: 'bar_label', discardedColumns: headers.filter(header => !(columns as readonly string[]).includes(header))};
}
export function sampleDataset(): MockDataset {
    const input: QuantDatasetInput = {name: '演示行情 · 非真实数据', symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', source: '本地构造样例', priceAdjustment: '不适用',
        csvText: 'timestamp,open,high,low,close,volume\n2024-01-01,100,103,99,102,1000\n2024-01-02,102,104,101,103,1200\n2024-01-03,103,105,100,101,900'};
    return {collection: 'local-quant', input, data: parse(input, 'local-market-demo')};
}
/** Reuses the validated CSV's label/timezone semantics without evaluating prices. */
export function mockDatasetTimestamp(record: MockDataset, index: number): string {
    const records = csvRows(record.input.csvText.replace(/^\ufeff/, ''));
    const headers = records.shift()!.map(key => aliases[key.trim().toLowerCase()] || key.trim().toLowerCase());
    return time(records[index][headers.indexOf('timestamp')].trim(), record.input.timezone);
}
export async function resolveDatasetRoute(request: Request, collection: string, id?: string) {
    const all = quantState().datasets.filter(row => row.collection === collection);
    if (request.method === 'POST' && !id) {
        try {
            const input = await request.json() as QuantDatasetInput;
            const data = parse(input, quantId('dataset'));
            const existing = all.find(row => JSON.stringify(row.input) === JSON.stringify(input));
            if (existing) return existing.data;
            quantState().datasets.unshift({collection, input, data}); persistQuantState(); return data;
        } catch (cause) {return fail(400, cause instanceof Error ? cause.message : '行情导入无效');}
    }
    if (request.method !== 'GET') return fail(405, '不支持此操作');
    if (id) return all.find(row => row.data.id === id)?.data || fail(404, '行情不存在');
    const params = new URL(request.url).searchParams;
    const offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || 20);
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 40) return fail(400, '分页参数无效');
    return {total: all.length, items: all.slice(offset, offset + limit).map(row => row.data)};
}
