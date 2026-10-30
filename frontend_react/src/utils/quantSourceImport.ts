import { detectQuantLanguage } from './quantLanguage';
import type { QuantIntakeInput } from '../types/api/quant';

export interface ImportedSource {
    code: string;
    language: QuantIntakeInput['language'];
}

export const SOURCE_IMPORT_LIMITS = {
    bytes: 600_000,
    characters: 150_000,
    byteMessage: '文件超过 600 KB，无法放入源码输入框。',
    characterMessage: '源码超过 150,000 字符，无法提交分析。',
} as const;
export const SOURCE_IMPORT_ACCEPT = '.py,.pyw,.pine,.pinescript,.mq4,.mqh,.tdx,.txt';

/** Decode locally; the File itself is never included in the intake request. */
export function decodeImportedSource(bytes: ArrayBuffer, name: string): ImportedSource {
    if (bytes.byteLength > SOURCE_IMPORT_LIMITS.bytes) throw new Error(SOURCE_IMPORT_LIMITS.byteMessage);
    const raw = new Uint8Array(bytes);
    const encoding = raw[0] === 0xff && raw[1] === 0xfe ? 'utf-16le'
        : raw[0] === 0xfe && raw[1] === 0xff ? 'utf-16be' : 'utf-8';
    let code: string;
    try {
        code = new TextDecoder(encoding, { fatal: true }).decode(raw);
    } catch {
        if (encoding !== 'utf-8') throw new Error('无法读取文件编码，请保存为 UTF-8 或 UTF-16 后重试。');
        try { code = new TextDecoder('gb18030', { fatal: true }).decode(raw); }
        catch { throw new Error('无法读取文件编码，请保存为 UTF-8 或 UTF-16 后重试。'); }
    }
    const hasControlCharacters = Array.from(code).some(character => {
        const value = character.charCodeAt(0);
        return value < 32 && value !== 9 && value !== 10 && value !== 13 || value === 127;
    });
    if (!code.trim() || hasControlCharacters) throw new Error('文件为空或不是可读取的文本源码。');
    if (Array.from(code).length > SOURCE_IMPORT_LIMITS.characters) throw new Error(SOURCE_IMPORT_LIMITS.characterMessage);
    const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
    const language = ext === 'py' || ext === 'pyw' ? 'python'
        : ext === 'pine' || ext === 'pinescript' ? 'pine'
        : ext === 'mq4' || ext === 'mqh' ? 'mql4'
        : ext === 'tdx' ? 'tongdaxin'
        : !ext || ext === 'txt' ? detectQuantLanguage(code) : 'text';
    return { code, language };
}
