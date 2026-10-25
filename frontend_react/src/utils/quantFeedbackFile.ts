import type {FeedbackFormat} from '../types/api/quantFeedback';

export function decodeFeedbackFile(bytes: ArrayBuffer, name: string, encoding = 'auto'): {document: string; documentFormat: FeedbackFormat} {
    if (bytes.byteLength > 240000) throw new Error('文件最多 240 KB，正文最多 60000 字符。');
    const ext = name.split('.').pop()?.toLowerCase();
    const raw = new Uint8Array(bytes);
    const codec = encoding === 'auto' ? raw[0] === 0xff && raw[1] === 0xfe ? 'utf-16le' : raw[0] === 0xfe && raw[1] === 0xff ? 'utf-16be' : 'utf-8' : encoding;
    let document: string;
    try {document = new TextDecoder(codec, {fatal: true}).decode(raw);} catch {throw new Error('无法按所选编码读取，请选择文件原有编码，或先转换为 UTF-8。');}
    if (!document.trim() || document.length > 60000 || document.includes('\0')) throw new Error('正文为空、包含二进制字符或超过 60000 字符，请检查文件或编码。');
    return {document, documentFormat: ext === 'set' ? 'mql_set' : ext === 'json' ? 'json' : ext === 'csv' ? 'csv' : ['html', 'htm'].includes(ext || '') ? 'html' : 'text'};
}
