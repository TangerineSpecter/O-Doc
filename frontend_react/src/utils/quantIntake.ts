import type {QuantMaterial} from '../types/api/quantIntake';
import {detectQuantLanguage} from './quantLanguage';

export const emptyMaterial = (): QuantMaterial => ({title: '', code: '', description: '', url: '', language: 'auto', platform: ''});
export const batchStatus: Record<string, string> = {pending: '排队中', running: '分析中', completed: '已完成', partial: '部分完成',
    archived: '仅归档', waiting_model: '等待模型', cancelled: '已停止', wall_budget: '达到时间上限', interrupted: '已中断',
    executor_failed: '执行器不可用', waiting: '等待分析', not_started: '未启动', rejected: '未能分析', failed: '失败'};

export function validateMaterials(items: QuantMaterial[]): string {
    if (!items.length || items.length > 20) return '每批需要 1–20 份资料。';
    for (const [index, item] of items.entries()) {
        if (![item.code, item.description, item.url].some(value => value.trim())) return `第 ${index + 1} 份资料为空。`;
        if (item.code.length > 150000 || item.description.length > 30000 || item.title.length > 255 || item.url.length > 2000) return `第 ${index + 1} 份资料超过字段上限。`;
        if (item.url) {
            try {const url = new URL(item.url); if (!['http:', 'https:'].includes(url.protocol)) return `第 ${index + 1} 份网址仅支持 HTTP/HTTPS。`;}
            catch {return `第 ${index + 1} 份网址格式无效。`;}
        }
    }
    if (new TextEncoder().encode(JSON.stringify(items)).byteLength > 1000000) return '单批资料总量不能超过 1 MB。';
    return '';
}

export function decodeSourceFile(bytes: ArrayBuffer, name: string, encoding = 'auto', allowParameterTable = false): QuantMaterial {
    if (bytes.byteLength > 600000) throw new Error(`${name} 超过单文件 600 KB 上限。`);
    const extension = name.split('.').pop()?.toLowerCase();
    const table = allowParameterTable && ['csv', 'tsv'].includes(extension || '');
    if (!table && !['py', 'pine', 'mq4', 'mqh', 'tdx', 'txt', 'md'].includes(extension || '')) throw new Error(allowParameterTable ? '请选择源文件或 .csv、.tsv 参数表。' : '请选择 .py、.pine、.mq4、.mqh、.tdx、.txt 或 .md 源文件。');
    const raw = new Uint8Array(bytes);
    const codec = encoding === 'auto' ? raw[0] === 0xff && raw[1] === 0xfe ? 'utf-16le' : raw[0] === 0xfe && raw[1] === 0xff ? 'utf-16be' : 'utf-8' : encoding;
    let text: string;
    try {text = new TextDecoder(codec, {fatal: true}).decode(raw);} catch {throw new Error(`${name} 无法按所选编码读取，请检查编码。`);}
    if (!text.trim() || text.includes('\0')) throw new Error(`${name} 为空或包含二进制内容。`);
    const material = {...emptyMaterial(), title: name, language: table ? 'text' as const : ({py: 'python', pine: 'pine', mq4: 'mql4', mqh: 'mql4'} as const)[extension as 'py'] || detectQuantLanguage(text)};
    if (extension === 'md') material.description = text;
    else material.code = text;
    const error = validateMaterials([material]);
    if (error) throw new Error(`${name}：${error}`);
    return material;
}
