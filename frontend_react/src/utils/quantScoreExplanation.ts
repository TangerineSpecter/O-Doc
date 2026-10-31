/** Parse only explicitly labelled model prose; never infer or rewrite a judgement. */
export function scoreSections(text: string, labels: readonly string[]): Record<string, string> | null {
    const result: Record<string, string> = {};
    let active = '';
    // Some models return the explicit labels in one paragraph instead of newlines.
    const paragraphs = text.trim().replace(/([。；])\s*(?=(?:优点|问题与影响|扣分说明|源码依据|验证情况)[：:])/g, '$1\n');
    for (const line of paragraphs.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:[-*]\s+)?(?:\*\*)?([^：:]+?)(?:\*\*)?\s*[：:]\s*(?:\*\*)?(.*)$/);
        if (match && labels.includes(match[1])) {
            if (Object.prototype.hasOwnProperty.call(result, match[1])) return null;
            active = match[1];
            result[active] = match[2].trimStart();
        } else if (active) {
            result[active] += '\n' + line;
        } else if (line.trim()) {
            return null;
        }
    }
    return labels.every(label => result[label]?.trim()) ? result : null;
}

export const scoreReasonLabels = ['优点', '问题与影响', '扣分说明'] as const;
export const scoreEvidenceLabels = ['源码依据', '验证情况'] as const;
