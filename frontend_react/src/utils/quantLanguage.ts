import type { QuantLanguage } from '../types/api/quant';

/** Display hint only; the server independently detects and stores the source language. */
export function detectQuantLanguage(code: string): QuantLanguage | 'tongdaxin' | 'text' {
    if (/^\s*\/\/@version=\d+/m.test(code)) return 'pine';
    if (/^\s*(?:async\s+def|def|import|from)\s+\w+/m.test(code)) return 'python';
    if (/#property|\b(?:OnTick|OnCalculate|OrderSend)\s*\(|\b(?:extern|input)\s+(?:int|double|bool)\b/.test(code)) return 'mql4';
    if (/^\s*(?:indicator|study|strategy)\s*\(/m.test(code)) return 'pine';
    if (/:=|\b(?:DRAWICON|STICKLINE|DRAWTEXT)\s*\(/.test(code)) return 'tongdaxin';
    return 'text';
}
